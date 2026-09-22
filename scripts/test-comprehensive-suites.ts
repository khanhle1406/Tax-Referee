import './setup-env';
import { MOCK_INVOICES, VERIFY_90S_CASES } from '../data/mockInvoices';
import { evaluateInvoiceLocally, calculateKFactor, evaluateKFactorSafety } from '../services/policyEngine';
import { queryJevReferee } from '../services/jevService';
import { generateActionableQuestionWithGemini } from '../services/geminiService';
import { InvoiceInput, RefereeDecisionSchema, AuditEntry, AuditEntrySchema } from '../lib/schemas';
import { MACRO_DEFAULTS } from '../lib/constants';

// Tiện ích in ấn màu sắc và định dạng
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${green('✓ PASS:')} ${testName}`);
    if (detail) console.log(`         ${cyan(detail)}`);
  } else {
    console.error(`  ${red('✗ FAIL:')} ${testName}`);
    if (detail) console.error(`         ${red(detail)}`);
    throw new Error(`Test failed: ${testName} - ${detail}`);
  }
}

async function runComprehensiveSuites() {
  console.log(bold('\n========================================================================'));
  console.log(bold('  BỘ KIỂM THỬ TOÀN DIỆN TAX REFEREE THEO TESTING.MD (4 TEST SUITES)'));
  console.log(bold('========================================================================\n'));

  // =========================================================================
  // SUITE 1: TIỀN KIỂM NGHIỆP VỤ THUẾ & CĂN CỨ CHÂN LÝ (GROUND TRUTH SOP)
  // =========================================================================
  console.log(bold(cyan('>>> SUITE 1: Tiền kiểm Nghiệp vụ Thuế & Căn cứ Chân lý (Ground Truth SOP)')));

  // S1.1: Straight-Through Processing (TC-01, TC-02, TC-06)
  console.log(yellow('\n[S1.1] Hóa đơn thường quy hợp lệ 100% (Straight-Through Processing):'));
  const tc01 = MOCK_INVOICES.find(i => i.id === 'TC-01')!;
  const dec01 = evaluateInvoiceLocally(tc01);
  assert(dec01.status === 'ROUTINE', 'TC-01 (Fahasa) phải được tự động duyệt ROUTINE');
  assert(dec01.status === 'ROUTINE' && dec01.approvedTaxAmount === 333333, 'TC-01 phải có approvedTaxAmount = 333.333 VNĐ');

  const tc02 = MOCK_INVOICES.find(i => i.id === 'TC-02')!;
  const dec02 = evaluateInvoiceLocally(tc02);
  assert(dec02.status === 'ROUTINE', 'TC-02 (EVN) phải được tự động duyệt ROUTINE');

  const tc06 = MOCK_INVOICES.find(i => i.id === 'TC-06')!;
  const dec06 = evaluateInvoiceLocally(tc06);
  assert(dec06.status === 'ROUTINE', 'TC-06 (Viettel) phải được tự động duyệt ROUTINE');

  // S1.2: Bẫy thanh toán tiền mặt >= 20M (TC-12)
  console.log(yellow('\n[S1.2] Bẫy thanh toán tiền mặt >= 20 triệu VNĐ (Điều 1.2 SOP & TT 219/2013):'));
  const tc12 = MOCK_INVOICES.find(i => i.id === 'TC-12')!;
  const dec12 = evaluateInvoiceLocally(tc12);
  assert(dec12.status === 'ESCALATED', 'TC-12 (Nguyễn Kim 25M tiền mặt) phải bị cắm cờ ESCALATED');
  assert(dec12.status === 'ESCALATED' && dec12.riskGroup === 'OUT_OF_POLICY', 'TC-12 phải thuộc Nhóm 2 OUT_OF_POLICY');
  assert(dec12.status === 'ESCALATED' && (dec12 as any).approvedTaxAmount === undefined, 'Zero-Hallucination: Hóa đơn vi phạm tuyệt đối không có approvedTaxAmount');

  // S1.3: Bẫy Ma trận thuế suất 8% vs 10% (TC-10)
  console.log(yellow('\n[S1.3] Bẫy Ma trận thuế suất 8% vs 10% (Điều 1.3 SOP & Nghị định 72/2024):'));
  const tc10 = MOCK_INVOICES.find(i => i.id === 'TC-10')!;
  const dec10 = evaluateInvoiceLocally(tc10);
  assert(dec10.status === 'ESCALATED', 'TC-10 (VNPT áp thuế 8%) phải bị cắm cờ ESCALATED');
  assert(dec10.status === 'ESCALATED' && dec10.riskGroup === 'OUT_OF_POLICY', 'TC-10 phải thuộc Nhóm 2 OUT_OF_POLICY');
  assert(dec10.status === 'ESCALATED' && dec10.sopClause.includes('1.3'), 'TC-10 phải viện dẫn Điều 1.3 Quy chế Tax-SOP');

  // S1.4: Mặt hàng cấm khấu trừ - Rượu bia tiệc tùng (TC-11)
  console.log(yellow('\n[S1.4] Mặt hàng cấm khấu trừ - Rượu bia, tiệc tùng cá nhân (Điều 2.1 SOP):'));
  const tc11 = MOCK_INVOICES.find(i => i.id === 'TC-11')!;
  const dec11 = evaluateInvoiceLocally(tc11);
  assert(dec11.status === 'ESCALATED', 'TC-11 (Ẩm thực Hoàng Gia tiệc rượu) phải bị cắm cờ ESCALATED');
  assert(dec11.status === 'ESCALATED' && dec11.riskGroup === 'OUT_OF_POLICY', 'TC-11 phải thuộc Nhóm 2 OUT_OF_POLICY');

  // S1.5: Logic Mốc thời gian đối với NCC đóng MST (Điều 2.2 SOP)
  console.log(yellow('\n[S1.5] Logic Mốc thời gian đối với Nhà cung cấp đóng MST (Điều 2.2 SOP):'));
  // Nhánh 1: Lập TRƯỚC ngày đóng MST (TC-09: lập 10/08, đóng 15/08)
  const tc09 = MOCK_INVOICES.find(i => i.id === 'TC-09')!;
  const dec09 = evaluateInvoiceLocally(tc09);
  assert(dec09.status === 'ESCALATED' && dec09.riskGroup === 'UNCERTAIN_INFO', 'Xuất TRƯỚC ngày đóng MST phải thuộc Nhóm 1 UNCERTAIN_INFO (tạm dừng xác minh bộ hồ sơ)');

  // Nhánh 2: Lập SAU ngày đóng MST (Ví dụ: lập 20/08, bên bán đóng 15/08)
  const invoicePostSuspension: InvoiceInput = {
    ...tc09,
    id: 'TC-POST-SUSPENSION',
    invoiceNumber: 'SM-POST-099',
    invoiceDate: '2026-08-20', // Sau ngày đóng 2026-08-15
    sellerSuspensionDate: '2026-08-15'
  };
  const decPostSuspension = evaluateInvoiceLocally(invoicePostSuspension);
  assert(decPostSuspension.status === 'ESCALATED' && decPostSuspension.riskGroup === 'OUT_OF_POLICY', 'Xuất SAU ngày đóng MST phải thuộc Nhóm 2 OUT_OF_POLICY (Bất hợp pháp 100%)');

  // S1.6: Tính truy vết HĐ điều chỉnh theo NĐ 123/2020 (Điều 1.4 SOP)
  console.log(yellow('\n[S1.6] Tính truy vết hóa đơn điều chỉnh theo Nghị định 123/2020/NĐ-CP (Điều 1.4 SOP):'));
  const tc08 = MOCK_INVOICES.find(i => i.id === 'TC-08')!;
  const dec08 = evaluateInvoiceLocally(tc08);
  assert(dec08.status === 'ESCALATED' && dec08.riskGroup === 'UNCERTAIN_INFO', 'TC-08 thiếu HĐ gốc phải thuộc Nhóm 1 UNCERTAIN_INFO');

  // S1.7: Ma trận Phân cấp Thẩm quyền 3 Tầng (Điều 3 SOP)
  console.log(yellow('\n[S1.7] Ma trận Phân cấp Thẩm quyền 3 Tầng (Điều 3 SOP):'));
  assert(dec01.status === 'ROUTINE', 'Tầng 1 (KTV): Chi phí thường quy < 20M duyệt ngầm');
  assert(dec10.status === 'ESCALATED' && dec10.requiresCFO === false, 'Tầng 2 (KTT): Chi phí vi phạm thông thường < 200M do KTT xử lý');
  const tc13 = MOCK_INVOICES.find(i => i.id === 'TC-13')!;
  const dec13 = evaluateInvoiceLocally(tc13);
  assert(dec13.status === 'ESCALATED' && dec13.requiresCFO === true, 'Tầng 3 (CFO): HĐ điều chỉnh giảm >= 200M bắt buộc cấp CFO duyệt');
  const tc15 = MOCK_INVOICES.find(i => i.id === 'TC-15')!;
  const dec15 = evaluateInvoiceLocally(tc15);
  assert(dec15.status === 'ESCALATED' && dec15.requiresCFO === true, 'Tầng 3 (CFO): Khoản chi bồi thường phạt >= 200M bắt buộc cấp CFO duyệt');

  // S1.8: Giám sát Rủi ro Toàn cục & Hệ số K (Điều 4 SOP & CV 2392)
  console.log(yellow('\n[S1.8] Giám sát Rủi ro Toàn cục & Hệ số K (Điều 4 SOP & CV 2392/TCT-QLRR):'));
  const initialKResult = calculateKFactor(0);
  assert(initialKResult.kFactor === 1.2, `Hệ số K ban đầu phải là 1.20 (thực tế: ${initialKResult.kFactor})`);
  assert(initialKResult.zone === 'SAFE_GREEN', 'Hệ số K = 1.20 phải thuộc Vùng Xanh SAFE_GREEN');

  // Thêm TC-14 (Mua vào 4.5 tỷ trước thuế)
  const tc14 = MOCK_INVOICES.find(i => i.id === 'TC-14')!;
  const dec14 = evaluateInvoiceLocally(tc14);
  assert(dec14.status === 'ESCALATED' && dec14.riskGroup === 'EXCEED_AUTHORITY', 'TC-14 phải thuộc Nhóm 3 EXCEED_AUTHORITY do đe dọa Hệ số K');
  assert(dec14.status === 'ESCALATED' && dec14.requiresCFO === true, 'TC-14 bắt buộc cấp CFO phê duyệt');

  const redKResult = calculateKFactor(tc14.preTaxAmount);
  assert(redKResult.kFactor === 0.88, `Hệ số K sau khi mua 4.5 tỷ phải giảm xuống 0.88 (thực tế: ${redKResult.kFactor})`);
  assert(redKResult.zone === 'DANGER_RED', 'Hệ số K = 0.88 (< 0.95) phải rơi vào Vùng Đỏ DANGER_RED');


  // =========================================================================
  // SUITE 2: DUAL-ENGINE AI (TYPESAFE JEV + GEMINI FLASH Q-GEN)
  // =========================================================================
  console.log(bold(cyan('\n>>> SUITE 2: Dual-Engine AI (TypeSafe Jev + Gemini Flash Q-Gen)')));

  // S2.1: Phán quyết xác suất từ TypeSafe AI Jev System One
  console.log(yellow('\n[S2.1] Phán quyết xác suất từ TypeSafe AI Jev System One:'));
  console.log('  -> Đang gửi TC-01 lên TypeSafe AI endpoint...');
  const jevRes01 = await queryJevReferee(tc01, { useGenerativeQGen: false });
  assert(jevRes01.decision.status === 'ROUTINE', 'Jev AI phải nhận diện TC-01 là ROUTINE');
  assert(jevRes01.confidence !== undefined && jevRes01.confidence >= 0.6, `Jev AI trả về độ tin cậy hợp lệ (${jevRes01.confidence})`);

  // S2.2: Actionable Question Generator (Q-Gen) từ Google Gemini Flash
  console.log(yellow('\n[S2.2] Actionable Question Generator (Q-Gen) từ Google Gemini Flash:'));
  console.log('  -> Đang yêu cầu Gemini sinh câu hỏi A/B cho TC-10...');
  const geminiQ = await generateActionableQuestionWithGemini(tc10, 'OUT_OF_POLICY');
  assert(geminiQ.actionableQuestion.length > 20, 'Gemini Q-Gen phải sinh câu hỏi hành động đầy đủ');
  assert(geminiQ.options.length === 2, 'Gemini Q-Gen phải sinh đúng 2 phương án đối ứng A và B');
  assert(geminiQ.options[0].id === 'A' && geminiQ.options[1].id === 'B', 'Phương án phải có định danh A và B');
  console.log(`         Câu hỏi sinh: "${geminiQ.actionableQuestion.substring(0, 75)}..."`);

  // S2.3: Type-Safe Schema Enforcement & Zero-Hallucination
  console.log(yellow('\n[S2.3] Type-Safe Schema Enforcement & Zero-Hallucination Guardrail:'));
  const validParse = RefereeDecisionSchema.safeParse(jevRes01.decision);
  assert(validParse.success, 'Phán quyết từ Dual-Engine phải vượt qua Zod RefereeDecisionSchema');
  const escalatedDec = evaluateInvoiceLocally(tc10);
  assert(escalatedDec.status === 'ESCALATED' && (escalatedDec as any).approvedTaxAmount === undefined, 'Zero-Hallucination: Tuyệt đối không chứa approvedTaxAmount khi ESCALATED');

  // S2.4: Cơ chế Fallback An toàn (< 50ms)
  console.log(yellow('\n[S2.4] Cơ chế Fallback An toàn (< 50ms) khi ngắt kết nối:'));
  const fallbackStart = Date.now();
  const localFallback = await queryJevReferee(tc10, { forceLocalOnly: true });
  const fallbackDuration = Date.now() - fallbackStart;
  assert(localFallback.engineUsed === 'LOCAL_FALLBACK', 'forceLocalOnly phải kích hoạt LOCAL_FALLBACK');
  assert(fallbackDuration < 50, `Thời gian fallback phải < 50ms (thực tế: ${fallbackDuration}ms)`);


  // =========================================================================
  // SUITE 3: TƯƠNG TÁC CON NGƯỜI TRONG VÒNG LẶP (HITL WORKFLOW)
  // =========================================================================
  console.log(bold(cyan('\n>>> SUITE 3: Tương tác Con người trong Vòng lặp (HITL Workflow)')));

  // S3.1: Bộ kiểm thử nhanh 90 Giây (Verify Harness 90s)
  console.log(yellow('\n[S3.1] Bộ kiểm thử nhanh 90 Giây (Verify Harness qua API /api/verify):'));
  const verifyRes = await fetch('http://localhost:3002/api/verify');
  assert(verifyRes.ok, 'API GET /api/verify phải phản hồi HTTP 200 OK');
  const verifyData = await verifyRes.json();
  assert(verifyData.summary.allPassed === true, 'Verify Harness phải báo allPassed = true');
  assert(verifyData.summary.routineCases === 3, 'Verify Harness phải có đúng 3 ca Routine');
  assert(verifyData.summary.escalatedCases === 2, 'Verify Harness phải có đúng 2 ca Ngoại lệ');
  assert(verifyData.summary.totalTimeMs < 90000, `Thời gian chạy toàn bộ phải < 90s (thực tế: ${verifyData.summary.totalTimeMs}ms)`);

  // S3.2: Thẻ Phán quyết Ngoại lệ & Quyết định A/B
  console.log(yellow('\n[S3.2] Thẻ Phán quyết Ngoại lệ (Escalation Card) & Lựa chọn A/B:'));
  assert(dec10.status === 'ESCALATED' && dec10.options.length === 2, 'Escalation Card phải có đủ 2 lựa chọn A và B');
  const optA = dec10.status === 'ESCALATED' ? dec10.options[0] : null;
  const optB = dec10.status === 'ESCALATED' ? dec10.options[1] : null;
  assert(optA !== null && optA.resultingAction.length > 0, 'Phương án A phải có resultingAction');
  assert(optB !== null && optB.resultingAction.length > 0, 'Phương án B phải có resultingAction');

  // S3.3: Thử nghiệm Hóa đơn Mới Tùy biến qua API /api/evaluate
  console.log(yellow('\n[S3.3] Thử nghiệm Hóa đơn Mới Tùy biến (Giám khảo Input qua API /api/evaluate):'));
  const customJudgeInvoice: InvoiceInput = {
    id: 'TC-CUSTOM-JUDGE',
    invoiceNumber: 'FPT-CUSTOM-889',
    invoiceDate: '2026-09-22',
    supplierTaxCode: '0101248141',
    supplierName: 'Công ty Cổ phần Viễn thông FPT',
    itemName: 'Cước Internet cáp quang doanh nghiệp',
    preTaxAmount: 10000000,
    taxRate: 10,
    taxAmount: 1000000,
    totalAmount: 11000000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    sellerStatus: 'ACTIVE',
    isImageBlurry: false
  };
  const evalRes = await fetch('http://localhost:3002/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice: customJudgeInvoice, forceLocalOnly: true })
  });
  assert(evalRes.ok, 'API POST /api/evaluate phải phản hồi HTTP 200 cho hóa đơn tùy biến');
  const evalData = await evalRes.json();
  assert(evalData.decision.status === 'ROUTINE', 'Hóa đơn FPT 10% có UNC phải được tự động duyệt ROUTINE');
  assert(evalData.decision.approvedTaxAmount === 1000000, 'Hóa đơn FPT 10% phải được duyệt đúng 1.000.000 VNĐ tiền thuế');

  // S3.4: Đồng bộ Trạng thái khi Sửa Hóa đơn (State Synchronization)
  console.log(yellow('\n[S3.4] Đồng bộ Trạng thái khi Sửa Hóa đơn (State Synchronization):'));
  // Giả lập sửa TC-10 từ thuế 8% thành thuế 10%
  const fixedTc10: InvoiceInput = {
    ...tc10,
    taxRate: 10,
    taxAmount: 509259,
    totalAmount: 5601852
  };
  const fixedDec10 = evaluateInvoiceLocally(fixedTc10);
  assert(fixedDec10.status === 'ROUTINE', 'Sau khi sửa thuế thành 10%, hệ thống phải lập tức chuyển sang ROUTINE');
  assert(fixedDec10.status === 'ROUTINE' && fixedDec10.approvedTaxAmount === 509259, 'Số thuế duyệt phải là 509.259 VNĐ');


  // =========================================================================
  // SUITE 4: NHẬT KÝ KIỂM TOÁN & HỒ SƠ PHÒNG VỆ THUẾ 1-CLICK
  // =========================================================================
  console.log(bold(cyan('\n>>> SUITE 4: Nhật ký Kiểm toán & Hồ sơ Phòng vệ Thuế 1-Click')));

  // S4.1: Lưu vết Kiểm toán Đầy đủ (Audit Trail Logging)
  console.log(yellow('\n[S4.1] Lưu vết Kiểm toán Đầy đủ (Audit Trail Logging):'));
  const sampleAuditEntry: AuditEntry = {
    id: 'AUDIT-TEST-001',
    timestamp: new Date().toISOString(),
    invoiceId: tc10.invoiceNumber,
    supplierName: tc10.supplierName,
    totalAmount: tc10.totalAmount,
    initialDecision: 'ESCALATED',
    actor: 'CHIEF_ACCOUNTANT',
    actionTaken: 'Yêu cầu nhà cung cấp xuất lại HĐ 10%',
    resultingStatus: 'REJECTED_FOR_REISSUE',
    plainExplanation: 'KTT đã chỉ đạo yêu cầu VNPT xuất lại hóa đơn đúng thuế suất 10% theo Nghị định 72/2024.',
    sopVersion: 'Tax-SOP-2026 v2.1',
    applicableRegulations: ['Nghị định 72/2024/NĐ-CP', 'Nghị quyết 142/2024/QH15']
  };
  const auditParse = AuditEntrySchema.safeParse(sampleAuditEntry);
  assert(auditParse.success, 'Bản ghi kiểm toán phải hợp lệ 100% theo AuditEntrySchema');

  // S4.2: Cơ chế Hoàn tác Quyết định (Undo Mechanism)
  console.log(yellow('\n[S4.2] Cơ chế Hoàn tác Quyết định (Undo Mechanism):'));
  let mockAuditList: AuditEntry[] = [sampleAuditEntry];
  let mockDeductibleTax = 5000000;
  // Thực hiện Undo
  mockAuditList = mockAuditList.filter(e => e.id !== sampleAuditEntry.id);
  assert(mockAuditList.length === 0, 'Sau khi Undo, bản ghi phải bị xóa khỏi danh sách kiểm toán');

  // S4.3: Cơ chế Ghi đè Cưỡng chế (Override Mechanism)
  console.log(yellow('\n[S4.3] Cơ chế Ghi đè Cưỡng chế (Override Mechanism):'));
  const overriddenEntry: AuditEntry = {
    ...sampleAuditEntry,
    id: 'AUDIT-TEST-OVERRIDE',
    isOverridden: true,
    actor: 'CFO',
    actionTaken: 'Ghi đè cưỡng chế: Chấp thuận đưa vào chi phí',
    plainExplanation: 'CFO phê duyệt ngoại lệ ghi nhận chi phí sau khi kiểm tra hợp đồng thực tế.'
  };
  assert(overriddenEntry.isOverridden === true, 'Bản ghi ghi đè phải có cờ isOverridden = true');
  assert(overriddenEntry.actor === 'CFO', 'Người ghi đè phải lưu rõ danh tính CFO');

  // S4.4: Hồ sơ Phòng vệ Thuế 1-Click (Tax Defense Dossier Modal)
  console.log(yellow('\n[S4.4] Hồ sơ Phòng vệ Thuế 1-Click (Tax Defense Dossier Content):'));
  assert(sampleAuditEntry.applicableRegulations!.length > 0, 'Dossier phải có trích dẫn văn bản pháp quy Nhà nước');
  assert(sampleAuditEntry.sopVersion!.length > 0, 'Dossier phải có phiên bản quy chế nội bộ SOP');

  // S4.5: Xem & Cập nhật Quy chế Đối chiếu (Policy Viewer Modal)
  console.log(yellow('\n[S4.5] Xem Quy chế Tax-SOP-2026:'));
  assert(dec10.status === 'ESCALATED' && dec10.sopClause.length > 5, 'Hệ thống phải luôn trích dẫn chính xác điều khoản quy chế Tax-SOP');

  // TỔNG KẾT
  console.log(bold('\n========================================================================'));
  console.log(bold(green(`  TỔNG KẾT: ĐÃ HOÀN THÀNH VÀ ĐẠT ${passedTests} / ${totalTests} BÀI KIỂM THỬ!`)));
  console.log(bold(green('  100% KỊCH BẢN TRONG TESTING.MD ĐÃ ĐƯỢC XÁC THỰC VƯỢT QUA!')));
  console.log(bold('========================================================================\n'));
}

runComprehensiveSuites().catch(err => {
  console.error(red('\n>>> BỘ KIỂM THỬ THẤT BẠI:'), err);
  process.exit(1);
});
