import assert from 'node:assert/strict';
import { DEV_LLM_API_CONFIG } from '../../lib/constants';
import { mockLlmCompletion } from '../../tests/helpers/llm';
import { autoEnrichSupplierData, companyNameMatches, lookupByName, lookupByTaxCode, normalizeCompanyName, recordConfirmedSupplierAlias, validateTaxCode } from '../../services/taxLookupService';
import { getDatabase, runIsolated } from '../../lib/server/db';
import { parseReceiptEntities } from '../../lib/receiptEntityParser';
import { parseXml, sanitizeInvoice } from '../../lib/documentParser';
import { parseInvoiceFromRawText } from '../../lib/rawTextParser';
import { evaluateWorkflow } from '../../services/workflowService';
import { challengeCases } from '../../data/verification/challengeCases';
import { seedDefaultSuppliers } from '../../services/supplierService';
import { InvoiceInputSchema, SupplierMasterSchema } from '../../lib/schemas';
import { mergeOcrSemanticCandidates } from '../../services/qwenService';
import { assessLocalOcr } from '../../services/receiptOcrService';

let supplierGroundingMockCalls = 0;
let latestSupplierGroundingPrompt = '';

function mockSupplierIdentityAi(input: RequestInfo | URL, init?: RequestInit): Response | null {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
  if (url.hostname === 'www.dangkykinhdoanh.gov.vn') {
    const text = latestSupplierGroundingPrompt.includes('Tên không được trích dẫn') ? '0198765430' : 'Công ty TNHH Tìm qua Google — MST 0198765430';
    return new Response(text, {headers: {'Content-Type': 'text/plain'}});
  }
  if (url.origin !== new URL(DEV_LLM_API_CONFIG.ENDPOINT).origin) return null;
  const body = JSON.parse(String(init?.body || '{}'));
  if (body.messages?.length === 1) {
    supplierGroundingMockCalls += 1;
    assert.equal(body.stream, false);
    const searchPrompt = String(body?.messages?.[0]?.content || '');
    latestSupplierGroundingPrompt = searchPrompt;
    const candidate = searchPrompt.includes('Tên không chính thức')
      ? { taxCode: '0198765430', name: 'Công ty TNHH Tên không chính thức', sourceUrl: 'https://masothue.com/0198765430' }
      : { taxCode: '0198765430', name: 'Công ty TNHH Tìm qua Google', address: 'Số 123 Đường Lê Lợi, Hà Nội', sourceUrl: 'https://www.dangkykinhdoanh.gov.vn/doanh-nghiep/0198765430' };
    return mockLlmCompletion({candidates: [candidate]});
  }
  if (!url.pathname.endsWith('/v1/chat/completions')) return null;

  const prompt = String(body?.messages?.[1]?.content || '');
  const readLineJson = (label: string) => {
    const start = prompt.indexOf(label);
    if (start < 0) return '';
    const value = prompt.slice(start + label.length).split('\n')[0].trim();
    try { return JSON.parse(value); } catch { return ''; }
  };
  const invoiceName = String(readLineJson('Tên OCR: '));
  const invoiceAddress = String(readLineJson('Địa chỉ OCR: '));
  const recordsStart = prompt.indexOf('Hồ sơ: ');
  const recordsEnd = prompt.indexOf('\nTrả đúng JSON:', recordsStart);
  let records: Array<Record<string, string>> = [];
  try { records = JSON.parse(prompt.slice(recordsStart + 'Hồ sơ: '.length, recordsEnd)); } catch { records = []; }

  const normalName = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const editSimilarity = (left: string, right: string) => {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i++) {
      const row = [i];
      for (let j = 1; j <= right.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = row;
    }
    return 1 - previous[right.length] / Math.max(left.length, right.length, 1);
  };
  const addressMatches = (left: string, right: string) => {
    const normalizeAddress = (value: string) => normalName(value).split(' ').filter((token) =>
      token.length > 1 && !['so', 'duong', 'pho', 'phuong', 'thanh', 'quan', 'tp', 'ha', 'noi'].includes(token));
    const a = normalizeAddress(left), b = normalizeAddress(right);
    const numberA = a.find((token) => /^\d+$/.test(token));
    const numberB = b.find((token) => /^\d+$/.test(token));
    const shared = a.filter((token) => b.includes(token) && !/^\d+$/.test(token));
    return Boolean(numberA && numberA === numberB && shared.length >= 2);
  };
  const hasBranchQualifier = /chi nh[aá]nh|c[uử]a h[aà]ng|branch/i.test(invoiceName);
  const matches = records.filter((record) => {
    const names = [record.legalName, record.internationalName, record.tradeName].filter(Boolean).map((value) => normalName(String(value)));
    const ocrName = normalName(invoiceName);
    const ocrTokens = new Set(ocrName.split(' '));
    const exactName = names.some((candidate) => {
      const candidateTokens = candidate.split(' ').filter((token) => token.length >= 3);
      return candidateTokens.length > 0 && candidateTokens.every((token) => ocrTokens.has(token));
    });
    const branchlessName = ocrName.replace(/ (?:chi nhanh|cua hang|branch) .*/, '').trim();
    const typoName = invoiceAddress && names.some((candidate) => editSimilarity(branchlessName, candidate) >= 0.88);
    if (invoiceAddress) return Boolean((exactName || typoName) && addressMatches(invoiceAddress, record.registeredAddress || ''));
    return Boolean(exactName && !hasBranchQualifier);
  });
  const directPrintedCodeNameMatch = invoiceName === 'Saigon Co.op'
    && records.length === 1 && records[0].taxCode === '0309129418-115'
    && /saigon co\.op/i.test(records[0].searchResultName || '');
  const adversarialLegalFormMatch = invoiceName === 'CÔNG TY CỔ PHẦN SAO MAI'
    && records.length === 1 && records[0].taxCode === '0104918404'
    && records[0].legalName === 'CÔNG TY TNHH SAO MAI'
    && records[0].searchResultName === invoiceName;
  const decision = directPrintedCodeNameMatch || adversarialLegalFormMatch
    ? { decision: 'MATCH', taxCode: records[0].taxCode }
    : (invoiceName === 'Tên giả mạo không liên quan'
      || invoiceName === 'CÔNG TY TNHH TÊN TRÙNG TRỰC TUYẾN') && records.length > 0
    ? { decision: 'MATCH', taxCode: records[0].taxCode }
    : matches.length === 1 ? { decision: 'MATCH', taxCode: matches[0].taxCode } : {
    decision: records.length > 1 ? 'AMBIGUOUS' : 'NO_MATCH', taxCode: ''
  };
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}

async function main() {
  const db = getDatabase();
  assert.equal(normalizeCompanyName('CÔNG TY TNHH Sao Mai'), normalizeCompanyName('Sao Mai'));
  const ocrMerge = mergeOcrSemanticCandidates(
    { supplierTaxCode: '0100109106', totalAmount: 11_500, invoiceDate: '2026-10-03' },
    { supplierTaxCode: '0101243150', totalAmount: 115_000, invoiceDate: '2026-10-03', invoiceNumber: 'HD12345', buyerTaxCode: '123456789012' },
    [
      { text: 'MST người bán: 0100109106' },
      { text: 'Ngày lập: 03/10/2026' },
      { text: 'Số hóa đơn: HD12345' },
      { text: 'Tổng thanh toán: 11.500' }
    ]
  );
  assert.equal(ocrMerge.data.supplierTaxCode, '0100109106', 'Giữ MST đọc trực tiếp từ OCR khi mô hình cấu trúc sai mã');
  assert.equal(ocrMerge.data.totalAmount, 11_500, 'Giữ số tiền OCR gốc khi mô hình diễn giải sai dấu phân cách');
  assert.equal(ocrMerge.data.invoiceNumber, 'HD12345', 'Bổ sung trường mô hình đọc được từ transcript OCR');
  assert.equal(ocrMerge.data.buyerTaxCode, undefined, 'Loại giá trị mô hình tự thêm không có trong transcript');
  assert.deepEqual(ocrMerge.uncertainFields.sort(), ['supplierTaxCode', 'totalAmount'], 'Chỉ trường hai cách đọc bất đồng cần rà soát');
  const roleAwareRawText = parseInvoiceFromRawText([
    'Thông tin người bán',
    'Seller: Công ty TNHH Bên Bán Minh Hòa',
    'Mã số thuế: 0100000001',
    'Thông tin người mua',
    'Buyer: Công ty TNHH Khách Hàng ABC',
    'Mã số thuế: 0100109106'
  ].join('\n'));
  assert.equal(roleAwareRawText.invoice.supplierTaxCode, '0100000001', 'Gán MST theo ngữ cảnh bên bán');
  assert.equal(roleAwareRawText.invoice.buyerTaxCode, '0100109106', 'Giữ MST bên mua ở đúng trường');
  assert.equal(roleAwareRawText.invoice.supplierName, 'Công ty TNHH Bên Bán Minh Hòa', 'Không lấy tên công ty bên mua làm nhà cung cấp');
  const sellerHeaderRawText = parseInvoiceFromRawText([
    'Công ty TNHH Minh Hòa',
    'Mã số thuế: 0100000001',
    'Thông tin người mua',
    'Công ty TNHH Khách Hàng ABC',
    'Mã số thuế: 0100109106'
  ].join('\n'));
  assert.equal(sellerHeaderRawText.invoice.supplierTaxCode, '0100000001', 'Gán MST chung trước khối người mua khi có tiêu đề tên bên bán');
  assert.equal(sellerHeaderRawText.invoice.buyerTaxCode, '0100109106');
  const buyerOnlyRawText = parseInvoiceFromRawText('Thông tin người mua\nMã số thuế: 0100109106');
  assert.equal(buyerOnlyRawText.invoice.buyerTaxCode, '0100109106');
  assert.equal(buyerOnlyRawText.invoice.supplierTaxCode, undefined, 'Không nâng MST người mua duy nhất thành MST nhà cung cấp');
  const uppercaseBuyerRawText = parseInvoiceFromRawText('ĐƠN VỊ MUA\nMã số thuế: 0100109106');
  assert.equal(uppercaseBuyerRawText.invoice.buyerTaxCode, '0100109106', 'Nhận diện đúng tiêu đề bên mua viết hoa có chữ Đ');
  assert.equal(uppercaseBuyerRawText.invoice.supplierTaxCode, undefined, 'Không gán nhầm MST dưới tiêu đề ĐƠN VỊ MUA');
  const ambiguousReceiptLines = [
    'Saigon Co.op', 'Mã số thuế: 0309129418-115', 'Số HD: 09336', 'Mã HD: EOEUACNUCANMY',
    'Ngày: 23/09/2019', 'Tổng số tiền thanh toán: 1'
  ].map((text, index) => ({ text, confidence: 0.99, bbox: { x: 0.1, y: 0.1 + index * 0.1, w: 0.8, h: 0.04 } }));
  const parsedAmbiguousReceipt = parseReceiptEntities(ambiguousReceiptLines);
  const ambiguousAssessment = assessLocalOcr(parsedAmbiguousReceipt, ambiguousReceiptLines);
  assert.equal(ambiguousAssessment.shouldFallback, true, 'OCR độ tin cậy cao vẫn phải đọc Vision khi số hóa đơn mâu thuẫn hoặc tổng tiền bất thường');
  assert.ok(ambiguousAssessment.reasons.some(reason => reason.includes('nhiều mã định danh')));
  assert.ok(ambiguousAssessment.reasons.some(reason => reason.includes('quá thấp')));
  const marketingNoise = parseReceiptEntities([
    { text: 'Saigon Co.op', confidence: 0.99, bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.04 } },
    { text: 'PHIẾU TÍNH TIỀN', confidence: 0.99, bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.04 } },
    { text: 'Điểm sử dụng trong hóa đơn:', confidence: 0.99, bbox: { x: 0.1, y: 0.3, w: 0.8, h: 0.04 } },
    { text: 'Cảm ơn quý khách và hẹn gặp lại', confidence: 0.99, bbox: { x: 0.1, y: 0.4, w: 0.8, h: 0.04 } }
  ]);
  assert.equal(marketingNoise.invoice.supplierName, 'Saigon Co.op', 'Không nhận lời cảm ơn hay nhãn điểm thành viên làm tên nhà cung cấp');
  const multiBranchReceipt = parseReceiptEntities([
    { text: 'OGAME-HOBBY', confidence: 0.5, bbox: { x: 0.1, y: 0.01, w: 0.8, h: 0.04 } },
    { text: 'www.nshop.com.vn', confidence: 1, bbox: { x: 0.1, y: 0.05, w: 0.8, h: 0.02 } },
    { text: 'CN1: 66 Thành Thái P.12 Q.10', confidence: 1, bbox: { x: 0.1, y: 0.08, w: 0.8, h: 0.02 } },
    { text: 'CN7: L3-08, Tầng 3, TTTM Parc Mall Quận 8', confidence: 1, bbox: { x: 0.1, y: 0.11, w: 0.8, h: 0.02 } },
    { text: 'Tel: 0909848921', confidence: 1, bbox: { x: 0.1, y: 0.14, w: 0.8, h: 0.02 } },
    { text: 'Ngày bán: 20/11/2024', confidence: 1, bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.02 } }
  ]);
  assert.equal(multiBranchReceipt.invoice.supplierAddress, undefined,
    'Không chọn ngẫu nhiên một địa chỉ khi hóa đơn liệt kê nhiều chi nhánh');
  assert.match(multiBranchReceipt.supplierSearchContext || '', /www\.nshop\.com\.vn/,
    'Giữ tên miền công khai để AI tìm quan hệ giữa thương hiệu và pháp nhân');
  assert.match(multiBranchReceipt.supplierSearchContext || '', /CN1:.*CN7:/s,
    'Giữ danh sách chi nhánh làm ngữ cảnh tìm kiếm mà không gán một chi nhánh tùy ý');
  assert.doesNotMatch(multiBranchReceipt.supplierSearchContext || '', /0909848921|Kotobukiya/,
    'Ngữ cảnh tìm kiếm chỉ chứa phần đầu bên bán, không chứa số điện thoại hay hàng hóa');
  assert.notEqual(normalizeCompanyName('Công ty Dịch vụ Sao Mai'), normalizeCompanyName('Công ty Thương mại Sao Mai'));
  assert.notEqual(normalizeCompanyName('Tập đoàn Sao Mai'), normalizeCompanyName('Sao Mai'),
    'Giữ “Tập đoàn” vì đây có thể là tên phân biệt doanh nghiệp, không phải loại hình pháp lý');
  assert.equal(companyNameMatches('Tập đoàn Sao Mai', 'Sao Mai'), false,
    'Không gộp một tập đoàn với công ty trùng phần tên còn lại khi chưa có bằng chứng thuế');
  assert.equal(normalizeCompanyName('Công ty TNHH Sao Mai'), normalizeCompanyName('Công ty Cổ phần Sao Mai'));
  assert.equal(companyNameMatches('Công ty TNHH Sao Mai', 'Công ty Cổ phần Sao Mai'), false,
    'Không gộp hai pháp nhân có cùng tên nhưng khác loại hình doanh nghiệp');
  assert.equal(companyNameMatches('Công ty TNHH Sao Mai', 'TNHH Sao Mai'), true,
    'Viết tắt cùng loại hình TNHH vẫn được chuẩn hóa chính xác');
  assert.equal(companyNameMatches('Joint Stock Company Sao Mai', 'Công ty Cổ phần Sao Mai'), true,
    'Tên tiếng Anh viết loại hình ở đầu khớp tên cổ phần tiếng Việt cùng pháp nhân');
  assert.equal(companyNameMatches('Limited Liability Company Sao Mai', 'Công ty TNHH Sao Mai'), true,
    'Tên tiếng Anh và TNHH tiếng Việt được chuẩn hóa theo cùng loại hình');
  assert.equal(companyNameMatches('Công ty TNHH Sao Mai', 'Sao Mai'), false,
    'Tên rút gọn không đủ phân biệt loại hình khi chưa có tên giao dịch hay địa chỉ xác nhận');
  assert.equal(companyNameMatches('Tổng Công Ty Điện Lực TP. Hà Nội', 'Tổng Công ty Điện lực Thành phố Hà Nội'), true,
    'Viết tắt địa danh vẫn khớp tên pháp lý chính xác');
  assert.equal(companyNameMatches('Công ty Sao Mai (Chi nhánh 01)', 'Công ty Sao Mai (Chi nhánh 02)'), false,
    'Tên chi nhánh khác nhau không được đồng nhất khi chuẩn hóa');
  assert.equal(companyNameMatches('Công ty Dịch vụ Sao Mai', 'Công ty Thương mại Sao Mai'), false,
    'Không rút gọn mất từ phân biệt pháp nhân');
  const receiptWithAddress = parseReceiptEntities([
    { text: 'Công ty TNHH Sao Mai', confidence: 0.99, bbox: { x: 0.1, y: 0.02, w: 0.7, h: 0.02 } },
    { text: 'Địa chỉ: 123 Đường Lê Lợi, P. 1, TP. Hà Nội', confidence: 0.98, bbox: { x: 0.1, y: 0.05, w: 0.8, h: 0.02 } },
    { text: 'MST: 0104918404', confidence: 0.99, bbox: { x: 0.1, y: 0.08, w: 0.4, h: 0.02 } },
    { text: 'Ngày lập: 09/08/2026', confidence: 0.98, bbox: { x: 0.1, y: 0.12, w: 0.5, h: 0.02 } },
    { text: 'Số hóa đơn: 123456', confidence: 0.99, bbox: { x: 0.1, y: 0.15, w: 0.5, h: 0.02 } },
    { text: 'Tổng thanh toán: 100.000', confidence: 0.99, bbox: { x: 0.1, y: 0.18, w: 0.5, h: 0.02 } }
  ]);
  assert.equal(receiptWithAddress.invoice.supplierAddress, '123 Đường Lê Lợi, P. 1, TP. Hà Nội',
    'OCR giữ riêng địa chỉ bên bán để tự phân biệt các chi nhánh trùng tên');
  const multilineAddressReceipt = parseReceiptEntities([
    { text: 'Công ty TNHH Sao Mai', confidence: 0.99, bbox: { x: 0.1, y: 0.02, w: 0.7, h: 0.02 } },
    { text: 'Địa chỉ:', confidence: 0.98, bbox: { x: 0.1, y: 0.05, w: 0.35, h: 0.02 } },
    { text: '123', confidence: 0.98, bbox: { x: 0.1, y: 0.08, w: 0.1, h: 0.02 } },
    { text: 'Đường Lê Lợi', confidence: 0.98, bbox: { x: 0.1, y: 0.11, w: 0.4, h: 0.02 } },
    { text: 'Phường 1, TP. Hà Nội', confidence: 0.98, bbox: { x: 0.1, y: 0.14, w: 0.6, h: 0.02 } },
    { text: 'Mã số thuế:', confidence: 0.98, bbox: { x: 0.1, y: 0.17, w: 0.4, h: 0.02 } },
    { text: '0104918404', confidence: 0.98, bbox: { x: 0.1, y: 0.2, w: 0.4, h: 0.02 } },
    { text: 'Bên mua:', confidence: 0.98, bbox: { x: 0.1, y: 0.23, w: 0.4, h: 0.02 } },
    { text: 'Địa chỉ: 999 Đường Khác, TP. Huế', confidence: 0.98, bbox: { x: 0.1, y: 0.26, w: 0.8, h: 0.02 } }
  ]);
  assert.equal(multilineAddressReceipt.invoice.supplierAddress, '123 Đường Lê Lợi Phường 1, TP. Hà Nội',
    'Nối địa chỉ bị OCR tách dòng và dừng trước nhãn MST/bên mua');
  assert.equal(multilineAddressReceipt.invoice.supplierTaxCode, '0104918404',
    'Không đưa MST bên bán vào trường địa chỉ khi đọc các dòng tiếp theo');
  const splitTaxCodeReceipt = parseReceiptEntities([
    { text: 'Công ty TNHH Sao Mai', confidence: 0.99, bbox: { x: 0.1, y: 0.02, w: 0.7, h: 0.02 } },
    { text: 'Mã số thuế người bán:', confidence: 0.98, bbox: { x: 0.1, y: 0.05, w: 0.45, h: 0.02 } },
    { text: '0104918404', confidence: 0.98, bbox: { x: 0.1, y: 0.08, w: 0.45, h: 0.02 } },
    { text: 'MST người mua:', confidence: 0.98, bbox: { x: 0.1, y: 0.11, w: 0.45, h: 0.02 } },
    { text: '123456789012', confidence: 0.98, bbox: { x: 0.1, y: 0.14, w: 0.45, h: 0.02 } }
  ]);
  assert.equal(splitTaxCodeReceipt.invoice.supplierTaxCode, '0104918404',
    'Đọc MST người bán khi ảnh tách nhãn và mã thành hai dòng');
  assert.equal(splitTaxCodeReceipt.invoice.buyerTaxCode, '123456789012',
    'Không nhầm MST người mua với MST nhà cung cấp khi nhãn bị tách dòng');
  const addressXml = parseXml('<Invoice><Seller><TaxID>0104918404</TaxID><Name>Công ty TNHH Sao Mai</Name><Address>123 Đường Lê Lợi, Hà Nội</Address></Seller></Invoice>');
  assert.equal(sanitizeInvoice(addressXml.rawInvoice).invoice.supplierAddress, '123 Đường Lê Lợi, Hà Nội',
    'Địa chỉ người bán được giữ qua luồng hóa đơn XML');
  const addressText = parseInvoiceFromRawText('Bên bán: Công ty TNHH Sao Mai\nĐịa chỉ: 123 Đường Lê Lợi, Phường 1, TP. Hà Nội\nMST bên bán: 0104918404\nBên mua: Công ty Mua hàng\nĐịa chỉ: 999 Đường Khác, TP. Huế');
  assert.equal(addressText.invoice.supplierAddress, '123 Đường Lê Lợi, Phường 1, TP. Hà Nội',
    'Địa chỉ người bán được giữ qua luồng trích xuất văn bản');
  assert.equal(validateTaxCode('0104918404').isValid, true);
  assert.equal(validateTaxCode('0100109106001').normalized, '0100109106-001', 'Chuẩn hóa MST chi nhánh OCR thiếu dấu gạch');
  assert.equal(validateTaxCode('1234567899').isValid, false, 'Không chấp nhận MST sai checksum để dùng làm dữ liệu học');
  const householdTaxId = '024123456789';
  assert.deepEqual(validateTaxCode(householdTaxId), { isValid: true, normalized: householdTaxId },
    'Mã định danh hộ kinh doanh 12 số không dùng checksum MST doanh nghiệp');
  assert.equal(InvoiceInputSchema.safeParse({ ...challengeCases[0].invoice, supplierTaxCode: householdTaxId }).success, true,
    'Schema hóa đơn chấp nhận MST 12 số của hộ kinh doanh');
  assert.equal(SupplierMasterSchema.safeParse({
    taxCode: householdTaxId,
    legalName: 'HỘ KINH DOANH KIỂM THỬ',
    lastVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }).success, true, 'Danh bạ nhà cung cấp chấp nhận MST 12 số');
  const householdXml = sanitizeInvoice(parseXml('<Invoice><Seller><TaxID>024123456789</TaxID><Name>HỘ KINH DOANH KIỂM THỬ</Name></Seller></Invoice>').rawInvoice);
  assert.equal(householdXml.invoice.supplierTaxCode, householdTaxId, 'XML giữ MST 12 số và không loại nhầm tiền tố giống đầu số điện thoại');
  const householdText = parseInvoiceFromRawText('Tên bên bán: Hộ kinh doanh Kiểm thử\nMST bên bán: 024123456789');
  assert.equal(householdText.invoice.supplierTaxCode, householdTaxId, 'Luồng dán văn bản đọc MST 12 số khi có nhãn');
  const householdReceipt = parseReceiptEntities([
    { text: 'Hộ kinh doanh Kiểm thử', confidence: 0.99, bbox: { x: 0.1, y: 0.02, w: 0.7, h: 0.02 } },
    { text: 'MST: 024123456789', confidence: 0.99, bbox: { x: 0.1, y: 0.05, w: 0.7, h: 0.02 } },
    { text: 'Tổng thanh toán: 100.000', confidence: 0.99, bbox: { x: 0.1, y: 0.1, w: 0.7, h: 0.02 } }
  ]);
  assert.equal(householdReceipt.invoice.supplierTaxCode, householdTaxId, 'OCR hóa đơn nhận MST hộ kinh doanh 12 số có nhãn');
  seedDefaultSuppliers();
  assert.equal(await lookupByName('MISA'), null, 'Danh mục demo chưa xác minh không được tự động điền MST');

  const originalFetch = globalThis.fetch;
  const originalFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const previousShopAiKey = DEV_LLM_API_CONFIG.API_KEY;
  const previousShopAiBaseUrl = DEV_LLM_API_CONFIG.BASE_URL;
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousXinvoiceClientId = process.env.XINVOICE_CLIENT_ID;
  const previousXinvoiceApiKey = process.env.XINVOICE_API_KEY;
  let activeFetch = originalFetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => activeFetch,
    set: (handler: typeof fetch) => {
      activeFetch = async (input: RequestInfo | URL, init?: RequestInit) =>
        mockSupplierIdentityAi(input, init) || handler(input, init);
    }
  });
  const taxName = 'TẬP ĐOÀN CÔNG NGHIỆP - VIỄN THÔNG QUÂN ĐỘI';
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '00',
    data: { id: '0100109106', name: taxName, status: 'NNT đang hoạt động', address: 'Hà Nội' },
    metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const byTaxCode = await lookupByTaxCode('0100109106');
  assert.equal(byTaxCode?.isVerified, true, 'Cho phép lookup MST khớp chính xác từ nguồn thuế còn mới');
  assert.equal(byTaxCode?.legalName, taxName);
  let repeatLookupCalls = 0;
  globalThis.fetch = async () => {
    repeatLookupCalls += 1;
    throw new Error('Cache test must not make another network call');
  };
  const cachedByTaxCode = await lookupByTaxCode('0100109106');
  assert.equal(cachedByTaxCode?.source, 'INTERNAL_DB', 'Dùng lại kết quả nguồn thuế chính thức còn mới');
  assert.equal(repeatLookupCalls, 0, 'Không gọi lại dịch vụ tra cứu cho MST đã xác minh gần đây');
  const enrichedName = await autoEnrichSupplierData({ supplierTaxCode: '0100109106' });
  assert.equal(enrichedName.supplierName, taxName);

  db.prepare('UPDATE supplier_master SET last_verified_at = ? WHERE tax_code = ?')
    .run(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), '0100109106');
  let expiredCacheRefreshCalls = 0;
  globalThis.fetch = async () => {
    expiredCacheRefreshCalls += 1;
    return new Response(JSON.stringify({
      code: '00',
      data: { id: '0100109106', name: taxName, status: 'NNT đang hoạt động', address: 'Hà Nội' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const refreshedExpiredCache = await lookupByTaxCode('0100109106');
  assert.equal(refreshedExpiredCache?.isVerified, true, 'Tra lại MST khi cache nội bộ quá 7 ngày');
  assert.equal(expiredCacheRefreshCalls, 1, 'Cache nội bộ quá 7 ngày không được dùng lại');

  process.env.XINVOICE_CLIENT_ID = 'qa-client-only';
  process.env.XINVOICE_API_KEY = 'qa-key-only';
  let xinvoiceCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    assert.equal(url.hostname, 'api.xinvoice.vn');
    assert.equal(url.pathname, '/gdt-api/tax-payer/0999912340');
    assert.equal(url.searchParams.has('key'), false, 'Không đưa khóa Xinvoice lên URL/query log');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('client-id'), 'qa-client-only');
    assert.equal(headers.get('api-key'), 'qa-key-only');
    xinvoiceCalls += 1;
    return new Response(JSON.stringify({
      taxID: '0999912340', name: 'CÔNG TY TNHH KIỂM THỬ XINVOICE', address: 'Số 17 phố Duy Tân, Hà Nội',
      status: 'Đang hoạt động', updatedAt: new Date().toISOString()
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const xinvoiceLookup = await lookupByTaxCode('0999912340');
  assert.equal(xinvoiceLookup?.source, 'XINVOICE_TAX_API', 'Tra MST bằng Xinvoice khi đã cấu hình thông tin xác thực');
  assert.equal(xinvoiceLookup?.legalName, 'CÔNG TY TNHH KIỂM THỬ XINVOICE');
  assert.equal(xinvoiceLookup?.isVerified, true);
  const xinvoiceAutoEnrichment = await autoEnrichSupplierData({ supplierTaxCode: '0999912340' });
  assert.equal(xinvoiceAutoEnrichment.supplierName, 'CÔNG TY TNHH KIỂM THỬ XINVOICE');
  assert.equal(xinvoiceAutoEnrichment.enrichedField, 'supplierName');
  assert.equal(xinvoiceAutoEnrichment.isVerified, true, 'Tự điền tên thiếu từ MST tra được qua Xinvoice');
  let xinvoiceCacheNetworkCalls = 0;
  globalThis.fetch = async () => { xinvoiceCacheNetworkCalls += 1; throw new Error('Xinvoice cache should not call network'); };
  const cachedXinvoiceLookup = await lookupByTaxCode('0999912340');
  assert.equal(cachedXinvoiceLookup?.source, 'INTERNAL_DB', 'Tái sử dụng kết quả Xinvoice đã lưu');
  assert.equal(xinvoiceCacheNetworkCalls, 0, 'Không gọi lại Xinvoice trong 24 giờ');
  assert.equal(xinvoiceCalls, 1);
  db.prepare('UPDATE supplier_master SET last_verified_at = ? WHERE tax_code = ?')
    .run(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), '0999912340');
  let expiredXinvoiceCacheCalls = 0;
  globalThis.fetch = async () => {
    expiredXinvoiceCacheCalls += 1;
    return new Response(JSON.stringify({
      taxID: '0999912340', name: 'CÔNG TY TNHH KIỂM THỬ XINVOICE', updatedAt: new Date().toISOString()
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  assert.equal((await lookupByTaxCode('0999912340'))?.source, 'XINVOICE_TAX_API', 'Tra lại Xinvoice sau khi cache nội bộ quá 24 giờ');
  assert.equal(expiredXinvoiceCacheCalls, 1);

  let xinvoiceMismatchFallbackCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'api.xinvoice.vn') {
      return new Response(JSON.stringify({ taxID: '0309129418', name: 'CÔNG TY KHÁC', updatedAt: new Date().toISOString() }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    xinvoiceMismatchFallbackCalls += 1;
    return new Response(JSON.stringify({ code: '99', data: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  assert.equal(await lookupByTaxCode('0316794479'), null, 'Không nhận kết quả Xinvoice trả MST khác');
  assert.equal(xinvoiceMismatchFallbackCalls, 1, 'Sai MST từ Xinvoice mới chuyển sang fallback');

  let xinvoiceStaleFallbackCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'api.xinvoice.vn') {
      return new Response(JSON.stringify({ taxID: '0316794479', name: 'CÔNG TY TNHH CASSO', updatedAt: '2020-01-01T00:00:00.000Z' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    xinvoiceStaleFallbackCalls += 1;
    return new Response(JSON.stringify({
      code: '00', data: { id: '0316794479', name: 'CÔNG TY TNHH CASSO', status: 'NNT đang hoạt động' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const staleXinvoiceFallsBack = await lookupByTaxCode('0316794479');
  assert.equal(staleXinvoiceFallsBack?.source, 'VIETQR_GDT', 'Bỏ dữ liệu Xinvoice quá hạn và thử nguồn chuyển tiếp');
  assert.equal(xinvoiceStaleFallbackCalls, 1);
  delete process.env.XINVOICE_CLIENT_ID;
  delete process.env.XINVOICE_API_KEY;

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '00',
    data: { id: '0309129418', name: 'CÔNG TY KHÁC', status: 'NNT đang hoạt động' },
    metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  assert.equal(await lookupByTaxCode('0101243150'), null, 'Bác bỏ phản hồi API trả về MST khác MST đã yêu cầu');

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '00',
    data: { id: '0101243150', name: 'CÔNG TY MISA', status: 'NNT đang hoạt động' },
    metadata: { source: 'https://www.gdt.gov.vn', updatedAt: '2020-01-01T00:00:00.000Z' }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  assert.equal(await lookupByTaxCode('0101243150'), null, 'Bác bỏ dữ liệu tra cứu quá hạn');

  const householdLegalName = 'HỘ KINH DOANH KIỂM THỬ';
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    assert.equal(url.pathname, `/v2/business/${householdTaxId}`, 'Tra cứu MST hộ kinh doanh 12 số theo đúng mã đã nhận diện');
    return new Response(JSON.stringify({
      code: '00',
      data: { id: householdTaxId, name: householdLegalName, status: 'NNT đang hoạt động' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const verifiedHousehold = await lookupByTaxCode(householdTaxId);
  assert.equal(verifiedHousehold?.isVerified, true, 'Chỉ xác nhận MST hộ kinh doanh sau khi nguồn thuế trả đúng mã');
  assert.equal(verifiedHousehold?.legalName, householdLegalName);
  const householdNameFromTaxCode = await autoEnrichSupplierData({ supplierTaxCode: householdTaxId });
  assert.equal(householdNameFromTaxCode.supplierName, householdLegalName, 'Tự điền tên từ MST hộ kinh doanh đã xác minh');
  globalThis.fetch = async () => { throw new Error('MST 12 số chưa đăng ký không được tự tin cậy'); };
  assert.equal(await lookupByTaxCode('123456789012'), null, 'MST 12 số chỉ hợp lệ về định dạng, vẫn cần nguồn thuế xác nhận');

  const previousBusinessApiKey = process.env.DOANHNGHIEP_API_KEY;
  const previousOnlineIdentityLookupEnabled = process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED;
  delete process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED;
  let disabledOnlineNameLookups = 0;
  globalThis.fetch = async () => {
    disabledOnlineNameLookups += 1;
    throw new Error('Tra cứu tên online phải tắt mặc định khi chưa bật cấu hình');
  };
  assert.equal(await lookupByName('Nhà cung cấp chỉ có trong mock local'), null);
  assert.equal(disabledOnlineNameLookups, 0, 'Không gửi yêu cầu tên doanh nghiệp ra ngoài khi feature flag chưa bật');

  process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED = 'true';
  process.env.GEMINI_API_KEY = 'unrelated-vision-key';
  DEV_LLM_API_CONFIG.API_KEY = '';
  delete process.env.DOANHNGHIEP_API_KEY;
  let unsupportedCredentialCalls = 0;
  globalThis.fetch = async () => {
    unsupportedCredentialCalls += 1;
    throw new Error('A vision key must not be sent to the supplier-search provider');
  };
  assert.equal(await lookupByName('Nhà cung cấp cần API LLM'), null);
  assert.equal(unsupportedCredentialCalls, 0, 'Khóa GEMINI cũ không được dùng thay DEV_LLM_API_KEY');

  process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED = 'true';
  DEV_LLM_API_CONFIG.API_KEY = 'qa-mocked-only';
  DEV_LLM_API_CONFIG.BASE_URL = 'https://nlt9router-oracle.tail3abf4e.ts.net/v1';
  process.env.DOANHNGHIEP_API_KEY = 'qa-mocked-only';
  const registryAddress = 'Số 123 Đường Lê Lợi, Phường 1, TP. Hà Nội';
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    assert.equal(url.hostname, 'api.vietqr.io');
    assert.equal(url.pathname, '/v2/business/0104918404');
    return new Response(JSON.stringify({
      code: '00',
      data: { id: '0104918404', name: 'CÔNG TY TNHH SAO MAI', address: registryAddress, status: 'NNT đang hoạt động' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const printedLegalFormConflict = await autoEnrichSupplierData({
    supplierTaxCode: '0104918404', supplierName: 'CÔNG TY CỔ PHẦN SAO MAI', address: registryAddress
  });
  assert.deepEqual(printedLegalFormConflict.conflictFields, ['supplierName', 'supplierTaxCode'],
    'MST hợp lệ không được dùng để ghi đè tên OCR có loại hình pháp lý đối lập');
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    assert.equal(url.hostname, 'doanhnghiep.vn');
    return new Response(JSON.stringify({ items: [{
      mst: '0104918404', name_vi: 'CÔNG TY CỔ PHẦN SAO MAI'
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  assert.equal(await lookupByName('CÔNG TY CỔ PHẦN SAO MAI', { address: registryAddress }), null,
    'AI chọn nhầm không được vượt qua mâu thuẫn loại hình giữa kết quả tra tên và hồ sơ thuế');

  const coopLegalName = 'CHI NHÁNH - CÔNG TY TNHH MỘT THÀNH VIÊN THỰC PHẨM SAIGON CO.OP - CO.OP FOOD MIỀN BẮC';
  const coopOutletAddress = 'Tầng 1, 5H42 - Tòa K3, Phường Phú La, Quận Hà Đông, Hà Nội';
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      assert.equal(url.pathname, '/api/v1/search');
      assert.equal(url.searchParams.get('q'), 'Saigon Co.op', 'Tra tên thương hiệu độc lập trước khi ghép với MST in trên hóa đơn');
      return new Response(JSON.stringify({ items: [{
        mst: '0309129418-115', name_vi: 'Chi nhánh Công ty TNHH MTV Thực phẩm Saigon Co.op'
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(url.hostname, 'api.vietqr.io');
    assert.equal(url.pathname, '/v2/business/0309129418-115');
    return new Response(JSON.stringify({
      code: '00',
      data: {
        id: '0309129418-115',
        name: coopLegalName,
        address: 'Số 16 -17 Phùng Khoang, Phường Đại Mỗ, TP Hà Nội',
        status: 'NNT đang hoạt động'
      },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const coopBrandEnrichment = await autoEnrichSupplierData({
    supplierTaxCode: '0309129418-115', supplierName: 'Saigon Co.op', address: coopOutletAddress
  });
  assert.equal(coopBrandEnrichment.supplierTaxCode, '0309129418-115');
  assert.equal(coopBrandEnrichment.supplierName, coopLegalName,
    'AI maps receipt brand to legal branch name after exact printed MST verification despite outlet/registered address difference');
  assert.equal(coopBrandEnrichment.isVerified, true);
  assert.deepEqual(coopBrandEnrichment.enrichedFields, ['supplierName']);

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    assert.equal(url.hostname, 'doanhnghiep.vn');
    return new Response(JSON.stringify({ items: [{
      mst: '0309129418-115', name_vi: 'CÔNG TY KHÔNG LIÊN QUAN'
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const contradictorySearchResult = await autoEnrichSupplierData({
    supplierTaxCode: '0309129418-115', supplierName: 'Saigon Co.op', address: coopOutletAddress
  });
  assert.deepEqual(contradictorySearchResult.conflictFields, ['supplierName', 'supplierTaxCode'],
    'AI must reject a search result whose returned company name contradicts the invoice brand');

  process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED = 'false';
  let disabledBrandResolutionCalls = 0;
  globalThis.fetch = async () => {
    disabledBrandResolutionCalls += 1;
    throw new Error('Unverified brand names must not be guessed when online corroboration is off');
  };
  const uncorroboratedBrand = await autoEnrichSupplierData({
    supplierTaxCode: '0309129418-115', supplierName: 'Tên giả mạo không liên quan', address: coopOutletAddress
  });
  assert.deepEqual(uncorroboratedBrand.conflictFields, ['supplierName', 'supplierTaxCode'],
    'Tên không liên quan không được thay bằng tên pháp lý chỉ vì có một MST hợp lệ');
  assert.equal(uncorroboratedBrand.supplierName, 'Tên giả mạo không liên quan');
  assert.equal(disabledBrandResolutionCalls, 0, 'Không gọi API/AI khi online corroboration chưa bật');
  process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED = 'true';

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      return new Response(JSON.stringify({ items: [{ mst: '0101248141', name_vi: 'Công ty Cổ phần FPT' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      code: '00',
      data: {
        id: '0101248141',
        name: 'CÔNG TY CỔ PHẦN FPT',
        internationalName: 'FPT Corporation',
        shortName: 'FPT Corp',
        status: 'NNT đang hoạt động'
      },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const englishNameMatch = await lookupByName('FPT Corporation');
  assert.equal(englishNameMatch?.taxCode, '0101248141', 'Tên tiếng Anh được đối chiếu với tên quốc tế từ nguồn thuế và tự tìm ra MST');
  assert.equal(englishNameMatch?.internationalName, 'FPT Corporation');
  assert.equal(englishNameMatch?.isVerified, true);
  const englishPairMatch = await autoEnrichSupplierData({ supplierTaxCode: '0101248141', supplierName: 'FPT Corporation (FPT Corp)' });
  assert.equal(englishPairMatch.isVerified, true, 'Không báo mâu thuẫn khi hóa đơn dùng đúng tên quốc tế đã đăng ký');
  const wrongBranchLabel = await autoEnrichSupplierData({
    supplierTaxCode: '0101248141', supplierName: 'FPT Corporation (Chi nhánh Hà Nội)'
  });
  assert.deepEqual(wrongBranchLabel.conflictFields, ['supplierName', 'supplierTaxCode'],
    'Không bỏ qua nhãn chi nhánh chưa được nguồn đăng ký xác nhận');
  const ocrTypoWithoutAddress = await autoEnrichSupplierData({
    supplierTaxCode: '0101248141', supplierName: 'FPT Corporatlon'
  });
  assert.deepEqual(ocrTypoWithoutAddress.conflictFields, ['supplierName', 'supplierTaxCode'],
    'Không tự sửa tên OCR gần giống nếu thiếu địa chỉ xác nhận độc lập');
  let cachedEnglishSearchCalls = 0;
  globalThis.fetch = async () => {
    cachedEnglishSearchCalls += 1;
    throw new Error('Verified international name should resolve from fresh local tax data');
  };
  const cachedEnglishNameMatch = await lookupByName('FPT Corporation');
  assert.equal(cachedEnglishNameMatch?.taxCode, '0101248141', 'Tên quốc tế được lưu để tra cứu lại trong cửa sổ cache');
  assert.equal(cachedEnglishSearchCalls, 0);

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      assert.equal(url.pathname, '/api/v1/search');
      assert.equal(url.searchParams.get('q'), 'CÔNG TY TNHH KIỂM THỬ TRỰC TUYẾN (WEB TEST)');
      return new Response(JSON.stringify({ items: [{ mst: '0101243150', name_vi: 'Công ty TNHH Kiểm thử trực tuyến' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      code: '00',
      data: { id: '0101243150', name: 'Công ty TNHH Kiểm thử trực tuyến', shortName: 'WEB TEST', status: 'NNT đang hoạt động' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const onlineNameMatch = await lookupByName('CÔNG TY TNHH KIỂM THỬ TRỰC TUYẾN (WEB TEST)');
  assert.equal(onlineNameMatch?.taxCode, '0101243150', 'Tra tên online và tự điền chỉ sau khi MST/tên khớp lại với nguồn thuế');
  assert.equal(onlineNameMatch?.isVerified, true);
  assert.match(onlineNameMatch?.notes || '', /AI đối chiếu tên\/địa chỉ.*xác minh lại MST qua dịch vụ tra cứu thuế/);

  const branchTaxCode = '0101248141';
  const branchAddress = 'Số 17 Phố Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội';
  db.prepare('UPDATE supplier_master SET last_verified_at = ? WHERE tax_code = ?')
    .run(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), branchTaxCode);
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      return new Response(JSON.stringify({ items: [{ mst: branchTaxCode, name_vi: 'Công ty Cổ phần Viễn thông FPT' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      code: '00',
      data: { id: branchTaxCode, name: 'Công ty Cổ phần Viễn thông FPT', internationalName: 'FPT Corporation', address: branchAddress, status: 'NNT đang hoạt động' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const branchWithoutAddress = await lookupByName('FPT Corporation (Chi nhánh Hà Nội)');
  assert.equal(branchWithoutAddress, null, 'Không bỏ qualifier chi nhánh nếu thiếu địa chỉ đối chiếu');
  const branchWithAddress = await lookupByName('FPT Corporation (Chi nhánh Hà Nội)', { address: branchAddress });
  assert.equal(branchWithAddress?.taxCode, branchTaxCode, 'Tự tra được tên có qualifier chi nhánh khi địa chỉ đăng ký khớp độc lập');
  assert.equal(branchWithAddress?.isVerified, true);
  const branchAutoEnriched = await autoEnrichSupplierData({ supplierName: 'FPT Corporation (Chi nhánh Hà Nội)', address: branchAddress });
  assert.equal(branchAutoEnriched.supplierTaxCode, branchTaxCode, 'Tự điền trường MST còn thiếu sau khi xác minh tên kèm địa chỉ chi nhánh');
  const plainBranchName = 'FPT Corporation - Chi nhánh Hà Nội';
  assert.equal(await lookupByName(plainBranchName), null, 'Qualifier chi nhánh dạng văn bản vẫn phải được giữ nếu thiếu địa chỉ');
  const plainBranchMatch = await lookupByName(plainBranchName, { address: branchAddress });
  assert.equal(plainBranchMatch?.taxCode, branchTaxCode, 'Nhận diện được qualifier chi nhánh viết liền sau tên khi địa chỉ trùng đăng ký');
  assert.equal(await lookupByName('FPT Corporatlon'), null,
    'Lỗi OCR tên gần giống không được tự tra MST khi thiếu địa chỉ');
  assert.equal(await lookupByName('FPT Corporatlon', { address: '999 Đường Khác, TP. Huế' }), null,
    'Lỗi OCR tên gần giống vẫn bị từ chối nếu địa chỉ không khớp');
  const correctedNameByAddress = await lookupByName('FPT Corporatlon', { address: branchAddress });
  assert.equal(correctedNameByAddress?.taxCode, branchTaxCode,
    'Tự sửa một lỗi OCR nhỏ trong tên khi địa chỉ khớp hồ sơ thuế độc lập');
  const correctedPairByAddress = await autoEnrichSupplierData({
    supplierTaxCode: branchTaxCode, supplierName: 'FPT Corporatlon', address: branchAddress
  });
  assert.equal(correctedPairByAddress.isVerified, true,
    'Không bắt người dùng sửa tên OCR nếu MST và địa chỉ đã xác minh nhất quán');
  assert.equal(correctedPairByAddress.supplierName, 'Công ty Cổ phần Viễn thông FPT',
    'Tự sửa ký tự tên OCR theo tên pháp lý đã xác minh');
  assert.deepEqual(correctedPairByAddress.enrichedFields, ['supplierName'],
    'Ghi provenance tên được chuẩn hóa theo hồ sơ thuế');
  const correctedNameOnlyByAddress = await autoEnrichSupplierData({
    supplierName: 'FPT Corporatlon', address: branchAddress
  });
  assert.equal(correctedNameOnlyByAddress.supplierTaxCode, branchTaxCode,
    'Tự điền MST cho lỗi OCR nhỏ khi địa chỉ xác nhận độc lập');
  assert.equal(correctedNameOnlyByAddress.supplierName, 'Công ty Cổ phần Viễn thông FPT',
    'Tự sửa đồng thời tên OCR sai nhẹ theo hồ sơ thuế');
  assert.deepEqual(correctedNameOnlyByAddress.enrichedFields, ['supplierTaxCode', 'supplierName']);

  db.prepare('UPDATE supplier_master SET last_verified_at = ? WHERE tax_code = ?')
    .run(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), '0100109106');
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      return new Response(JSON.stringify({ items: [{
        mst: branchTaxCode, name_vi: 'Công ty Cổ phần Viễn thông FPT', name_en: 'FPT Corporation'
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const requestedTaxCode = url.pathname.split('/').pop() || '';
    const wrongCode = requestedTaxCode === '0100109106';
    return new Response(JSON.stringify({
      code: '00',
      data: {
        id: requestedTaxCode,
        name: wrongCode ? 'Công ty TNHH Sao Mai khác' : 'Công ty Cổ phần Viễn thông FPT',
        internationalName: wrongCode ? 'Other Company' : 'FPT Corporation',
        address: wrongCode ? 'Số 999 Đường Khác, TP. Huế' : branchAddress,
        status: 'NNT đang hoạt động'
      },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const validButWrongCodeWithoutAddress = await autoEnrichSupplierData({
    supplierTaxCode: '0100109106', supplierName: 'FPT Corporation'
  });
  assert.deepEqual(validButWrongCodeWithoutAddress.conflictFields, ['supplierName', 'supplierTaxCode'],
    'MST OCR hợp lệ nhưng xung đột không được thay nếu thiếu địa chỉ độc lập');
  const validButWrongCodeWithWrongAddress = await autoEnrichSupplierData({
    supplierTaxCode: '0100109106', supplierName: 'FPT Corporation', address: 'Số 999 Đường Khác, TP. Huế'
  });
  assert.deepEqual(validButWrongCodeWithWrongAddress.conflictFields, ['supplierName', 'supplierTaxCode'],
    'Không thay MST OCR hợp lệ nếu địa chỉ trên hóa đơn khớp công ty theo MST OCR');
  const validButWrongCodeWithAddress = await autoEnrichSupplierData({
    supplierTaxCode: '0100109106', supplierName: 'FPT Corporatlon', address: branchAddress
  });
  assert.equal(validButWrongCodeWithAddress.supplierTaxCode, branchTaxCode,
    'Tự thay MST OCR hợp lệ nhưng sai khi tên và địa chỉ cùng xác nhận MST đúng');
  assert.equal(validButWrongCodeWithAddress.supplierName, 'Công ty Cổ phần Viễn thông FPT',
    'Sửa cả tên OCR sai nhẹ theo pháp nhân đã xác minh khi tự sửa MST');
  assert.equal(validButWrongCodeWithAddress.isVerified, true);
  assert.deepEqual(validButWrongCodeWithAddress.enrichedFields, ['supplierTaxCode', 'supplierName']);

  const addressSearchName = 'CÔNG TY TNHH KIỂM THỬ ĐỊA CHỈ TRÙNG TÊN';
  const groundingCallsBeforeAmbiguousProviderResults = supplierGroundingMockCalls;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      return new Response(JSON.stringify({ items: [
        { mst: '0100100079', name_vi: addressSearchName },
        { mst: '0100684378', name_vi: addressSearchName }
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const taxCode = url.pathname.split('/').pop() || '';
    const address = taxCode === '0100100079'
      ? 'Số 123 Đường Lê Lợi, Phường 1, Thành phố Hà Nội'
      : 'Số 86 Đường Trần Phú, Phường 2, Thành phố Huế';
    return new Response(JSON.stringify({
      code: '00',
      data: { id: taxCode, name: addressSearchName, address, status: 'NNT đang hoạt động' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const addressResolved = await lookupByName(addressSearchName, { address: '123, Đường Lê Lợi, P. 1, TP. Hà Nội' });
  assert.equal(addressResolved?.taxCode, '0100100079', 'Tự chọn đúng MST duy nhất theo tên pháp lý và địa chỉ OCR khớp đăng ký');
  const abbreviatedOcrAddress = await lookupByName(addressSearchName, { address: 'Số 123 Đường Lê Lợi, TP. Hà N0i' });
  assert.equal(abbreviatedOcrAddress?.taxCode, '0100100079',
    'Vẫn phân biệt đúng MST trùng tên khi OCR lược địa chỉ và sai nhẹ tên thành phố');
  const administrativeAreaOnly = await lookupByName(addressSearchName, { address: 'Phường 1, Thành phố Hà Nội' });
  assert.equal(administrativeAreaOnly, null, 'Không chọn chi nhánh chỉ dựa vào địa chỉ chung cấp phường/thành phố');

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      return new Response(JSON.stringify({ items: [
        { mst: '0101234565', name_vi: 'Công ty TNHH Tên trùng trực tuyến' },
        { mst: '0109876540', name_vi: 'Công ty TNHH Tên trùng trực tuyến' }
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const taxCode = url.pathname.split('/').pop() || '';
    return new Response(JSON.stringify({
      code: '00',
      data: { id: taxCode, name: 'Công ty TNHH Tên trùng trực tuyến', status: 'NNT đang hoạt động' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  assert.equal(await lookupByName('CÔNG TY TNHH TÊN TRÙNG TRỰC TUYẾN'), null,
    'Bác bỏ cả khi AI chọn một MST trong nhiều hồ sơ cùng tên mà không có địa chỉ phân biệt');
  assert.equal(supplierGroundingMockCalls, groundingCallsBeforeAmbiguousProviderResults,
    'Không đổi sang nguồn tìm kiếm khác để lách kết quả doanh nghiệp đã xác minh nhưng mơ hồ');

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      assert.equal(url.searchParams.get('q'), 'CÔNG TY TNHH MỘT TÊN KHÔNG CÓ TRONG DB');
      return new Response(JSON.stringify({ items: [{ mst: '0107654326', name_vi: 'Công ty TNHH Một tên không có trong DB Plus' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      code: '00',
      data: { id: '0107654326', name: 'Công ty TNHH Một tên không có trong DB Plus', status: 'NNT đang hoạt động' },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  assert.equal(await lookupByName('CÔNG TY TNHH MỘT TÊN KHÔNG CÓ TRONG DB'), null, 'Không chấp nhận kết quả fuzzy tên gần giống');

  const saturatedSearchName = 'CÔNG TY TNHH TÌM KIẾM BỊ CẮT';
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    assert.equal(url.hostname, 'doanhnghiep.vn');
    return new Response(JSON.stringify({ items: Array.from({ length: 20 }, (_, index) => ({
      mst: '0101243150',
      name_vi: index === 0 ? saturatedSearchName : `Công ty TNHH Kết quả gần giống ${index}`
    })) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  assert.equal(await lookupByName(saturatedSearchName), null, 'Không suy ra duy nhất khi cửa sổ tra cứu online bị cắt ở giới hạn 20 kết quả');

  const configuredBusinessKey = process.env.DOANHNGHIEP_API_KEY;
  db.prepare('DELETE FROM supplier_master WHERE tax_code IN (?, ?)').run('0107654326', '0198765430');
  let fallbackTaxLookups = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'doanhnghiep.vn') {
      return new Response(JSON.stringify({ items: [{
        mst: '0107654326', name_vi: 'Công ty TNHH Ứng viên chưa xác minh'
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(url.hostname, 'api.vietqr.io');
    const requestedTaxCode = url.pathname.split('/').pop() || '';
    fallbackTaxLookups += 1;
    if (requestedTaxCode === '0107654326') {
      return new Response(JSON.stringify({ code: '99', data: null }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    assert.equal(requestedTaxCode, '0198765430', 'Chỉ tra MST từ kết quả Google grounded sau khi ứng viên đầu không xác minh được');
    return new Response(JSON.stringify({
      code: '00',
      data: {
        id: '0198765430',
        name: 'Công ty TNHH Tìm qua Google',
        address: 'Số 123 Đường Lê Lợi, Hà Nội',
        status: 'NNT đang hoạt động'
      },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const fallbackLookup = await lookupByName('Công ty TNHH Tìm qua Google', {
    address: 'Số 123 Đường Lê Lợi, Hà Nội',
    supplierSearchContext: 'Tên đầu hóa đơn: Công ty TNHH Tìm qua Google\nwebsite: www.google.com.vn'
  });
  assert.equal(fallbackLookup?.taxCode, '0198765430', 'Thử Google grounding sau khi ứng viên API không được nguồn thuế xác minh');
  assert.equal(fallbackLookup?.source, 'BUSINESS_SEARCH_GDT');
  assert.equal(fallbackTaxLookups, 2, 'Xác minh cả ứng viên đầu và ứng viên grounding trước khi tự điền');
  assert.match(latestSupplierGroundingPrompt, /www\.google\.com\.vn/,
    'Ngữ cảnh đầu bên bán được truyền vào Google grounding để tăng khả năng nhận diện tên/chi nhánh');
  db.prepare('DELETE FROM supplier_master WHERE tax_code = ?').run('0198765430');

  delete process.env.DOANHNGHIEP_API_KEY;
  let groundedSearchTaxLookups = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    assert.equal(url.hostname, 'api.vietqr.io', 'Tìm tên bằng Gemini Search rồi kiểm tra MST qua nguồn Cục Thuế');
    groundedSearchTaxLookups += 1;
    return new Response(JSON.stringify({
      code: '00',
      data: {
        id: '0198765430',
        name: 'Công ty TNHH Tìm qua Google',
        address: 'Số 123 Đường Lê Lợi, Hà Nội',
        status: 'NNT đang hoạt động'
      },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const groundedLookup = await lookupByName('Công ty TNHH Tìm qua Google', { address: 'Số 123 Đường Lê Lợi, Hà Nội' });
  assert.equal(groundedLookup?.taxCode, '0198765430', 'Không cần khóa Doanhnghiep: AI tìm nguồn chính thức, VietQR/GDT xác minh MST và AI khớp pháp nhân');
  assert.equal(groundedLookup?.source, 'BUSINESS_SEARCH_GDT');
  assert.equal(groundedSearchTaxLookups, 1);
  assert.equal(await lookupByName('Tên giả mạo không liên quan'), null,
    'Không tự điền chỉ theo kết luận AI nếu tên không khớp hồ sơ thuế và hóa đơn không có địa chỉ xác nhận');
  assert.equal(groundedSearchTaxLookups, 1, 'AI chọn nhầm không được vượt qua đối chiếu độc lập với hồ sơ thuế');
  assert.equal(await lookupByName('Công ty TNHH Tên không chính thức'), null,
    'Bỏ kết quả tìm kiếm không có trích dẫn từ cơ quan nhà nước trước khi tra MST');
  assert.equal(groundedSearchTaxLookups, 1, 'Không gọi tra cứu MST cho kết quả chỉ có nguồn không chính thức');
  assert.equal(await lookupByName('Công ty TNHH Tên không được trích dẫn'), null,
    'Không nhận MST được trích dẫn nếu tên ứng viên không xuất hiện cùng trong bằng chứng chính thức');
  assert.equal(groundedSearchTaxLookups, 1, 'Tên không có bằng chứng cùng nguồn bị loại trước khi tra MST');
  if (configuredBusinessKey === undefined) delete process.env.DOANHNGHIEP_API_KEY;
  else process.env.DOANHNGHIEP_API_KEY = configuredBusinessKey;
  if (previousOnlineIdentityLookupEnabled === undefined) delete process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED;
  else process.env.SUPPLIER_ONLINE_IDENTITY_LOOKUP_ENABLED = previousOnlineIdentityLookupEnabled;

  if (previousBusinessApiKey === undefined) delete process.env.DOANHNGHIEP_API_KEY;
  else process.env.DOANHNGHIEP_API_KEY = previousBusinessApiKey;
  if (previousShopAiKey === undefined) DEV_LLM_API_CONFIG.API_KEY = '';
  else DEV_LLM_API_CONFIG.API_KEY = previousShopAiKey;
  if (previousShopAiBaseUrl === undefined) DEV_LLM_API_CONFIG.BASE_URL = '';
  else DEV_LLM_API_CONFIG.BASE_URL = previousShopAiBaseUrl;
  if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousGeminiKey;
  if (previousXinvoiceClientId === undefined) delete process.env.XINVOICE_CLIENT_ID;
  else process.env.XINVOICE_CLIENT_ID = previousXinvoiceClientId;
  if (previousXinvoiceApiKey === undefined) delete process.env.XINVOICE_API_KEY;
  else process.env.XINVOICE_API_KEY = previousXinvoiceApiKey;
  if (originalFetchDescriptor) Object.defineProperty(globalThis, 'fetch', originalFetchDescriptor);
  globalThis.fetch = originalFetch;

  const confirmedAliasAddress = '123 Đường Lê Lợi, Phường 1, TP. Hà Nội';
  recordConfirmedSupplierAlias({
    supplierName: 'CÔNG TY TNHH Sao Mai - Cửa hàng 01',
    supplierTaxCode: '0104918404',
    supplierAddress: confirmedAliasAddress,
    invoiceId: 'invoice-confirmed-1',
    nameEvidence: 'Tên in trên hóa đơn gốc',
    taxCodeEvidence: 'MST in trên hóa đơn gốc',
    verifiedBy: 'reviewer-1'
  });

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '00',
    data: {
      id: '0104918404',
      name: 'CÔNG TY TNHH SAO MAI',
      address: 'Số 123 Đường Lê Lợi, Phường 1, Thành phố Hà Nội',
      status: 'NNT đang hoạt động'
    },
    metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const exact = await lookupByName('Công ty TNHH SAO MAI Cửa hàng 01', { address: confirmedAliasAddress });
  assert.equal(exact?.taxCode, '0104918404', 'Dấu câu/hoa thường khác nhau vẫn tìm đúng alias đã xác nhận');
  assert.equal(exact?.source, 'INVOICE_CONFIRMED_ALIAS');
  assert.equal(exact?.isVerified, true);
  const ocrTypoAlias = await lookupByName('Công ty TNHH Sao Mai Cửa hàng 0l', { address: confirmedAliasAddress });
  assert.equal(ocrTypoAlias?.taxCode, '0104918404',
    'Một lỗi OCR nhỏ trong bí danh đã xác nhận chỉ được khôi phục khi địa chỉ và MST đều được xác minh');
  assert.equal(ocrTypoAlias?.source, 'INVOICE_CONFIRMED_ALIAS');
  assert.equal(await lookupByName('Công ty TNHH Sao Mai Cửa hàng 0l'), null,
    'Không dùng khớp OCR gần đúng với bí danh nếu thiếu địa chỉ đối chiếu');
  assert.equal(await lookupByName('Công ty TNHH Sao Mai Cửa hàng 0l', { address: '999 Đường Khác, TP. Huế' }), null,
    'Không dùng khớp OCR gần đúng với bí danh khi địa chỉ khác bằng chứng đã xác nhận');
  assert.equal(await lookupByName('Công ty CP SAO MAI Cửa hàng 01', { address: confirmedAliasAddress }), null,
    'Bí danh có cùng phần tên nhưng khác loại hình pháp lý không được khớp chỉ nhờ cùng địa chỉ');
  assert.equal(await lookupByName('Công ty TNHH SAO MAI Cửa hàng 01'), null,
    'Tên cửa hàng đã xác nhận không gán MST lại nếu hóa đơn mới không có tên giao dịch hoặc địa chỉ xác nhận');
  assert.equal(await lookupByName('Công ty TNHH SAO MAI Cửa hàng 01', { address: '999 Đường Khác, TP. Huế' }), null,
    'Không dùng bí danh đã xác nhận khi địa chỉ hóa đơn khác địa chỉ lần trước');
  recordConfirmedSupplierAlias({
    supplierName: 'Sao Mai - Cửa hàng 02',
    supplierTaxCode: '0104918404',
    supplierAddress: confirmedAliasAddress,
    invoiceId: 'invoice-confirmed-bare-alias',
    nameEvidence: 'Tên giao dịch in trên hóa đơn',
    taxCodeEvidence: 'MST in trên hóa đơn',
    verifiedBy: 'reviewer-1'
  });
  assert.equal(await lookupByName('Công ty Cổ phần Sao Mai - Cửa hàng 02', { address: confirmedAliasAddress }), null,
    'Bí danh không ghi loại hình không thể vượt qua loại hình TNHH khác trong hồ sơ thuế');

  const enriched = await autoEnrichSupplierData({ supplierName: 'Sao Mai - Cửa hàng 01', address: confirmedAliasAddress });
  assert.equal(enriched.supplierTaxCode, '0104918404');
  assert.equal(enriched.enrichedField, 'supplierTaxCode');

  const correctedBadOcrCode = await autoEnrichSupplierData({
    supplierName: 'Sao Mai - Cửa hàng 01', supplierTaxCode: '1234567899', address: confirmedAliasAddress
  });
  assert.equal(correctedBadOcrCode.supplierTaxCode, '0104918404', 'Tên đã xác minh tự sửa MST OCR sai checksum mà không yêu cầu chọn nhà cung cấp');
  assert.equal(correctedBadOcrCode.enrichedField, 'supplierTaxCode');
  assert.equal(correctedBadOcrCode.isVerified, true);
  assert.match(correctedBadOcrCode.notes || '', /OCR không hợp lệ đã được thay/);

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '00',
    data: { id: '0100109106', name: 'TẬP ĐOÀN CÔNG NGHIỆP - VIỄN THÔNG QUÂN ĐỘI', status: 'NNT đang hoạt động' },
    metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const conflict = await autoEnrichSupplierData({ supplierTaxCode: '0100109106', supplierName: 'Sao Mai - Cửa hàng 01' });
  assert.deepEqual(conflict.conflictFields, ['supplierName', 'supplierTaxCode'], 'Tên và MST hợp lệ nhưng mâu thuẫn được gắn cờ thay vì âm thầm ghi đè');
  assert.equal(conflict.supplierTaxCode, '0100109106', 'Giữ MST OCR trong trường hợp bằng chứng xung đột');
  assert.equal(conflict.supplierName, 'Sao Mai - Cửa hàng 01', 'Giữ tên OCR trong trường hợp bằng chứng xung đột');
  globalThis.fetch = originalFetch;

  assert.equal(await lookupByName('Sao Mai Express'), null, 'Không suy rộng tên gần giống thành nhà cung cấp');
  assert.equal(await lookupByName('Circle K'), null, 'Không dùng danh bạ thương hiệu tĩnh chưa có bằng chứng');

  recordConfirmedSupplierAlias({
    supplierName: 'CÔNG TY TNHH SAO MAI - CỬA HÀNG 01',
    supplierTaxCode: '0100109106',
    supplierAddress: '86 Đường Trần Phú, Phường 2, TP. Huế',
    invoiceId: 'invoice-confirmed-2',
    nameEvidence: 'Tên in trên hóa đơn thứ hai',
    taxCodeEvidence: 'MST khác in trên hóa đơn thứ hai',
    verifiedBy: 'reviewer-2'
  });
  assert.equal(await lookupByName('Sao Mai - Cửa hàng 01'), null, 'Alias trỏ tới nhiều MST phải thành trạng thái mơ hồ');
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const taxCode = url.pathname.split('/').pop() || '';
    return new Response(JSON.stringify({
      code: '00',
      data: {
        id: taxCode,
        name: taxCode === '0104918404' ? 'CÔNG TY TNHH SAO MAI' : taxName,
        address: taxCode === '0104918404' ? 'Số 123 Đường Lê Lợi, Phường 1, Thành phố Hà Nội' : 'Hà Nội',
        status: 'NNT đang hoạt động'
      },
      metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const addressMatchedAlias = await lookupByName('Sao Mai - Cửa hàng 01', { address: '123, Đường Lê Lợi, P. 1, TP. Hà Nội' });
  assert.equal(addressMatchedAlias?.taxCode, '0104918404', 'Địa chỉ OCR phân biệt chính xác hai MST từng xác nhận cùng tên');
  assert.equal(addressMatchedAlias?.source, 'INVOICE_CONFIRMED_ALIAS');
  globalThis.fetch = originalFetch;
  const ambiguous = await autoEnrichSupplierData({ supplierName: 'Sao Mai - Cửa hàng 01' });
  assert.equal(ambiguous.enrichedField, undefined, 'Không tự điền khi một tên ánh xạ tới nhiều MST');

  db.close();

  globalThis.fetch = async () => new Response(JSON.stringify({
    code: '00',
    data: {
      id: '0104918404',
      name: 'CÔNG TY TNHH SAO MAI',
      address: 'Số 123 Đường Lê Lợi, Phường 1, Thành phố Hà Nội',
      status: 'NNT đang hoạt động'
    },
    metadata: { source: 'https://www.gdt.gov.vn', updatedAt: new Date().toISOString() }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await runIsolated(async () => {
    const invoice = {
      ...challengeCases[0].invoice,
      id: 'ALIAS-CONFIRMATION-INTEGRATION',
      invoiceNumber: 'ALIAS-CONFIRMATION-INTEGRATION',
      supplierName: 'CÔNG TY TNHH SAO MAI - CỬA HÀNG 01',
      supplierTaxCode: '0104918404',
      supplierAddress: confirmedAliasAddress
    };
    const accountant = { id: 'alias-accountant', role: 'ACCOUNTANT' as const, email: 'accountant@test', displayName: 'Kế toán viên' };
    const reviewer = { id: 'alias-reviewer', role: 'CFO' as const, email: 'cfo@test', displayName: 'CFO' };
    await evaluateWorkflow(invoice, accountant, { forceLocalOnly: true });
    await evaluateWorkflow(invoice, reviewer, {
      forceLocalOnly: true,
      expectedRevision: 1,
      confirmations: [
        { field: 'supplierName', evidence: 'Đối chiếu tên bên bán trên hóa đơn gốc' },
        { field: 'supplierTaxCode', evidence: 'Đối chiếu mã số thuế trên hóa đơn gốc' }
      ]
    });
    const learned = await lookupByName(invoice.supplierName, { address: invoice.supplierAddress });
    assert.equal(learned?.taxCode, invoice.supplierTaxCode, 'Cặp tên/MST xác nhận trong workflow được ghi thành alias có bằng chứng');
    assert.equal(learned?.source, 'INVOICE_CONFIRMED_ALIAS');
  });
  globalThis.fetch = originalFetch;

  console.log('PASS: supplier identity uses AI search/semantic matching with verified tax lookup sources and rejects unsupported sources.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
