import './setup-env';
import { queryJevReferee } from '../services/jevService';
import { MOCK_INVOICES } from '../data/mockInvoices';

async function runDualEngineVerification() {
  console.log('================================================================');
  console.log('XÁC MINH DUAL-ENGINE AI (JEV SYSTEM ONE + GEMINI FLASH Q-GEN)');
  console.log('================================================================\n');

  // Test 3 ca đại diện cho 3 nhóm và 1 ca thường quy
  const testSample = [
    { name: 'TC-01: Thường quy (ROUTINE)', invoice: MOCK_INVOICES[0], expectStatus: 'ROUTINE' },
    { name: 'TC-07: Taxi mờ tiền (UNCERTAIN_INFO)', invoice: MOCK_INVOICES[6], expectStatus: 'ESCALATED' },
    { name: 'TC-10: Cước viễn thông sai thuế 8% (OUT_OF_POLICY)', invoice: MOCK_INVOICES[9], expectStatus: 'ESCALATED' },
    { name: 'TC-13: Hòa Phát giảm giá -250M (EXCEED_AUTHORITY)', invoice: MOCK_INVOICES[12], expectStatus: 'ESCALATED' }
  ];

  let successCount = 0;

  for (const sample of testSample) {
    console.log(`>>> Đang kiểm thử [${sample.name}]...`);
    const startTime = Date.now();
    try {
      const result = await queryJevReferee(sample.invoice);
      const duration = Date.now() - startTime;

      console.log(`    + Thời gian phản hồi: ${duration}ms`);
      console.log(`    + Engine sử dụng: ${result.engineUsed}`);
      console.log(`    + Độ tin cậy (Confidence): ${Math.round(result.confidence * 100)}% | Risk Score: ${result.riskScore}`);
      console.log(`    + Phán quyết: ${result.decision.status}`);

      if (result.decision.status === 'ROUTINE') {
        console.log(`    + Thuế được duyệt: ${result.decision.approvedTaxAmount.toLocaleString('vi-VN')} VNĐ`);
      } else {
        console.log(`    + Nhóm rủi ro: ${result.decision.riskGroup}`);
        console.log(`    + Lý do cắm cờ: ${result.decision.flaggedReason}`);
        console.log(`    + Căn cứ SOP: ${result.decision.sopClause}`);
        console.log(`    + Câu hỏi hành động A/B: "${result.decision.actionableQuestion}"`);
        console.log(`    + Nút A: [${result.decision.options[0].label}] -> ${result.decision.options[0].resultingAction}`);
        console.log(`    + Nút B: [${result.decision.options[1].label}] -> ${result.decision.options[1].resultingAction}`);
        console.log(`    + Cấp phê duyệt: ${result.decision.requiresCFO ? 'CFO' : 'KTT'}`);
      }

      if (result.decision.status === sample.expectStatus) {
        console.log(`    => KẾT QUẢ: PASS (Hợp lệ 100% Type-Safe Guardrail)\n`);
        successCount++;
      } else {
        console.error(`    => KẾT QUẢ: FAIL (Lệch trạng thái kỳ vọng ${sample.expectStatus})\n`);
      }
    } catch (err) {
      console.error(`    => LỖI THỰC THI:`, err);
    }
  }

  console.log('================================================================');
  console.log(`TỔNG KẾT: ${successCount} / ${testSample.length} CA TEST DUAL-ENGINE THÀNH CÔNG RỰC RỠ!`);
  console.log('================================================================');

  if (successCount === testSample.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runDualEngineVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
