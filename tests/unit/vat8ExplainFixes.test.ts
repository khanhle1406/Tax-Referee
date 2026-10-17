/**
 * Sửa lỗi engine do vòng cải tiến 17/10 tạo ra (rà soát nghiệp vụ thuế trước khi mở PR):
 * - từ khóa xe chịu TTĐB không chặn thừa dịch vụ cho xe bán tải/pick-up, phí "pick-up hàng", xe bán tải cabin đơn;
 * - đáp án B của câu hỏi 8% ghi đúng hệ quả thật (từ chối cả hóa đơn) và tên dòng hàng được cắt ngắn;
 * - phiếu giải trình không khẳng định pháp lý thay cho phép so từ khóa, xét cả dòng hàng 8%, và nói đúng ca tự duyệt nhờ tiền lệ CFO.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoCompanyTaxCode } from '../../data/verification/challengeCases';
import { explainDecision } from '../../lib/explainDecision';
import { getActivePolicy, runIsolated } from '../../lib/server/db';
import type { InvoiceInput } from '../../lib/schemas';
import { evaluateInvoiceLocally } from '../../services/policyEngine';
import { createPrecedent } from '../../services/precedentService';

const base: InvoiceInput = { id: 'VX-1', invoiceNumber: '0002001', invoiceDate: '2026-10-05', supplierTaxCode: '0316789013', supplierName: 'Công ty TNHH Văn Phòng Xanh',
  buyerTaxCode: demoCompanyTaxCode, sellerStatus: 'ACTIVE', itemName: 'Giấy in A4', preTaxAmount: 4_000_000, taxRate: 8, taxAmount: 320_000, totalAmount: 4_320_000,
  paymentMethod: 'BANK_TRANSFER', hasBankSlip: true, isImageBlurry: false, isAdjustment: false };

type Decision = ReturnType<typeof evaluateInvoiceLocally>;
const withPolicy = <T>(fn: (evaluate: (inv: InvoiceInput) => Decision, config: ReturnType<typeof getActivePolicy>['config']) => T | Promise<T>) =>
  runIsolated(async () => {
    const policy = getActivePolicy();
    const config = { ...policy.config, companyTaxCode: demoCompanyTaxCode };
    return fn(inv => evaluateInvoiceLocally(inv, config, policy.version), config);
  });
const rules = (d: Decision) => (d.findings ?? []).map(f => f.ruleId);
type SpecItem = { ruleIds: string[]; text: string; answers: [string, string]; effects: Array<{ kind: string }> };
const vat8Item = (d: Decision): SpecItem | undefined =>
  d.status === 'ESCALATED' ? (d.handoff?.questionSpec?.items as SpecItem[] | undefined)?.find(item => item.ruleIds.includes('STATUTORY_RES_204_VAT_8_EXCLUDED')) : undefined;

test('xe chịu TTĐB: dịch vụ cho xe bán tải, phí pick-up hàng, xe bán tải cabin đơn không bị loại khỏi 8%; cabin kép vẫn bị loại', async () => {
  await withPolicy(evaluate => {
    const run = (id: string, itemName: string) => evaluate({ ...base, id, itemName });
    for (const name of ['Phí pick-up hàng tại kho khách', 'Sửa chữa xe bán tải Ford Ranger', 'Xe bán tải cabin đơn Isuzu D-Max']) {
      const d = run(`VX-R-${name}`, name);
      assert.equal(d.status, 'ROUTINE', `${name}: ${JSON.stringify(rules(d))}`);
    }
    for (const name of ['Bảo dưỡng xe bán tải cabin kép Toyota Hilux', 'Thuê xe pick-up 3 ngày', 'Lốp xe bán tải 265/65R17', 'Phụ tùng xe pick up Ford Ranger',
      'Rửa xe bán tải', 'Sửa chữa xe ô tô tải pick-up cabin kép', 'Xe pick-up single cab Isuzu'])
      assert.ok(!rules(run(`VX-S-${name}`, name)).includes('STATUTORY_RES_204_VAT_8_EXCLUDED'), `${name}: dịch vụ/xe tải không chịu TTĐB`);
    for (const name of ['Xe bán tải cabin kép Ford Ranger', 'Xe bán tải Ford Ranger', 'Xe pick-up Toyota Hilux', 'Xe Ford Ranger pick-up', 'Ô tô pickup Mitsubishi Triton', 'Ford Ranger Pickup 2.0 AT', 'Pickup Mitsubishi Triton 4x4'])
      assert.ok(rules(run(`VX-X-${name}`, name)).includes('STATUTORY_RES_204_VAT_8_EXCLUDED'), `${name}: xe chịu TTĐB vẫn bị loại khỏi 8%`);
  });
});

test('câu hỏi 8%: đáp án B ghi đúng hệ quả thật (không khấu trừ toàn bộ VAT của hóa đơn); tên dòng hàng được cắt, tối đa 3 dòng', async () => {
  await withPolicy(evaluate => {
    const items: NonNullable<InvoiceInput['items']> = [
      { lineNumber: 1, itemName: 'Giấy in A4', quantity: 1, unitPrice: 2_000_000, amount: 2_000_000, taxRate: 8, taxAmount: 160_000 },
      { lineNumber: 2, itemName: 'Cước Internet tháng 9', quantity: 1, unitPrice: 1_000_000, amount: 1_000_000, taxRate: 8, taxAmount: 80_000 },
    ];
    const mixed = evaluate({ ...base, id: 'VX-Q1', itemName: 'Văn phòng phẩm tháng 9', preTaxAmount: 3_000_000, taxAmount: 240_000, totalAmount: 3_240_000, items });
    const item = vat8Item(mixed);
    assert.ok(item, JSON.stringify(rules(mixed)));
    assert.match(item.answers[1], /Không khấu trừ toàn bộ 240\.000\s?₫/);
    assert.match(item.answers[1], /yêu cầu NCC điều chỉnh/);
    assert.equal(item.effects[1].kind, 'REJECT', 'không đổi loại hệ quả: B vẫn từ chối cả hồ sơ');

    const longName = (n: number) => `Cước thuê bao di động số 0901234${n}${n}${n} tháng 09/2026 gói doanh nghiệp không giới hạn dữ liệu tốc độ cao kèm 1000 phút gọi nội mạng`;
    const lines = Array.from({ length: 5 }, (_, i) => ({ lineNumber: i + 1, itemName: longName(i), quantity: 1, unitPrice: 100_000, amount: 100_000, taxRate: 8 as const, taxAmount: 8_000 }));
    const telecom = evaluate({ ...base, id: 'VX-Q2', itemName: 'Cước di động tháng 9', preTaxAmount: 500_000, taxAmount: 40_000, totalAmount: 540_000, items: lines });
    const longItem = vat8Item(telecom);
    assert.ok(longItem, JSON.stringify(rules(telecom)));
    assert.ok(longItem.text.length <= 700, `ý hỏi dài ${longItem.text.length} ký tự`);
    assert.match(longItem.text, /và 2 dòng khác/);
    assert.ok(!longItem.text.includes(longName(0)), 'tên dòng hàng phải được cắt');
  });
});

test('phiếu giải trình 8%: không khẳng định pháp lý thay cho phép so từ khóa; xét cả dòng hàng 8% khi đầu hóa đơn ghi 10%', async () => {
  await withPolicy((evaluate, config) => {
    const paper = { ...base, id: 'VX-E1' };
    const single = explainDecision(paper, evaluate(paper), config).checks.find(c => c.key === 'vat8');
    assert.ok(single?.ok, JSON.stringify(single));
    assert.match(single.detail, /không khớp danh mục từ khóa loại trừ đang cấu hình \(kiểm tự động theo tên hàng\)/);
    assert.ok(!/không thuộc nhóm loại trừ/.test(single.detail));

    const items: NonNullable<InvoiceInput['items']> = [
      { lineNumber: 1, itemName: 'Giấy in A4', quantity: 10, unitPrice: 200_000, amount: 2_000_000, taxRate: 8, taxAmount: 160_000 },
      { lineNumber: 2, itemName: 'Cước internet cáp quang tháng 9', quantity: 1, unitPrice: 1_000_000, amount: 1_000_000, taxRate: 10, taxAmount: 100_000 },
    ];
    const multi: InvoiceInput = { ...base, id: 'VX-E2', itemName: 'Văn phòng phẩm và cước internet', preTaxAmount: 3_000_000, taxRate: 10, taxAmount: 260_000, totalAmount: 3_260_000, items };
    const decision = evaluate(multi);
    assert.equal(decision.status, 'ROUTINE', JSON.stringify(rules(decision)));
    const lineCheck = explainDecision(multi, decision, config).checks.find(c => c.key === 'vat8');
    assert.ok(lineCheck, 'hóa đơn có dòng 8% phải có ô kiểm 8% dù đầu hóa đơn ghi 10%');
    assert.equal(lineCheck.ok, true);
  });
});

test('phiếu giải trình ca tự duyệt nhờ tiền lệ CFO: phát hiện đã giải tỏa không tô đỏ, ô phạm vi đạt kèm ghi chú tiền lệ', async () => {
  await withPolicy((evaluate, config) => {
    const today = new Date().toISOString().slice(0, 10);
    const precedent = createPrecedent({ supplierTaxCode: '0319800001', supplierName: 'Nhà hàng Sen Vàng', riskPattern: 'INTERNAL_POLICY_GUEST_ENTERTAINMENT', sopClause: 'Quy chế tiếp khách',
      approvedOption: 'ACCEPT_ADJUSTMENT', rationale: 'CFO cho phép tiếp khách đối tác', approvedBy: 'CFO', purpose: 'tiếp khách', maximumAmount: 5_000_000, currentThreshold: 5_000_000 });
    const inv: InvoiceInput = { ...base, id: 'VX-P1', invoiceDate: today, supplierTaxCode: '0319800001', supplierName: 'Nhà hàng Sen Vàng', itemName: 'Bia Heineken tiếp khách đối tác',
      preTaxAmount: 3_000_000, taxRate: 10, taxAmount: 300_000, totalAmount: 3_300_000, hasItemManifest: true };
    const decision = evaluate(inv);
    assert.equal(decision.status, 'ROUTINE', JSON.stringify(rules(decision)));
    assert.ok(decision.status === 'ROUTINE' && decision.precedentApplied?.precedentId === precedent.id);
    assert.ok(rules(decision).includes('INTERNAL_POLICY_GUEST_ENTERTAINMENT'), 'quyết định vẫn mang phát hiện đã được tiền lệ giải tỏa');
    const explanation = explainDecision(inv, decision, config);
    assert.equal(explanation.verdict, 'APPROVED');
    assert.deepEqual(explanation.highlights.map(h => h.ruleId), [], 'phát hiện đã giải tỏa không thành ô đỏ');
    const scope = explanation.checks.find(c => c.key === 'scope');
    assert.equal(scope?.ok, true);
    assert.match(scope.detail, /áp tiền lệ.*đã được CFO duyệt/);
    assert.ok(explanation.checks.every(c => c.ok !== false), JSON.stringify(explanation.checks.filter(c => c.ok === false)));
    assert.match(explanation.plain, /tiền lệ/);
    assert.match(explanation.headline, /tiền lệ/);
  });
});
