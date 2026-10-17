/**
 * Ca rút ra từ mô phỏng phần kiểm thử chung kết (3 giám khảo tự soạn ca từ SOP của đội, 17/10/2026):
 * không chuyển thừa ca thường quy hợp lệ, không bỏ sót ca ngoài quy định, câu hỏi chốt được trong một lần trả lời.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoCompanyTaxCode } from '../../data/verification/challengeCases';
import { parseXml } from '../../lib/documentParser';
import { expectedHeaderTax } from '../../lib/invoiceMath';
import { getActivePolicy, runIsolated } from '../../lib/server/db';
import type { InvoiceInput } from '../../lib/schemas';
import { DEMO_SAMPLE_CASES } from '../../services/demoSeed';
import { evaluateInvoiceLocally } from '../../services/policyEngine';
import { coerceFieldValue } from '../../services/workflowService';

const base: InvoiceInput = { id: 'J-1', invoiceNumber: '0001001', invoiceDate: '2026-10-05', supplierTaxCode: '0316789013', supplierName: 'Công ty TNHH Văn Phòng Xanh',
  buyerTaxCode: demoCompanyTaxCode, sellerStatus: 'ACTIVE', itemName: 'Giấy in A4', preTaxAmount: 1_000_000, taxRate: 10, taxAmount: 100_000, totalAmount: 1_100_000,
  paymentMethod: 'BANK_TRANSFER', isImageBlurry: false, isAdjustment: false };

const withPolicy = <T>(fn: (evaluate: (inv: InvoiceInput, context?: InvoiceInput[]) => ReturnType<typeof evaluateInvoiceLocally>) => T) =>
  runIsolated(async () => {
    const policy = getActivePolicy();
    const config = { ...policy.config, companyTaxCode: demoCompanyTaxCode };
    return fn((inv, context) => evaluateInvoiceLocally(inv, config, policy.version, undefined, context));
  });
const rules = (d: ReturnType<typeof evaluateInvoiceLocally>) => (d.findings ?? []).map(f => f.ruleId);
const handoffOf = (d: ReturnType<typeof evaluateInvoiceLocally>) => (d.status === 'ESCALATED' ? d.handoff : undefined);

test('hóa đơn nhiều thuế suất hợp lệ (8% + 10%) tự duyệt; thuế tổng lệch tổng thuế các dòng vẫn bị hỏi', async () => {
  await withPolicy(evaluate => {
    const items: NonNullable<InvoiceInput['items']> = [
      { lineNumber: 1, itemName: 'Giấy in A4', quantity: 10, unitPrice: 200_000, amount: 2_000_000, taxRate: 8, taxAmount: 160_000 },
      { lineNumber: 2, itemName: 'Cước internet cáp quang tháng 9', quantity: 1, unitPrice: 1_000_000, amount: 1_000_000, taxRate: 10, taxAmount: 100_000 },
    ];
    const multi: InvoiceInput = { ...base, id: 'J-MR', itemName: 'Văn phòng phẩm và cước internet', preTaxAmount: 3_000_000, taxRate: 10, taxAmount: 260_000, totalAmount: 3_260_000, items };
    assert.equal(expectedHeaderTax(multi), 260_000);
    assert.equal(evaluate(multi).status, 'ROUTINE', JSON.stringify(rules(evaluate(multi))));
    // Đầu hóa đơn ghi 8%: dòng cước internet chịu 10% nên không phải "áp sai 8%".
    assert.equal(evaluate({ ...multi, id: 'J-MR8', taxRate: 8 }).status, 'ROUTINE', JSON.stringify(rules(evaluate({ ...multi, id: 'J-MR8', taxRate: 8 }))));
    // 30 dòng làm tròn thuế từng dòng: lệch cách làm tròn theo nhóm quá 10₫ nhưng khớp tổng thuế các dòng.
    const many: NonNullable<InvoiceInput['items']> = [...Array.from({ length: 30 }, (_, i) => ({ lineNumber: i + 1, itemName: `Văn phòng phẩm ${i + 1}`, quantity: 1, unitPrice: 1_006, amount: 1_006, taxRate: 8 as const, taxAmount: 80 })),
      { lineNumber: 31, itemName: 'Giấy in', quantity: 1, unitPrice: 100_000, amount: 100_000, taxRate: 10 as const, taxAmount: 10_000 }];
    const manyInv: InvoiceInput = { ...base, id: 'J-MR30', itemName: 'Văn phòng phẩm', preTaxAmount: 130_180, taxRate: 10, taxAmount: 12_400, totalAmount: 142_580, items: many };
    assert.equal(evaluate(manyInv).status, 'ROUTINE', JSON.stringify(rules(evaluate(manyInv))));
    const wrong = evaluate({ ...multi, id: 'J-MRX', taxAmount: 265_000, totalAmount: 3_265_000 });
    assert.ok(rules(wrong).includes('RULE_DATA_QUALITY'));
    assert.match(handoffOf(wrong)?.question ?? '', /tổng thuế các dòng hàng/);
  });
});

test('đáp án sửa số thuế không ghi nhận VAT không có trên hóa đơn: tổng in khớp mới tự sửa, ngược lại phải nhập số đúng', async () => {
  await withPolicy(evaluate => {
    const effectA = (inv: InvoiceInput) => {
      const items: Array<{ ruleIds: string[]; effects?: unknown[] }> = handoffOf(evaluate(inv))?.questionSpec?.items ?? [];
      const item = items.find(entry => entry.ruleIds.includes('RULE_DATA_QUALITY'));
      return item?.effects?.[0];
    };
    // Hóa đơn tự nhất quán với số thuế 80.000₫ (tổng 1.080.000₫): không được tự đổi thành 100.000₫.
    assert.deepEqual(effectA({ ...base, id: 'J-DQ1', taxAmount: 80_000, totalAmount: 1_080_000 }), { kind: 'NEED_VALUE', field: 'taxAmount' });
    // Tổng in 1.100.000₫ khớp 10% × 1.000.000₫: chỉ ô thuế đọc sai; sửa đúng ô thuế, không đụng tổng.
    assert.deepEqual(effectA({ ...base, id: 'J-DQ2', taxAmount: 80_000, totalAmount: 1_100_000 }), { kind: 'SET_FIELDS', values: { taxAmount: 100_000 }, confirm: ['taxAmount'] });
  });
});

test('ô tô tải 8% không bị coi là hàng chịu TTĐB; ô tô con, pick-up cabin kép vẫn bị loại khỏi 8%', async () => {
  await withPolicy(evaluate => {
    const car = (id: string, itemName: string) => rules(evaluate({ ...base, id, itemName, preTaxAmount: 4_000_000, taxRate: 8, taxAmount: 320_000, totalAmount: 4_320_000 }));
    assert.ok(!car('J-T1', 'Xe ô tô tải Hyundai 1,5 tấn').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'));
    assert.ok(car('J-T2', 'Xe ô tô con Toyota Vios').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'));
    assert.ok(car('J-T3', 'Xe ô tô tải pick-up cabin kép Ford Ranger').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'));
    assert.ok(car('J-T6', 'Xe bán tải Ford Ranger cabin kép').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'), 'xe chịu TTĐB gọi tên thông dụng, không có chữ ô tô');
    for (const name of ['Ô tô tải (VAN) Kia', 'Xe ô tô tải ca-bin kép Toyota Hilux', 'Xe ô tô tải ca bin kép Ford Ranger', 'Xe ô tô tải double cab Ford Ranger'])
      assert.ok(car(`J-TV-${name}`, name).includes('STATUTORY_RES_204_VAT_8_EXCLUDED'), `${name}: hàng chịu TTĐB, như trên main`);
    assert.ok(car('J-TB', 'bia so 1 thung 24 lon').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'), 'bia không dấu vẫn là bia');
    // Một dòng hàng: tên chung ở đầu hóa đơn vẫn quyết định.
    assert.ok(rules(evaluate({ ...base, id: 'J-H1', itemName: 'Cước di động tháng 9', taxRate: 8, preTaxAmount: 50_000, taxAmount: 4_000, totalAmount: 54_000,
      items: [{ lineNumber: 1, itemName: 'Dịch vụ tháng 9', quantity: 1, unitPrice: 50_000, amount: 50_000, taxRate: 10, taxAmount: 5_000 }] })).includes('STATUTORY_RES_204_VAT_8_EXCLUDED'));
    assert.ok(!car('J-T7', 'xe o to tai van chuyen hang').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'), 'không dấu "tải vận" không phải xe VAN');
    assert.ok(car('J-T8', 'Tiền thuê nhà làm văn phòng tháng 10').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'));
    assert.ok(!car('J-T9', 'Tiền thuê nhà hàng tổ chức tiệc tất niên').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'));
    assert.ok(car('J-T4', 'Thuê văn phòng tháng 10/2026').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'), 'thuê văn phòng = kinh doanh bất động sản');
    assert.ok(!car('J-T5', 'Thuê nhà hàng tổ chức hội nghị khách hàng').includes('STATUTORY_RES_204_VAT_8_EXCLUDED'));
  });
});

test('quà tặng khách hàng ngoài phạm vi tự duyệt; bánh trung thu cho nhân viên, "tăng khách hàng" không dấu, "bia hồ sơ" không dấu không bị bắt nhầm', async () => {
  await withPolicy(evaluate => {
    const r = (id: string, itemName: string) => rules(evaluate({ ...base, id, itemName }));
    assert.ok(r('J-G1', 'Bánh trung thu tặng khách hàng').includes('RULE_SCOPE_NOT_COVERED'));
    assert.ok(r('J-G2', 'Quà trung thu đối tác').includes('RULE_SCOPE_NOT_COVERED'));
    assert.deepEqual(r('J-G3', 'Bánh trung thu cho nhân viên'), []);
    assert.deepEqual(r('J-G4', 'chien dich quang cao tang khach hang'), []);
    assert.deepEqual(r('J-G5', 'Bia ho so nhua A4'), []);
    assert.ok(r('J-G6', 'bia ha noi tiep khach').includes('INTERNAL_POLICY_GUEST_ENTERTAINMENT'));
  });
});

test('câu hỏi cụm tiền mặt cùng ngày nêu từng hóa đơn trong cụm; câu hỏi 8% không bị cắt cụt', async () => {
  await withPolicy(evaluate => {
    const first: InvoiceInput = { ...base, id: 'J-C1', invoiceNumber: '0000771', itemName: 'Văn phòng phẩm', preTaxAmount: 3_000_000, taxRate: 8, taxAmount: 240_000, totalAmount: 3_240_000, paymentMethod: 'CASH' };
    const second: InvoiceInput = { ...base, id: 'J-C2', invoiceNumber: '0000772', itemName: 'Mực in', preTaxAmount: 1_600_000, taxRate: 10, taxAmount: 160_000, totalAmount: 1_760_000, paymentMethod: 'CASH' };
    const decision = evaluate(second, [first]);
    assert.ok(rules(decision).includes('STATUTORY_SAME_DAY_CASH_5M'));
    assert.match(handoffOf(decision)?.question ?? '', /HĐ 0000771 \(3\.240\.000\s?₫, tiền mặt\)/);
    assert.match(handoffOf(decision)?.question ?? '', /cộng lại 5\.000\.000\s?₫/);
    const vat8 = evaluate({ ...base, id: 'J-V8', itemName: 'Cước viễn thông di động tháng 9', taxRate: 8, taxAmount: 80_000, totalAmount: 1_080_000 });
    assert.match(handoffOf(vat8)?.question ?? '', /Xử lý phần thuế đang áp 8% này ra sao\?/);
  });
});

test('đầu vào giám khảo gõ tay và XML thật: ô trống là chưa biết, tiếng Việt được hiểu, thẻ HTTToan được đọc, "TM/CK" không đoán; mẫu demo không trùng MST ca /verify', () => {
  assert.equal(coerceFieldValue('buyerTaxCode', ''), undefined);
  assert.equal(coerceFieldValue('signingDate', '  '), undefined);
  assert.equal(coerceFieldValue('paymentMethod', 'Tiền mặt'), 'CASH');
  assert.equal(coerceFieldValue('paymentMethod', 'chuyển khoản'), 'BANK_TRANSFER');
  assert.equal(coerceFieldValue('paymentMethod', 'séc'), undefined);
  assert.equal(coerceFieldValue('sellerStatus', 'Đang hoạt động'), 'ACTIVE');
  const xml = (httoan: string) => `<?xml version="1.0" encoding="UTF-8"?><HDon><DLHDon><TTChung><KHMSHDon>1</KHMSHDon><KHHDon>C26TQA</KHHDon><SHDon>1</SHDon><NLap>2026-10-10</NLap><HTTToan>${httoan}</HTTToan></TTChung><NDHDon><NBan><Ten>CÔNG TY A</Ten><MST>0100000001</MST></NBan><NMua><MST>0100109106</MST></NMua><DSHHDVu><HHDVu><STT>1</STT><THHDVu>Giấy in</THHDVu><SLuong>1</SLuong><DGia>1000000</DGia><ThTien>1000000</ThTien><TSuat>10%</TSuat></HHDVu></DSHHDVu><TToan><TgTCThue>1000000</TgTCThue><TgTThue>100000</TgTThue><TgTTTBSo>1100000</TgTTTBSo></TToan></NDHDon></DLHDon></HDon>`;
  const pm = (v: string) => (parseXml(xml(v)).rawInvoice as { paymentMethod?: string }).paymentMethod;
  assert.equal(pm('Transfer'), 'BANK_TRANSFER');
  assert.equal(pm('Chuyển khoản'), 'BANK_TRANSFER');
  assert.equal(pm('TM'), 'CASH');
  assert.equal(pm('TM/CK'), undefined);
  assert.ok(DEMO_SAMPLE_CASES.every(c => c.supplierTaxCode !== '0312345678'), 'dữ liệu nạp sẵn không trùng MST các ca mẫu trên /verify');
});
