import assert from 'node:assert/strict';
import { runIsolated, getDatabase, artifactRoot } from '../../lib/server/db';
import { SupplierIdentity } from '../../lib/schemas';
import { resolveSupplierIdentity, IdentityProviders } from '../../services/supplierIdentityResolver';
import fs from 'node:fs';
import { NextRequest } from 'next/server';
import { switchRole, getUserFromToken } from '../../lib/server/auth';
import { evaluateWorkflow, readRecord } from '../../services/workflowService';
import { challengeCases } from '../../data/verification/challengeCases';
import { POST as parseDocument } from '../../app/api/documents/parse/route';
import { SHOPAIKEY_GEMINI_API_CONFIG } from '../../lib/constants';
import { mockLlmCompletion } from '../../tests/helpers/llm';

const A = '0104918404';
const B = '0100109106';
const LEGAL = 'CÔNG TY CỔ PHẦN DỊCH VỤ THƯƠNG MẠI TỔNG HỢP VINCOMMERCE';
const noProviders: IdentityProviders = { exact: async () => null, candidates: async () => [] };
function verified(code = A, name = LEGAL): SupplierIdentity {
  return { status: 'VERIFIED', legalName: name, supplierTaxCode: code,
    sources: [{ title: 'Hồ sơ chính thức', url: `https://gdt.gov.vn/record/${code}` }] };
}
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await runIsolated(fn); passed++; console.log(`PASS ${name}`);
}

async function main() {
  await test('Tên thương hiệu được nhớ kèm nguồn; lần sau không gọi API và giữ tên ảnh', async () => {
    let calls = 0;
    const search = async () => { calls++; return verified(); };
    const first = await resolveSupplierIdentity({ supplierName: 'VinCommerce' }, search, noProviders);
    const second = await resolveSupplierIdentity({ supplierName: 'VinCommerce' }, search, noProviders);
    assert.equal(first.status, 'VERIFIED'); assert.equal(second.lookupMethod, 'LOCAL_VERIFIED');
    assert.equal(second.originalSupplierName, 'VinCommerce'); assert.equal(second.legalName, LEGAL);
    assert.equal(calls, 1); assert.ok(second.verifiedAt);
    assert.equal((getDatabase().prepare('SELECT count(*) n FROM supplier_identity_history').get() as { n: number }).n, 1);
  });
  await test('MST chính xác dùng dữ liệu thuế có cấu trúc, không gọi AI', async () => {
    let searches = 0;
    const providers: IdentityProviders = { ...noProviders, exact: async code => ({
      taxCode: code, legalName: LEGAL, source: 'XINVOICE_TAX_API', confidence: 1, isVerified: true,
      sourceUpdatedAt: new Date().toISOString(), evidenceUrl: `https://api.xinvoice.vn/gdt-api/tax-payer/${code}`
    }) };
    const result = await resolveSupplierIdentity({ supplierTaxCode: A }, async () => { searches++; return verified(); }, providers);
    assert.equal(result.lookupMethod, 'TAX_REGISTRY'); assert.equal(searches, 0);
    assert.equal(result.originalSupplierTaxCode, A);
  });
  await test('MST mâu thuẫn với alias không được ghi đè', async () => {
    await resolveSupplierIdentity({ supplierName: 'VinCommerce' }, async () => verified(), noProviders);
    const result = await resolveSupplierIdentity({ supplierName: 'VinCommerce', supplierTaxCode: B }, async () => { throw new Error('must not search'); }, noProviders);
    assert.equal(result.status, 'CONFLICT'); assert.equal(result.originalSupplierTaxCode, B);
    assert.equal(result.supplierTaxCode, A);
  });
  await test('Tên sai không được tự gán chỉ vì MST tra cứu có kết quả', async () => {
    let searches = 0;
    const providers: IdentityProviders = { ...noProviders, exact: async () => ({
      taxCode: A, legalName: LEGAL, source: 'XINVOICE_TAX_API', confidence: 1, isVerified: true,
      sourceUpdatedAt: new Date().toISOString(), evidenceUrl: 'https://api.xinvoice.vn/gdt-api/tax-payer/' + A
    }) };
    const result = await resolveSupplierIdentity({ supplierName: 'Một doanh nghiệp khác', supplierTaxCode: A }, async () => {
      searches++; return { status: 'CONFLICT', sources: [] };
    }, providers);
    assert.equal(result.status, 'CONFLICT'); assert.equal(searches, 1);
  });
  await test('Thương hiệu chung nhiều chi nhánh: địa chỉ phân biệt, thiếu địa chỉ không tự chọn', async () => {
    await resolveSupplierIdentity({ supplierName: 'Chuỗi ABC', address: '10 Hà Nội' }, async () => verified(A, 'Công ty ABC Miền Bắc'), noProviders);
    await resolveSupplierIdentity({ supplierName: 'Chuỗi ABC', address: '20 Hồ Chí Minh' }, async () => verified(B, 'Công ty ABC Miền Nam'), noProviders);
    const ambiguous = await resolveSupplierIdentity({ supplierName: 'Chuỗi ABC' }, async () => { throw new Error('must not search'); }, noProviders);
    assert.equal(ambiguous.status, 'AMBIGUOUS');
    const southern = await resolveSupplierIdentity({ supplierName: 'Chuỗi ABC', address: '20 Hồ Chí Minh' }, async () => { throw new Error('must not search'); }, noProviders);
    assert.equal(southern.supplierTaxCode, B);
  });
  await test('Alias cửa hàng không được tái dùng cho địa chỉ khác', async () => {
    await resolveSupplierIdentity({ supplierName: 'Cửa hàng ABC', address: '10 Hà Nội' }, async () => verified(), noProviders);
    let searches = 0;
    const result = await resolveSupplierIdentity({ supplierName: 'Cửa hàng ABC', address: '11 Hà Nội' }, async () => {
      searches++; return { status: 'NOT_FOUND', sources: [] };
    }, noProviders);
    assert.equal(searches, 1); assert.equal(result.status, 'NOT_FOUND');
  });
  await test('Cache hết hạn được tra lại; giữ lịch sử tên cũ khi pháp nhân đổi tên', async () => {
    await resolveSupplierIdentity({ supplierName: 'VinCommerce' }, async () => verified(), noProviders);
    getDatabase().prepare('UPDATE supplier_identity_records SET expires_at=0').run();
    let searches = 0;
    const result = await resolveSupplierIdentity({ supplierName: 'VinCommerce' }, async () => {
      searches++; return verified(A, LEGAL.replace('VINCOMMERCE', 'WINCOMMERCE'));
    }, noProviders);
    assert.equal(searches, 1); assert.ok(result.legalName?.endsWith('WINCOMMERCE'));
    assert.equal((getDatabase().prepare('SELECT count(*) n FROM supplier_identity_history').get() as { n: number }).n, 2);
    const historical = await resolveSupplierIdentity({ supplierName: LEGAL }, async () => { throw new Error('must not search'); }, noProviders);
    assert.equal(historical.lookupMethod, 'LOCAL_VERIFIED'); assert.equal(historical.supplierTaxCode, A);
  });
  await test('Hai yêu cầu cùng phiên đồng thời chỉ gọi API một lần', async () => {
    let calls = 0;
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const search = async () => { calls++; await wait; return verified(); };
    const first = resolveSupplierIdentity({ supplierName: 'VinCommerce' }, search, noProviders);
    const second = resolveSupplierIdentity({ supplierName: 'VinCommerce' }, search, noProviders);
    release();
    const results = await Promise.all([first, second]);
    assert.equal(calls, 1); assert.ok(results.every(result => result.status === 'VERIFIED'));
  });
  await test('Phiên độc lập không đọc cache hay gộp lời gọi của nhau', async () => {
    let calls = 0;
    const search = async () => { calls++; return verified(); };
    await resolveSupplierIdentity({ supplierName: 'VinCommerce' }, search, noProviders);
    await runIsolated(async () => {
      const result = await resolveSupplierIdentity({ supplierName: 'VinCommerce' }, search, noProviders);
      assert.equal(result.lookupMethod, 'SEARCH_GROUNDING');
    });
    assert.equal(calls, 2);
  });
  await test('Dữ liệu master nhập tay không được dùng làm danh tính đã xác minh', async () => {
    getDatabase().prepare(`INSERT INTO supplier_master
      (tax_code,legal_name,status,risk_level,last_verified_at,verification_source,created_at,updated_at)
      VALUES (?,?,'ACTIVE','LOW',?,'MANUAL',?,?)`).run(A, LEGAL, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
    const result = await resolveSupplierIdentity({ supplierName: LEGAL }, async () => ({ status: 'NOT_FOUND', sources: [] }), noProviders);
    assert.equal(result.status, 'NOT_FOUND');
  });
  await test('Lỗi tạm thời được cache ngắn, không lặp gọi API liên tục', async () => {
    let calls = 0;
    const search = async (): Promise<SupplierIdentity> => { calls++; return { status: 'SOURCE_UNAVAILABLE', sources: [] }; };
    await resolveSupplierIdentity({ supplierName: 'NCC mới' }, search, noProviders);
    await resolveSupplierIdentity({ supplierName: 'NCC mới' }, search, noProviders);
    assert.equal(calls, 1);
  });
  await test('Ứng viên theo tên phải được kiểm chứng bằng MST từ dữ liệu thuế', async () => {
    let searches = 0;
    const result = await resolveSupplierIdentity({ supplierName: LEGAL }, async () => { searches++; return { status: 'NOT_FOUND', sources: [] }; }, {
      candidates: async () => [{ taxCode: A, legalName: LEGAL }],
      exact: async code => ({ taxCode: code, legalName: LEGAL, source: 'XINVOICE_TAX_API', confidence: 1, isVerified: true,
        sourceUpdatedAt: new Date().toISOString(), evidenceUrl: `https://api.xinvoice.vn/gdt-api/tax-payer/${code}` })
    });
    assert.equal(result.status, 'VERIFIED'); assert.equal(result.lookupMethod, 'TAX_REGISTRY'); assert.equal(searches, 0);
  });
  await test('Trùng tên được phân biệt bằng địa chỉ từ dữ liệu thuế, không tin địa chỉ danh bạ', async () => {
    const result = await resolveSupplierIdentity({ supplierName: 'Công ty ABC', address: '10 Hà Nội' }, async () => {
      throw new Error('must not search');
    }, {
      candidates: async () => [{ taxCode: A, legalName: 'Công ty ABC', address: 'Địa chỉ sai' }, { taxCode: B, legalName: 'Công ty ABC' }],
      exact: async code => ({ taxCode: code, legalName: 'Công ty ABC', address: code === A ? '10 Hà Nội' : '20 Hồ Chí Minh',
        source: 'XINVOICE_TAX_API', confidence: 1, isVerified: true, sourceUpdatedAt: new Date().toISOString(),
        evidenceUrl: `https://api.xinvoice.vn/gdt-api/tax-payer/${code}` })
    });
    assert.equal(result.status, 'VERIFIED'); assert.equal(result.supplierTaxCode, A);
  });
  await test('Cache không kéo dài dữ liệu nguồn vượt quá hạn 30 ngày', async () => {
    const updatedAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    await resolveSupplierIdentity({ supplierTaxCode: A }, async () => { throw new Error('must not search'); }, {
      ...noProviders, exact: async code => ({ taxCode: code, legalName: LEGAL, source: 'XINVOICE_TAX_API', confidence: 1,
        isVerified: true, sourceUpdatedAt: updatedAt, evidenceUrl: `https://api.xinvoice.vn/gdt-api/tax-payer/${code}` })
    });
    const row = getDatabase().prepare('SELECT expires_at FROM supplier_identity_records WHERE tax_code=?').get(A) as { expires_at: number };
    assert.equal(row.expires_at, Date.parse(updatedAt) + 30 * 24 * 60 * 60 * 1000);
  });
  await test('Ảnh đến API: tự điền MST/tên, giữ dữ liệu ảnh, đọc lại không gọi Vision', async () => {
    const artifacts = artifactRoot();
    const originalFetch = globalThis.fetch;
    const originalKey = SHOPAIKEY_GEMINI_API_CONFIG.API_KEY;
    SHOPAIKEY_GEMINI_API_CONFIG.API_KEY = 'qa-mocked-only';
    let visionCalls = 0; let searchCalls = 0;
    let unavailable = false;
    globalThis.fetch = async (_input, init) => {
      if (String(_input).startsWith('https://gdt.gov.vn/record/')) {
        return new Response(`${LEGAL} MST ${A}`, {headers: {'Content-Type': 'text/plain'}});
      }
      const request = JSON.parse(String(init?.body));
      if (Array.isArray(request.messages[0].content)) {
        visionCalls++;
        return mockLlmCompletion({
          documentType: 'INVOICE', invoice: { supplierName: 'VinCommerce', invoiceNumber: 'A001',
            invoiceDate: '2026-10-12', itemName: 'Văn phòng phẩm', preTaxAmount: 100000,
            totalAmount: 100000, taxAmount: 0, taxRate: 0 }
        });
      }
      searchCalls++;
      return mockLlmCompletion({
        decision: unavailable ? 'NO_MATCH' : 'MATCH', selectedTaxCode: unavailable ? null : A,
        candidates: unavailable ? [] : [{ legalName: LEGAL, taxCode: A, sourceUrl: 'https://gdt.gov.vn/record/' + A }]
      });
    };
    try {
      const session = switchRole('ACCOUNTANT')!;
      const upload = async () => {
        const form = new FormData();
        form.append('file', new File([fs.readFileSync('docs/qa-2026-10-10/fixtures/clear.png')], 'test.png', { type: 'image/png' }));
        return (await parseDocument(new NextRequest('http://localhost/api/documents/parse', {
          method: 'POST', headers: { cookie: `tax_referee_session=${session.token}` }, body: form
        }))).json();
      };
      const first = await upload();
      assert.equal(first.invoice.supplierName, LEGAL);
      assert.equal(first.invoice.supplierTaxCode, A);
      assert.equal(first.supplierIdentity.originalSupplierName, 'VinCommerce');
      assert.equal(first.fieldEvidence.supplierTaxCode.source, 'OFFICIAL_REGISTRY');
      const cached = await upload();
      assert.equal(cached.performance.cacheHit, true);
      assert.equal(cached.supplierIdentity.lookupMethod, 'LOCAL_VERIFIED');
      assert.equal(visionCalls, 1); assert.equal(searchCalls, 1);
      const row = getDatabase().prepare('SELECT payload_json FROM extraction_reviews WHERE artifact_id=?').get(first.artifactId) as { payload_json: string };
      assert.equal(JSON.parse(row.payload_json).invoice.supplierName, 'VinCommerce');
      await evaluateWorkflow({ ...challengeCases[0].invoice, ...first.invoice, id: 'RESOLVER-QA',
        sourceArtifactId: first.artifactId, sourceHash: first.sourceHash }, getUserFromToken(session.token)!, { forceLocalOnly: true });
      const review = JSON.parse(readRecord('RESOLVER-QA').source_review_json);
      assert.equal(review.supplierIdentity.supplierTaxCode, A);
      assert.equal(review.supplierIdentity.originalSupplierName, 'VinCommerce');
      assert.equal(review.sourceValues.supplierName, 'VinCommerce');
      assert.ok(!review.unresolvedFields.includes('supplierTaxCode'));
      assert.ok(!review.unresolvedFields.includes('supplierName'));
      getDatabase().prepare('UPDATE supplier_identity_records SET expires_at=0').run();
      unavailable = true;
      const expired = await upload();
      assert.equal(expired.invoice.supplierName, 'VinCommerce');
      assert.equal(expired.invoice.supplierTaxCode, '');
      assert.notEqual(expired.supplierIdentity.status, 'VERIFIED');
      assert.equal(visionCalls, 1);
    } finally {
      globalThis.fetch = originalFetch; SHOPAIKEY_GEMINI_API_CONFIG.API_KEY = originalKey;
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });
  console.log(`${passed} kiểm tra đối chiếu danh tính đạt; không gọi nhà cung cấp thật.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
