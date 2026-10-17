import assert from 'node:assert/strict';
import { SHOPAIKEY_GEMINI_API_CONFIG } from '../../lib/constants';
import { searchOfficialSupplierIdentity as lookupOfficialSupplierIdentity } from '../../services/officialSupplierLookupService';
import { mockLlmCompletion } from '../../tests/helpers/llm';

const CODE_A = '0100109106';
const CODE_B = '0101243150';
const VINCOMMERCE_CODE = '0104918404';
const NAME_A = 'Công ty Cổ phần Sao Mai';
const NAME_B = 'Công ty TNHH Sao Mai Miền Nam';
const HOST = 'https://tracuunnt.gdt.gov.vn/tcnnt/mstdn.jsp';
let passed = 0;

interface SearchFixture {
  decision?: string;
  selected?: string | null;
  rows?: Array<{ legalName: string; taxCode: string }>;
  sources?: Array<{ uri: string; title?: string }>;
  supportTexts?: string[];
}

function responseFor(options: SearchFixture): Response {
  const sources = options.sources || [{ uri: HOST, title: 'Tra cứu người nộp thuế - Cục Thuế' }];
  return mockLlmCompletion({
    decision: options.decision || 'MATCH',
    selectedTaxCode: options.selected === undefined ? (options.rows || [])[0]?.taxCode || null : options.selected,
    candidates: (options.rows || []).map((row, index) => ({ ...row, sourceUrl: sources[index % sources.length].uri }))
  });
}

function mockSearch(options: SearchFixture, inspect?: (input: RequestInfo | URL, init?: RequestInit) => void): typeof fetch {
  const sources = options.sources || [{ uri: HOST }];
  const texts = options.supportTexts || (options.rows || []).map(row => `${row.legalName}, mã số thuế ${row.taxCode}`);
  return async (input, init) => {
    const url = String(input);
    if (url === SHOPAIKEY_GEMINI_API_CONFIG.ENDPOINT) {
      inspect?.(input, init);
      return responseFor(options);
    }
    assert.equal(new Headers(init?.headers).has('authorization'), false, 'không chuyển khóa LLM tới nguồn nhà nước');
    assert.equal(init?.redirect, 'error');
    const text = texts.filter((_text, index) => sources[index % sources.length].uri === url).join('\n');
    return new Response(text, {status: 200, headers: {'Content-Type': 'text/plain'}});
  };
}

async function main() {
  const previousFetch = globalThis.fetch;
  const previousKey = SHOPAIKEY_GEMINI_API_CONFIG.API_KEY;
  SHOPAIKEY_GEMINI_API_CONFIG.API_KEY = 'qa-mocked-only';
  try {
    let requestCount = 0;
    globalThis.fetch = mockSearch({ rows: [{ legalName: NAME_A, taxCode: CODE_A }] }, (input, init) => {
      requestCount++;
      const url = new URL(String(input));
      assert.equal(url.toString(), SHOPAIKEY_GEMINI_API_CONFIG.ENDPOINT);
      assert.equal(url.searchParams.get('key'), null);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer qa-mocked-only');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, SHOPAIKEY_GEMINI_API_CONFIG.MODEL);
      assert.equal(body.stream, false);
    });
    const verified = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' });
    assert.equal(verified.status, 'VERIFIED');
    assert.equal(verified.legalName, NAME_A);
    assert.equal(verified.supplierTaxCode, CODE_A);
    assert.equal(verified.sources[0]?.url, HOST);
    assert.equal(requestCount, 1);
    console.log('PASS chấp nhận đúng một ứng viên có trích dẫn chính thức hỗ trợ tên và MST');
    passed++;

    const governmentPortal = 'https://sct.hue.gov.vn/Root/OldData/vincommerce.pdf';
    globalThis.fetch = mockSearch({
      rows: [{ legalName: 'CÔNG TY CỔ PHẦN DỊCH VỤ THƯƠNG MẠI TỔNG HỢP VINCOMMERCE', taxCode: VINCOMMERCE_CODE }],
      sources: [{ uri: governmentPortal, title: 'Sở Công Thương - Cổng thông tin điện tử' }]
    });
    const brandMatch = await lookupOfficialSupplierIdentity({ supplierName: 'VinCommerce' });
    assert.equal(brandMatch.status, 'VERIFIED');
    assert.equal(brandMatch.legalName, 'CÔNG TY CỔ PHẦN DỊCH VỤ THƯƠNG MẠI TỔNG HỢP VINCOMMERCE');
    assert.equal(brandMatch.supplierTaxCode, VINCOMMERCE_CODE);
    assert.equal(brandMatch.sources[0]?.url, governmentPortal);
    console.log('PASS tìm và chuẩn hóa tên thương hiệu từ cổng chính thức .gov.vn');
    passed++;

    globalThis.fetch = mockSearch({
      rows: [{ legalName: NAME_A, taxCode: CODE_A }],
      sources: [{ uri: `https://www.google.com/url?q=${encodeURIComponent(HOST)}`, title: 'Tra cứu người nộp thuế - Cục Thuế' }]
    });
    const redirectedSource = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' });
    assert.equal(redirectedSource.status, 'NOT_FOUND');
    assert.equal(redirectedSource.sources.length, 0);
    console.log('PASS chỉ nhận URL nguồn trực tiếp, không dùng URL chuyển hướng Google do AI đề xuất');
    passed++;

    const signedGroundingUrl = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/test-signed-link';
    let sourceRequests = 0;
    globalThis.fetch = async (input) => {
      if (String(input) !== SHOPAIKEY_GEMINI_API_CONFIG.ENDPOINT) sourceRequests++;
      return responseFor({ rows: [{ legalName: NAME_A, taxCode: CODE_A }], sources: [{ uri: signedGroundingUrl }] });
    };
    assert.equal((await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' })).status, 'NOT_FOUND');
    assert.equal(sourceRequests, 0);
    console.log('PASS từ chối liên kết grounding gián tiếp chưa có URL nguồn chính thức');
    passed++;

    globalThis.fetch = async (input) => String(input) === SHOPAIKEY_GEMINI_API_CONFIG.ENDPOINT
      ? responseFor({ rows: [{ legalName: NAME_A, taxCode: CODE_A }] })
      : new Response(null, { status: 302, headers: { location: 'https://evil.example/record' } });
    assert.equal((await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' })).status, 'NOT_FOUND');
    console.log('PASS từ chối trang nguồn chuyển hướng ra ngoài miền chính thức');
    passed++;

    globalThis.fetch = mockSearch({ rows: [{ legalName: NAME_A, taxCode: CODE_A }] });
    const conflict = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai', supplierTaxCode: '0101243150' });
    assert.equal(conflict.status, 'CONFLICT');
    assert.equal(conflict.supplierTaxCode, CODE_A);
    console.log('PASS đánh dấu mâu thuẫn thay vì ghi đè MST in trên hóa đơn');
    passed++;

    globalThis.fetch = mockSearch({
      rows: [{ legalName: NAME_A, taxCode: CODE_A }, { legalName: NAME_B, taxCode: CODE_B }]
    });
    const ambiguous = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' });
    assert.equal(ambiguous.status, 'AMBIGUOUS');
    assert.equal(ambiguous.sources.length, 1);
    console.log('PASS không tự điền khi có nhiều ứng viên chính thức');
    passed++;

    globalThis.fetch = mockSearch({
      rows: [{ legalName: NAME_A, taxCode: CODE_A }],
      sources: [{ uri: 'https://gdt.gov.vn.evil.example/search', title: 'Fake tax portal' }]
    });
    const outsideHost = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' });
    assert.equal(outsideHost.status, 'NOT_FOUND');
    assert.equal(outsideHost.sources.length, 0);
    console.log('PASS từ chối tên miền giả mạo có chuỗi gdt.gov.vn');
    passed++;

    globalThis.fetch = mockSearch({
      rows: [{ legalName: NAME_A, taxCode: '0100109107' }]
    });
    const invalidCode = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' });
    assert.equal(invalidCode.status, 'NOT_FOUND');
    console.log('PASS từ chối MST không vượt qua kiểm tra định dạng/chữ số');
    passed++;

    globalThis.fetch = mockSearch({
      rows: [{ legalName: NAME_A, taxCode: CODE_A }],
      supportTexts: [`${NAME_A} có mã số thuế 9999999999`]
    });
    const unsupportedCode = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' });
    assert.equal(unsupportedCode.status, 'NOT_FOUND');
    console.log('PASS từ chối ứng viên không được citation hỗ trợ MST');
    passed++;

    globalThis.fetch = mockSearch({
      rows: [{ legalName: NAME_A, taxCode: CODE_A }],
      supportTexts: [`${NAME_A} có mã số thuế ${CODE_A}-001`]
    });
    assert.equal((await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' })).status, 'NOT_FOUND');
    console.log('PASS MST chi nhánh không được dùng làm bằng chứng cho MST công ty mẹ');
    passed++;

    globalThis.fetch = mockSearch({
      rows: [{ legalName: NAME_A, taxCode: CODE_A }],
      sources: [{ uri: `https://evil.example/?q=${encodeURIComponent(HOST)}` }]
    });
    assert.equal((await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' })).status, 'NOT_FOUND');
    console.log('PASS không giải tham số URL đích của một website giả thành nguồn chính thức');
    passed++;

    globalThis.fetch = mockSearch({
      rows: [{ legalName: NAME_A, taxCode: CODE_A }],
      sources: [{ uri: HOST }, { uri: 'https://gdt.gov.vn/unrelated' }],
      supportTexts: [NAME_A, `Doanh nghiệp khác có MST ${CODE_A}`]
    });
    assert.equal((await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' })).status, 'NOT_FOUND');
    console.log('PASS tên và MST ở hai hồ sơ khác nhau không tạo thành một danh tính');
    passed++;

    globalThis.fetch = async () => { throw new Error('network unavailable'); };
    const networkFailure = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' });
    assert.equal(networkFailure.status, 'SOURCE_UNAVAILABLE');
    console.log('PASS trả trạng thái SOURCE_UNAVAILABLE khi lỗi mạng');
    passed++;

    SHOPAIKEY_GEMINI_API_CONFIG.API_KEY = '';
    let unexpectedCall = false;
    globalThis.fetch = async () => { unexpectedCall = true; throw new Error('should not call'); };
    const noKey = await lookupOfficialSupplierIdentity({ supplierName: 'Sao Mai' });
    assert.equal(noKey.status, 'SOURCE_UNAVAILABLE');
    assert.equal(unexpectedCall, false);
    console.log('PASS trả unavailable khi thiếu DEV_LLM_API_KEY');
    passed++;
  } finally {
    SHOPAIKEY_GEMINI_API_CONFIG.API_KEY = previousKey;
    globalThis.fetch = previousFetch;
  }
  console.log(`${passed} kiểm tra tra cứu nhà cung cấp đạt.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
