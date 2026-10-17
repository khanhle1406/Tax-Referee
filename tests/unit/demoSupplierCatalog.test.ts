import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { DemoSupplier, demoSupplierCatalogPath, lookupDemoSupplier, writeDemoSupplierCatalog } from '../../lib/server/demoSupplierCatalog';
import { isDemoSession, runIsolated, withDemoDatabase } from '../../lib/server/db';
import { resolveSupplierIdentity } from '../../services/supplierIdentityResolver';
import { DEV_LLM_API_CONFIG } from '../../lib/constants';
import { switchRole } from '../../lib/server/auth';
import { POST as parseDocument } from '../../app/api/documents/parse/route';
import { DocumentExtractionSchema } from '../../lib/schemas';
import { makePdfFixture } from '../helpers/pdf';
import { mockLlmCompletion } from '../helpers/llm';

function supplier(id: string, taxCode: string, aliases: string[]): DemoSupplier {
  return {id, name: `CÔNG TY THỬ NGHIỆM ${id}`, taxCode, aliases, files: [`synthetic-${id}.xml`],
    sourceKind: 'XML_FIXTURE', note: 'Dữ liệu tổng hợp kiểm thử',
    sources: [{title: 'Mẫu tổng hợp', url: 'https://example.invalid/synthetic'}]};
}
const entries: DemoSupplier[] = [
  supplier('A', '0100000001', ['Nhà bán A', 'Tên trùng']),
  supplier('B', '0100000001-001', ['Chi nhánh B']),
  supplier('C', '0100109106', ['Nhà bán C', 'Tên trùng'])
];

before(() => {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.ok(process.env.TAX_REFEREE_DATA_DIR, 'Chạy bằng TAX_REFEREE_DATA_DIR tạm, không ghi vào dữ liệu ứng dụng');
  assert.equal(writeDemoSupplierCatalog(entries), entries.length);
});

test('danh mục chỉ có trong phiên demo thật, không lộ vào nội bộ hoặc runner độc lập', async () => {
  assert.equal(isDemoSession(), false);
  assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán A'}), null);
  await runIsolated(async () => {
    assert.equal(isDemoSession(), false);
    assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán A'}), null);
  });
  await withDemoDatabase(crypto.randomUUID(), async () => {
    assert.equal(isDemoSession(), true);
    assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán A'})?.status, 'DEMO_MATCH');
    await runIsolated(async () => { assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán A'}), null); });
    assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán A'})?.status, 'DEMO_MATCH');
  });
});

test('bí danh khớp chính xác sau chuẩn hóa dấu, không suy diễn bằng tên gần giống', async () => {
  await withDemoDatabase(crypto.randomUUID(), async () => {
    const match = lookupDemoSupplier({supplierName: '  NHA BAN A  '});
    assert.equal(match?.legalName, entries[0].name);
    assert.equal(match?.supplierTaxCode, entries[0].taxCode);
    assert.equal(match?.status, 'DEMO_MATCH');
    assert.equal(match?.lookupMethod, 'DEMO_CATALOG');
    assert.deepEqual(match?.sources, entries[0].sources);
    assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán'}), null);
    assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán A mở rộng'}), null);
  });
});

test('MST chi nhánh không bị cắt thành MST công ty mẹ khi tra danh mục', async () => {
  await withDemoDatabase(crypto.randomUUID(), async () => {
    assert.equal(lookupDemoSupplier({supplierTaxCode: '0100000001001'})?.legalName, entries[1].name);
    assert.equal(lookupDemoSupplier({supplierTaxCode: '0100000001-001'})?.supplierTaxCode, '0100000001-001');
    assert.equal(lookupDemoSupplier({supplierTaxCode: '0100000001'})?.legalName, entries[0].name);
    assert.equal(lookupDemoSupplier({supplierTaxCode: '0100000001-002'}), null);
  });
});

test('MST đọc được khác tên không được ghi đè kể cả khi danh mục có bí danh phù hợp', async () => {
  await withDemoDatabase(crypto.randomUUID(), async () => {
    for (const supplierTaxCode of ['0100109106', '9999999999', 'không hợp lệ']) {
      const identity = lookupDemoSupplier({supplierName: 'Nhà bán A', supplierTaxCode});
      assert.equal(identity?.status, 'CONFLICT');
      assert.equal(identity?.supplierTaxCode, undefined);
      assert.equal(identity?.legalName, undefined);
    }
  });
});

test('bí danh nhiều đơn vị giữ mơ hồ; MST chính xác mới phân biệt được đơn vị', async () => {
  await withDemoDatabase(crypto.randomUUID(), async () => {
    assert.equal(lookupDemoSupplier({supplierName: 'Tên trùng'})?.status, 'AMBIGUOUS');
    assert.equal(lookupDemoSupplier({supplierName: 'Tên trùng', supplierTaxCode: entries[2].taxCode})?.legalName, entries[2].name);
  });
});

test('resolver dùng danh mục demo không gọi mạng và không đánh dấu xác minh chính thức', async () => {
  await withDemoDatabase(crypto.randomUUID(), async () => {
    const identity = await resolveSupplierIdentity({supplierName: 'Nhà bán A'}, async () => {
      assert.fail('khớp danh mục không cần gọi mạng');
    });
    assert.equal(identity.status, 'DEMO_MATCH');
    assert.equal(identity.originalSupplierName, 'Nhà bán A');
    assert.equal(identity.supplierTaxCode, entries[0].taxCode);
    assert.notEqual(identity.status, 'VERIFIED');
  });
});

test('API tự điền danh mục demo nhưng giữ trường cần rà soát cả lần đầu và cache', async () => {
  await withDemoDatabase(crypto.randomUUID(), async () => {
    const originalFetch = globalThis.fetch;
    const key = DEV_LLM_API_CONFIG.API_KEY;
    DEV_LLM_API_CONFIG.API_KEY = 'synthetic-catalog-test-key';
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return mockLlmCompletion({documentType: 'INVOICE', invoice: {
        invoiceNumber: 'DEMO-CATALOG-TEST', invoiceDate: '2026-10-17', supplierName: 'Nhà bán A',
        itemName: 'Văn phòng phẩm', preTaxAmount: 100000, taxRate: 8, taxAmount: 8000, totalAmount: 108000
      }});
    };
    try {
      const session = switchRole('ACCOUNTANT')!;
      const pdf = makePdfFixture([['SYNTHETIC DEMO CATALOG TEST']]);
      for (let attempt = 0; attempt < 2; attempt++) {
        const form = new FormData();
        form.append('file', new File([new Uint8Array(pdf)], 'synthetic-catalog.pdf', {type: 'application/pdf'}));
        const response = await parseDocument(new NextRequest('http://localhost/api/documents/parse', {
          method: 'POST', headers: {cookie: `tax_referee_session=${session.token}`}, body: form
        }));
        assert.equal(response.status, 200);
        const parsed = DocumentExtractionSchema.parse(await response.json());
        assert.equal(parsed.supplierIdentity?.status, 'DEMO_MATCH');
        assert.equal(parsed.invoice.supplierTaxCode, entries[0].taxCode);
        assert.equal(parsed.invoice.supplierName, entries[0].name);
        assert.equal(parsed.needsReview, true);
        for (const field of ['supplierName', 'supplierTaxCode']) {
          assert.ok(parsed.uncertainFields.includes(field));
          assert.notEqual(parsed.fieldEvidence?.[field]?.status, 'VERIFIED');
          assert.notEqual(parsed.fieldEvidence?.[field]?.source, 'OFFICIAL_REGISTRY');
        }
      }
      assert.equal(calls, 1, 'cache giữ kết quả đọc và vẫn giữ ranh giới danh mục demo');
    } finally { globalThis.fetch = originalFetch; DEV_LLM_API_CONFIG.API_KEY = key; }
  });
});

test('ghi danh mục có kiểm tra schema trước khi cập nhật dữ liệu', () => {
  assert.throws(() => writeDemoSupplierCatalog([{...entries[0], sources: []}], `${demoSupplierCatalogPath()}.invalid`));
});

test('nạp lại danh mục loại fixture đã gỡ, không để NCC giả tiếp tục tự điền', async () => {
  writeDemoSupplierCatalog([...entries, supplier('REMOVED', '0100000002', ['Nhà bán đã gỡ'])]);
  writeDemoSupplierCatalog(entries);
  await withDemoDatabase(crypto.randomUUID(), async () => {
    assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán đã gỡ'}), null);
    assert.equal(lookupDemoSupplier({supplierName: 'Nhà bán A'})?.supplierTaxCode, entries[0].taxCode);
  });
  assert.throws(() => writeDemoSupplierCatalog([]), 'không được xóa danh mục bằng file nguồn rỗng');
});
