/**
 * Xử lý theo lô có kiểm soát: máy quyết từng hóa đơn, người chốt lô trước khi ghi sổ; duyệt nhóm đi qua đúng
 * kiểm soát của từng hóa đơn; phiếu giải trình nói đúng lý do duyệt hoặc dừng.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainDecision } from '../../lib/explainDecision';
import { getActivePolicy, getDatabase, runIsolated } from '../../lib/server/db';
import { switchRole } from '../../lib/server/auth';
import { listAuditEventsForEntity } from '../../lib/server/audit';
import type { InvoiceInput } from '../../lib/schemas';
import { answerGroup, attachToBatch, createBatch, getBatch, LEDGER_READY_SQL, signOffBatch } from '../../services/batchService';
import { evaluateInvoiceLocally } from '../../services/policyEngine';
import { answerHandoff, evaluateWorkflow, readRecord } from '../../services/workflowService';

const base = { invoiceDate: '2026-10-05', supplierTaxCode: '0316789013', supplierName: 'Công ty TNHH Văn Phòng Xanh', isImageBlurry: false, isAdjustment: false, sellerStatus: 'UNKNOWN' as const };
const water = (n: string): InvoiceInput => ({ ...base, id: `NUOC-${n}`, invoiceNumber: n, itemName: 'Nước uống đóng bình 20L', preTaxAmount: 500_000, taxRate: 8, taxAmount: 40_000, totalAmount: 540_000 });
// Mỗi hóa đơn rượu một nhà hàng khác nhau: cùng người bán cùng ngày sẽ cộng dồn thành cụm và bị hỏi thêm chứng từ (câu hỏi khác).
const wine = (n: string): InvoiceInput => ({ ...base, id: `RUOU-${n}`, invoiceNumber: n, supplierTaxCode: `03198${n.slice(-5)}`, supplierName: `Nhà hàng Sen Vàng ${n.slice(-2)}`, itemName: 'Tiếp khách đối tác - rượu vang', preTaxAmount: 3_000_000, taxRate: 10, taxAmount: 300_000, totalAmount: 3_300_000, paymentMethod: 'BANK_TRANSFER' });
const laptop = (n: string): InvoiceInput => ({ ...base, id: `LAP-${n}`, invoiceNumber: n, itemName: '10 laptop Dell Latitude', preTaxAmount: 300_000_000, taxRate: 10, taxAmount: 30_000_000, totalAmount: 330_000_000, paymentMethod: 'BANK_TRANSFER', hasBankSlip: true, sellerStatus: 'ACTIVE' });

test('phiếu giải trình: ca thường quy liệt kê điều kiện đã đạt (không điều kiện nào trượt); ca dừng tô đúng quy tắc và trường', () => {
  const config = { kttApprovalLimit: 200_000_000 };
  const ok = water('0000001');
  const okExplain = explainDecision(ok, evaluateInvoiceLocally(ok, config), config);
  assert.equal(okExplain.verdict, 'APPROVED');
  assert.ok(okExplain.checks.every(c => c.ok !== false), JSON.stringify(okExplain.checks.filter(c => c.ok === false)));
  assert.match(okExplain.checks.find(c => c.key === 'payment')!.detail, /dưới ngưỡng 5\.000\.000₫/);
  const stop = wine('0000002');
  const stopExplain = explainDecision(stop, evaluateInvoiceLocally(stop, config), config);
  assert.equal(stopExplain.verdict, 'STOPPED');
  assert.ok(stopExplain.highlights.some(h => h.ruleId === 'INTERNAL_POLICY_GUEST_ENTERTAINMENT' && h.groupLabel.length > 0));
  assert.equal(stopExplain.checks.find(c => c.key === 'scope')!.ok, false);
  assert.equal(stopExplain.vatAtStake, 300_000);
});

test('lô: phân đúng máy đề xuất duyệt / cần người; nhóm cùng câu hỏi; gắn trùng file không tạo bản trùng', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    const batch = createBatch(acc, { label: 'Lô thử', source: 'UPLOAD' });
    for (const inv of [water('0000011'), water('0000012'), wine('0000013'), wine('0000014')]) {
      await evaluateWorkflow(inv, acc, { forceLocalOnly: true });
      attachToBatch(acc, batch.id, { invoiceId: inv.id, fileName: `${inv.invoiceNumber}.xml`, fileSha256: `sha-${inv.invoiceNumber}` });
    }
    assert.deepEqual(attachToBatch(acc, batch.id, { invoiceId: 'NUOC-0000011', fileSha256: 'sha-0000011' }), { position: 1, duplicate: true });
    const view = getBatch(batch.id, acc);
    assert.equal(view.summary.total, 4);
    assert.equal(view.summary.MACHINE_APPROVED, 2);
    assert.equal(view.summary.NEEDS_HUMAN, 2);
    assert.equal(view.groups.length, 1);
    assert.deepEqual(view.groups[0].invoiceIds.sort(), ['RUOU-0000013', 'RUOU-0000014']);
    assert.equal(view.canSignOff, false, 'kế toán viên không chốt được lô');
  });
});

test('duyệt nhóm: kế toán viên bị chặn; KTT trả lời một lần cho cả nhóm, mỗi hóa đơn một sự kiện nhật ký riêng', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    const batch = createBatch(acc, { label: 'Lô tiếp khách' });
    for (const inv of [wine('0000021'), wine('0000022'), water('0000023')]) {
      await evaluateWorkflow(inv, acc, { forceLocalOnly: true });
      attachToBatch(acc, batch.id, { invoiceId: inv.id });
    }
    await assert.rejects(answerGroup(batch.id, acc, { invoiceIds: ['RUOU-0000021', 'RUOU-0000022'], answers: { '1': 'A', '2': 'A' }, reason: 'Tiếp khách theo quy chế' }), /Kế toán trưởng hoặc CFO/);
    const ktt = switchRole('CHIEF_ACCOUNTANT')!.user;
    await assert.rejects(answerGroup(batch.id, ktt, { invoiceIds: ['RUOU-0000021', 'NUOC-0000023'], answers: { '1': 'A' }, reason: 'Trộn nhóm khác câu hỏi' }), /cùng câu hỏi/);
    const results = await answerGroup(batch.id, ktt, { invoiceIds: ['RUOU-0000021', 'RUOU-0000022'], answers: { '1': 'A', '2': 'A' }, reason: 'Tiếp khách đối tác theo quy chế, đã có bảng kê' });
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    for (const id of ['RUOU-0000021', 'RUOU-0000022']) {
      assert.equal(readRecord(id).status, 'APPROVED');
      assert.equal(listAuditEventsForEntity(id).filter(e => e.eventType === 'HANDOFF_ANSWERED').length, 1);
    }
    assert.equal(getBatch(batch.id, ktt).summary.HUMAN_APPROVED, 2);
  });
});

test('chốt lô: người tạo không tự chốt; lô có ca từ hạn mức CFO thì KTT không chốt được; chốt rồi không chốt lại; ghi nhật ký từng hóa đơn', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    const batch = createBatch(acc, { label: 'Lô cuối tháng' });
    for (const inv of [water('0000031'), laptop('0000032')]) {
      await evaluateWorkflow(inv, acc, { forceLocalOnly: true });
      attachToBatch(acc, batch.id, { invoiceId: inv.id });
    }
    const cfo = switchRole('CFO')!.user;
    const rec = readRecord('LAP-0000032');
    const spec = JSON.parse(rec.decision_json!).handoff.questionSpec as { items: unknown[] };
    await answerHandoff('LAP-0000032', cfo, { answers: Object.fromEntries(spec.items.map((_, i) => [String(i + 1), 'A'])), reason: 'CFO phê duyệt mua laptop theo hợp đồng', revision: rec.revision, evaluationId: rec.evaluation_id });
    assert.equal(readRecord('LAP-0000032').status, 'APPROVED');
    const ktt = switchRole('CHIEF_ACCOUNTANT')!.user;
    assert.throws(() => signOffBatch(batch.id, ktt, 'Chốt lô cuối tháng 10'), /cần CFO chốt/);
    assert.throws(() => signOffBatch(batch.id, cfo, 'ngắn'), /ít nhất 8 ký tự/);
    const done = signOffBatch(batch.id, cfo, 'Chốt lô cuối tháng 10, đã xem mẫu hậu kiểm');
    assert.equal(done.postedInvoices, 2);
    assert.equal(done.vat, 30_040_000);
    assert.throws(() => signOffBatch(batch.id, cfo, 'Chốt lại lần hai cho chắc'), /đã được chốt/);
    assert.equal(listAuditEventsForEntity('NUOC-0000031').filter(e => e.eventType === 'INVOICE_POSTED_BY_BATCH').length, 1);
    const own = createBatch(ktt, { label: 'Lô KTT tự tạo' });
    await evaluateWorkflow(water('0000033'), ktt, { forceLocalOnly: true });
    attachToBatch(ktt, own.id, { invoiceId: 'NUOC-0000033' });
    assert.throws(() => signOffBatch(own.id, ktt, 'Tự chốt lô của mình'), /bất kiêm nhiệm/);
    void getActivePolicy;
  });
});

test('một hóa đơn chỉ nằm trong một lô; chỉ người tạo lô được gắn; chỉ gắn hóa đơn do chính mình nhập (không kéo hóa đơn người khác ra khỏi sổ)', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    const ktt = switchRole('CHIEF_ACCOUNTANT')!.user;
    const cfo = switchRole('CFO')!.user;
    const first = createBatch(acc, { label: 'Lô A' });
    const second = createBatch(acc, { label: 'Lô B' });
    await evaluateWorkflow(water('0000041'), acc, { forceLocalOnly: true });
    attachToBatch(acc, first.id, { invoiceId: 'NUOC-0000041' });
    assert.deepEqual(attachToBatch(acc, first.id, { invoiceId: 'NUOC-0000041' }), { position: 1, duplicate: true });
    assert.throws(() => attachToBatch(acc, second.id, { invoiceId: 'NUOC-0000041' }), /lô khác/);
    assert.throws(() => attachToBatch(ktt, first.id, { invoiceId: 'NUOC-0000041' }), /người tạo lô/);
    const own = createBatch(acc, { label: 'Lô thử gắn hóa đơn của người khác' });
    await evaluateWorkflow(water('0000042'), ktt, { forceLocalOnly: true });
    assert.throws(() => attachToBatch(acc, own.id, { invoiceId: 'NUOC-0000042' }), /do chính anh\/chị nhập/);
    assert.ok((getDatabase().prepare("SELECT COUNT(*) n FROM audit_events WHERE event_type='BATCH_ITEM_ATTACHED'").get() as { n: number }).n >= 1, 'mỗi lần gắn có sự kiện nhật ký');
    void cfo;
  });
});


test('sổ sách chỉ lấy hóa đơn đã duyệt không thuộc lô hoặc đã được ghi sổ khi chốt: máy duyệt trong lô mở chưa được ghi sổ, chốt lô xong mới vào sổ', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    await evaluateWorkflow(water('0000051'), acc, { forceLocalOnly: true });
    await evaluateWorkflow(water('0000052'), acc, { forceLocalOnly: true });
    const batch = createBatch(acc, { label: 'Lô chờ chốt' });
    attachToBatch(acc, batch.id, { invoiceId: 'NUOC-0000052' });
    const postable = () => (getDatabase().prepare(`SELECT i.id FROM invoices i WHERE i.status = 'APPROVED' AND ${LEDGER_READY_SQL} ORDER BY i.id`).all() as Array<{ id: string }>).map(r => r.id);
    assert.equal(readRecord('NUOC-0000052').status, 'APPROVED', 'máy đề xuất duyệt');
    assert.deepEqual(postable(), ['NUOC-0000051'], 'hóa đơn trong lô chưa chốt chưa được ghi sổ');
    signOffBatch(batch.id, switchRole('CHIEF_ACCOUNTANT')!.user, 'Chốt lô sau khi xem phiếu giải trình');
    assert.deepEqual(postable(), ['NUOC-0000051', 'NUOC-0000052']);
  });
});

const ready = () => (getDatabase().prepare(`SELECT i.id FROM invoices i WHERE i.status = 'APPROVED' AND ${LEDGER_READY_SQL} ORDER BY i.id`).all() as Array<{ id: string }>).map(r => r.id);

test('chốt bổ sung: hóa đơn còn chờ lúc chốt, duyệt sau đó, KHÔNG tự vào sổ; KTT/CFO chốt bổ sung thì mới vào sổ; không còn gì thì báo đã chốt', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    const batch = createBatch(acc, { label: 'Lô có hóa đơn còn chờ' });
    for (const inv of [water('0000061'), wine('0000062')]) {
      await evaluateWorkflow(inv, acc, { forceLocalOnly: true });
      attachToBatch(acc, batch.id, { invoiceId: inv.id });
    }
    const ktt = switchRole('CHIEF_ACCOUNTANT')!.user;
    const first = signOffBatch(batch.id, ktt, 'Chốt lô, còn một hóa đơn tiếp khách chờ');
    assert.deepEqual([first.postedInvoices, first.stillWaiting, first.supplement], [1, 1, false]);
    const rec = readRecord('RUOU-0000062');
    const spec = JSON.parse(rec.decision_json!).handoff.questionSpec as { items: unknown[] };
    await answerHandoff('RUOU-0000062', ktt, { answers: Object.fromEntries(spec.items.map((_, i) => [String(i + 1), 'A'])), reason: 'Tiếp khách đối tác theo quy chế, có bảng kê', revision: rec.revision, evaluationId: rec.evaluation_id });
    assert.equal(readRecord('RUOU-0000062').status, 'APPROVED');
    assert.deepEqual(ready(), ['NUOC-0000061'], 'duyệt sau khi chốt chưa được ghi sổ');
    const view = getBatch(batch.id, ktt);
    assert.equal(view.summary.awaitingPost, 1);
    assert.equal(view.canSignOff, true);
    const extra = signOffBatch(batch.id, ktt, 'Chốt bổ sung hóa đơn tiếp khách đã duyệt');
    assert.deepEqual([extra.postedInvoices, extra.supplement], [1, true]);
    assert.deepEqual(ready(), ['NUOC-0000061', 'RUOU-0000062']);
    assert.throws(() => signOffBatch(batch.id, ktt, 'Chốt lại lần ba cho chắc'), /đã được chốt/);
    assert.equal(listAuditEventsForEntity('RUOU-0000062').filter(e => e.eventType === 'INVOICE_POSTED_BY_BATCH').length, 1);
  });
});

test('duyệt nhóm: câu xác nhận giá trị riêng từng tờ (ảnh mờ) không bao giờ được gộp; hồ sơ bị sửa sau khi người duyệt đã xem thì bị chặn', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    const blurry = (n: string, amount: number): InvoiceInput => ({ ...water(n), id: `MO-${n}`, isImageBlurry: true, preTaxAmount: amount, taxRate: 8, taxAmount: amount * 8 / 100, totalAmount: amount + amount * 8 / 100 });
    const batch = createBatch(acc, { label: 'Lô ảnh mờ và tiếp khách' });
    for (const inv of [blurry('0000071', 1_000_000), blurry('0000072', 50_000_000), wine('0000073'), wine('0000074')]) {
      await evaluateWorkflow(inv, acc, { forceLocalOnly: true });
      attachToBatch(acc, batch.id, { invoiceId: inv.id });
    }
    const ktt = switchRole('CHIEF_ACCOUNTANT')!.user;
    const view = getBatch(batch.id, ktt);
    assert.ok(!view.groups.some(g => g.invoiceIds.some(id => id.startsWith('MO-'))), 'ảnh mờ có số tiền khác nhau không được trả lời chung');
    await assert.rejects(answerGroup(batch.id, ktt, { invoiceIds: ['MO-0000071', 'MO-0000072'], answers: { '1': 'A' }, reason: 'Xác nhận chung số liệu ảnh mờ' }), /cùng câu hỏi/);
    const wineGroup = view.groups.find(g => g.invoiceIds.includes('RUOU-0000073'))!;
    assert.deepEqual(wineGroup.members.map(m => m.invoiceId).sort(), ['RUOU-0000073', 'RUOU-0000074']);
    assert.ok(!wineGroup.label.includes('\u0001'));
    // Phiên bản KTT đã thấy trên thẻ nhóm khác phiên bản hiện hành (hồ sơ vừa được sửa): đáp án không được áp lên bản mới.
    const seen = wineGroup.members.map(m => m.invoiceId === 'RUOU-0000074' ? { ...m, revision: m.revision + 1 } : m);
    const results = await answerGroup(batch.id, ktt, { invoiceIds: wineGroup.invoiceIds, answers: Object.fromEntries(wineGroup.questionItems.map(q => [String(q.n), 'A'])), reason: 'Tiếp khách đối tác theo quy chế, đã có bảng kê', members: seen });
    assert.equal(results.find(r => r.invoiceId === 'RUOU-0000073')!.ok, true);
    assert.equal(results.find(r => r.invoiceId === 'RUOU-0000074')!.ok, false, JSON.stringify(results));
    assert.notEqual(readRecord('RUOU-0000074').status, 'APPROVED');
  });
});

test('ghi sổ gắn với nội dung lúc chốt: hồ sơ đã ghi sổ mà bị sửa sau đó thì rời sổ, chốt bổ sung mới vào lại', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    const batch = createBatch(acc, { label: 'Lô sửa sau khi chốt' });
    await evaluateWorkflow(water('0000081'), acc, { forceLocalOnly: true });
    attachToBatch(acc, batch.id, { invoiceId: 'NUOC-0000081' });
    const ktt = switchRole('CHIEF_ACCOUNTANT')!.user;
    signOffBatch(batch.id, ktt, 'Chốt lô nước uống tháng 10');
    assert.deepEqual(ready(), ['NUOC-0000081']);
    await evaluateWorkflow({ ...water('0000081'), preTaxAmount: 600_000, taxAmount: 48_000, totalAmount: 648_000 }, acc, { forceLocalOnly: true, expectedRevision: readRecord('NUOC-0000081').revision });
    assert.equal(readRecord('NUOC-0000081').status, 'APPROVED');
    assert.deepEqual(ready(), [], 'nội dung khác lúc chốt: chưa được ghi sổ');
    assert.equal(getBatch(batch.id, ktt).summary.awaitingPost, 1);
    const again = signOffBatch(batch.id, ktt, 'Chốt bổ sung sau khi kế toán sửa số tiền');
    assert.deepEqual([again.postedInvoices, again.supplement], [1, true]);
    assert.deepEqual(ready(), ['NUOC-0000081']);
  });
});
