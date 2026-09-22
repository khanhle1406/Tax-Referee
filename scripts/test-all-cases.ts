import { MOCK_INVOICES } from '../data/mockInvoices';
import { evaluateInvoiceLocally, calculateKFactor } from '../services/policyEngine';

console.log('====================================================');
console.log('KIỂM THỬ TOÀN BỘ 15 HỒ SƠ TAX REFEREE (SPRINT 1)');
console.log('====================================================\n');

let passedCount = 0;

const expectedMap: Record<string, { status: 'ROUTINE' | 'ESCALATED'; riskGroup?: string }> = {
  'TC-01': { status: 'ROUTINE' },
  'TC-02': { status: 'ROUTINE' },
  'TC-03': { status: 'ROUTINE' },
  'TC-04': { status: 'ROUTINE' },
  'TC-05': { status: 'ROUTINE' },
  'TC-06': { status: 'ROUTINE' },
  'TC-07': { status: 'ESCALATED', riskGroup: 'UNCERTAIN_INFO' },
  'TC-08': { status: 'ESCALATED', riskGroup: 'UNCERTAIN_INFO' },
  'TC-09': { status: 'ESCALATED', riskGroup: 'UNCERTAIN_INFO' },
  'TC-10': { status: 'ESCALATED', riskGroup: 'OUT_OF_POLICY' },
  'TC-11': { status: 'ESCALATED', riskGroup: 'OUT_OF_POLICY' },
  'TC-12': { status: 'ESCALATED', riskGroup: 'OUT_OF_POLICY' },
  'TC-13': { status: 'ESCALATED', riskGroup: 'EXCEED_AUTHORITY' },
  'TC-14': { status: 'ESCALATED', riskGroup: 'EXCEED_AUTHORITY' },
  'TC-15': { status: 'ESCALATED', riskGroup: 'EXCEED_AUTHORITY' }
};

MOCK_INVOICES.forEach((inv) => {
  const decision = evaluateInvoiceLocally(inv);
  const expected = expectedMap[inv.id];

  const statusMatch = decision.status === expected.status;
  const riskMatch = expected.riskGroup
    ? (decision.status === 'ESCALATED' && decision.riskGroup === expected.riskGroup)
    : true;
  const isPassed = statusMatch && riskMatch;

  if (isPassed) {
    passedCount++;
    console.log(`[PASS] ${inv.id}: ${inv.supplierName}`);
    console.log(`       -> Trạng thái: ${decision.status} ${decision.riskGroup ? `(${decision.riskGroup})` : ''}`);
    if (decision.status === 'ESCALATED') {
      console.log(`       -> Lý do: ${decision.flaggedReason}`);
      console.log(`       -> Câu hỏi A/B: "${decision.actionableQuestion.substring(0, 75)}..."`);
      console.log(`       -> Lựa chọn A: "${decision.options[0].label}"`);
      console.log(`       -> Lựa chọn B: "${decision.options[1].label}"`);
    }
  } else {
    console.error(`[FAIL] ${inv.id}: Kỳ vọng ${expected.status} (${expected.riskGroup}), thực tế nhận ${decision.status} (${decision.status === 'ESCALATED' ? decision.riskGroup : ''})`);
  }
  console.log('----------------------------------------------------');
});

console.log(`\nKẾT QUẢ: ${passedCount} / ${MOCK_INVOICES.length} TEST CASES ĐẠT CHUẨN 100%`);

// Kiểm thử Hệ số K
const initialK = calculateKFactor(0);
console.log(`\nKiểm tra Hệ số K ban đầu: ${initialK.kFactor} -> ${initialK.zone}`);

const highPurchaseK = calculateKFactor(4_500_000_000);
console.log(`Kiểm tra Hệ số K khi mua vào thêm 4.5 tỷ: ${highPurchaseK.kFactor} -> ${highPurchaseK.zone}`);

if (passedCount === 15 && initialK.zone === 'SAFE_GREEN' && highPurchaseK.zone === 'DANGER_RED') {
  console.log('\n>>> TẤT CẢ 15 BÀI KIỂM THỬ ĐÃ ĐẠT CHUẨN XUẤT SẮC 100%! <<<');
  process.exit(0);
} else {
  console.error('\n>>> CÓ LỖI TRONG BÀI KIỂM THỬ! <<<');
  process.exit(1);
}
