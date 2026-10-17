/**
 * Tổng quan (KTT/CFO) và "Lịch sử của tôi": chỉ đọc, đúng quyền, phân biệt máy tự xử lý với có người xử lý.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { getActivePolicy, getDatabase, runIsolated } from '../../lib/server/db';
import { switchRole, type AppUser } from '../../lib/server/auth';
import { answerHandoff, applyWorkflowAction, evaluateWorkflow, readRecord, releaseHeldRoutineCases, WorkflowError } from '../../services/workflowService';
import { setAutomationPaused } from '../../services/automationControl';
import { answerDurations, getDashboard, type DashboardEvent } from '../../services/dashboardService';
import { getMyHistory } from '../../services/historyService';
import { GET as dashboardRoute } from '../../app/api/dashboard/route';
import { GET as historyRoute } from '../../app/api/history/route';

const base = { invoiceDate: '2026-10-05', supplierTaxCode: '0312345678', supplierName: 'Công ty TNHH Minh An', taxRate: 10 };
let seq = 0;
const routine = () => { seq += 1; const n = String(9_500_000 + seq); return { ...base, id: `DH-${n}`, invoiceNumber: n, invoiceDate: `2026-10-${String(1 + (seq % 27)).padStart(2, '0')}`, itemName: 'Phí chuyển phát tài liệu', preTaxAmount: 2_000_000, taxAmount: 200_000, totalAmount: 2_200_000, paymentMethod: 'BANK_TRANSFER' }; };
const ups = () => { seq += 1; const n = String(9_600_000 + seq); return { ...base, id: `DHU-${n}`, invoiceNumber: n, itemName: 'Bộ lưu điện UPS 3kVA', preTaxAmount: 11_000_000, taxAmount: 1_100_000, totalAmount: 12_100_000 }; };
const req = (url: string, token?: string) => new NextRequest(url, token ? { headers: { cookie: `tax_referee_session=${token}` } } : undefined);

function setup() {
  const db = getDatabase(), policy = getActivePolicy();
  policy.config.companyTaxCode = '0102030405';
  db.prepare('UPDATE policy_versions SET payload_json=? WHERE version=?').run(JSON.stringify(policy), policy.version);
  return { acc: switchRole('ACCOUNTANT')!, ktt: switchRole('CHIEF_ACCOUNTANT')!, cfo: switchRole('CFO')! };
}
async function answer(id: string, user: AppUser, choice: 'A' | 'B') {
  const r = readRecord(id);
  return answerHandoff(id, user, { answers: { '1': choice }, reason: 'Kiểm thử tổng quan', revision: r.revision, evaluationId: r.evaluation_id });
}

test('Tổng quan: Kế toán viên bị chặn (403), chưa đăng nhập 401, KTT/CFO xem được với no-store; DB trống vẫn chạy', async () => {
  await runIsolated(async () => {
    const { acc, ktt, cfo } = setup();
    assert.throws(() => getDashboard(acc.user), (e: unknown) => e instanceof WorkflowError && e.status === 403);
    assert.throws(() => getDashboard(ktt.user, { period: '2026-13' }), (e: unknown) => e instanceof WorkflowError && e.status === 400);
    const empty = getDashboard(cfo.user);
    assert.equal(empty.totals.invoices, 0); assert.equal(empty.outcomes.machine.pct, 0); assert.equal(empty.response.averageMinutes, null);
    assert.equal(empty.riskGroups.length, 3); assert.deepEqual(empty.stopReasons, []); assert.equal(empty.batches.total, 0);
    assert.equal((await dashboardRoute(req('http://localhost/api/dashboard'))).status, 401);
    assert.equal((await dashboardRoute(req('http://localhost/api/dashboard', acc.token))).status, 403);
    const ok = await dashboardRoute(req('http://localhost/api/dashboard', ktt.token));
    assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal((await ok.json()).dashboard.viewerRole, 'CHIEF_ACCOUNTANT');
    assert.equal((await dashboardRoute(req('http://localhost/api/dashboard?period=abc', ktt.token))).status, 400);
  });
});

test('Tổng quan: đếm đúng máy tự xử lý và có người xử lý rồi duyệt (kể cả trả lời xong máy duyệt lại)', async () => {
  await runIsolated(async () => {
    const { acc, ktt, cfo } = setup();
    // 2 ca thường quy máy tự duyệt.
    for (let i = 0; i < 2; i++) { const inv = routine(); await evaluateWorkflow(inv, acc.user, { forceLocalOnly: true }); assert.equal(readRecord(inv.id).status, 'APPROVED'); }
    // Dừng tự động hóa: 1 ca KTT duyệt tay (người), 1 ca máy hoàn tất khi bật lại (máy kiểm lại theo policy).
    setAutomationPaused(true, ktt.user, 'Dừng để kiểm thử tổng quan');
    const held = routine(); await evaluateWorkflow(held, acc.user, { forceLocalOnly: true });
    const r = readRecord(held.id);
    applyWorkflowAction(held.id, ktt.user, { action: 'OVERRIDE', targetStatus: 'APPROVED', reason: 'Duyệt tay khi tự động hóa dừng', revision: r.revision, evaluationId: r.evaluation_id });
    const released = routine(); await evaluateWorkflow(released, acc.user, { forceLocalOnly: true });
    setAutomationPaused(false, ktt.user, 'Bật lại sau kiểm thử');
    assert.equal(releaseHeldRoutineCases(ktt.user), 1);
    // Trả lời "1A chuyển khoản" → máy đánh giá lại và tự duyệt: vẫn là CÓ NGƯỜI xử lý. Trả lời "1B tiền mặt" → từ chối.
    const answeredA = ups(); await evaluateWorkflow(answeredA, acc.user, { forceLocalOnly: true });
    assert.equal((await answer(answeredA.id, ktt.user, 'A')).outcome, 'RE_EVALUATED_ROUTINE');
    assert.equal(readRecord(answeredA.id).status, 'APPROVED');
    const answeredB = ups(); await evaluateWorkflow(answeredB, acc.user, { forceLocalOnly: true }); await answer(answeredB.id, ktt.user, 'B');
    // 1 ca còn chờ, quá 24 giờ.
    const waiting = ups(); await evaluateWorkflow(waiting, acc.user, { forceLocalOnly: true });
    getDatabase().prepare('UPDATE evaluations SET created_at=? WHERE invoice_id=?').run(new Date(Date.now() - 30 * 3_600_000).toISOString(), waiting.id);

    const d = getDashboard(cfo.user);
    assert.equal(d.totals.invoices, 7);
    assert.equal(d.outcomes.machine.count, 3, 'máy: 2 tự duyệt + 1 hoàn tất sau khi bật lại');
    assert.equal(d.outcomes.human.count, 2, 'người: 1 duyệt tay + 1 trả lời rồi máy duyệt lại');
    assert.equal(d.outcomes.rejected.count, 1); assert.equal(d.outcomes.waiting.count, 1); assert.equal(d.outcomes.onHold.count, 0);
    assert.equal(d.outcomes.machine.pct, 43);
    assert.equal(d.vat.excluded, 1_100_000); assert.equal(d.vat.pending, 1_100_000); assert.equal(d.vat.deducted, 3 * 200_000 + 200_000 + 1_100_000);
    assert.equal(d.response.overdue24h, 1); assert.equal(d.response.overdueItems[0].id, waiting.id);
    assert.equal(d.response.answered, 3, '2 lần trả lời câu hỏi + 1 lần duyệt tay ca bị giữ'); assert.ok(d.response.averageMinutes !== null && d.response.averageMinutes >= 0);
    assert.ok(d.stopReasons.some(s => s.ruleId === 'STATUTORY_LAW_48_CASH_PAYMENT' && s.label === 'Điều kiện thanh toán'));
    assert.equal(d.riskGroups.find(g => g.group === 'UNCERTAIN_INFO')!.count, 3);
    assert.equal(getDashboard(ktt.user).myQueue.count, 1, 'ca chờ KTT do Kế toán viên gửi');
    assert.equal(d.myQueue.count, 0, 'không có ca chờ CFO');
    assert.equal(getDashboard(cfo.user, { period: '2026-09' }).totals.invoices, 0);

    // Lô chưa chốt chứa 1 hóa đơn đã duyệt; người gửi lấy từ danh bạ.
    const db = getDatabase(), now = new Date().toISOString();
    db.prepare("INSERT INTO staff_directory (id, full_name, department, created_at) VALUES ('ST-1','Nguyễn Minh Anh','Kinh doanh',?)").run(now);
    db.prepare("INSERT INTO batches (id, label, source, created_at) VALUES ('B-OPEN','Lô thử','ZALO',?), ('B-DONE','Lô đã chốt','UPLOAD',?)").run(now, now);
    db.prepare("UPDATE batches SET signed_off_at=? WHERE id='B-DONE'").run(now);
    db.prepare("INSERT INTO batch_items (batch_id, position, invoice_id, submitter_staff_id, created_at) VALUES ('B-OPEN',0,?,'ST-1',?)").run(held.id, now);
    const b = getDashboard(ktt.user);
    assert.deepEqual([b.batches.total, b.batches.signedOff, b.batches.open, b.batches.approvedInOpenBatches, b.batches.approvedVatInOpenBatches], [2, 1, 1, 1, 200_000]);
    assert.deepEqual(b.bySource.find(s => s.key === 'ZALO'), { key: 'ZALO', label: 'Zalo', invoices: 1, needsHuman: 1, needsHumanPct: 100 });
    assert.equal(b.bySubmitter.find(s => s.key === 'ST-1')?.department, 'Kinh doanh');
  });
});

test('thời gian trả lời: một lần trả lời "1A, 2B" ghi nhiều sự kiện nhưng chỉ tính một khoảng chờ', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 1) + h * 3_600_000).toISOString();
  const ev = (type: string, at: number, extra: Partial<DashboardEvent> = {}): DashboardEvent => ({ type, entity: 'X', actorId: null, role: 'SYSTEM_REFEREE', target: null, evaluationId: null, resulting: null, at: t(at), ...extra });
  const ktt = { actorId: 'u-ktt', role: 'CHIEF_ACCOUNTANT' };
  const { durations } = answerDurations([
    ev('EVALUATION_STARTED', 0, { actorId: 'u-acc', role: 'ACCOUNTANT', target: 'EVALUATING' }),
    ev('INVOICE_EVALUATED', 0, { target: 'WAITING_CHIEF_ACCOUNTANT', evaluationId: 'E1' }),
    ev('EVALUATION_STARTED', 2, { ...ktt, target: 'EVALUATING', evaluationId: 'E1' }),
    ev('INVOICE_EVALUATED', 2, { target: 'WAITING_CHIEF_ACCOUNTANT', evaluationId: 'E2' }),
    ev('OVERRIDE', 2, { ...ktt, target: 'REJECTED', evaluationId: 'E2' }),
    ev('HANDOFF_ANSWERED', 2, { ...ktt, evaluationId: 'E1', resulting: 'REJECTED' }),
  ]);
  assert.deepEqual(durations, [2 * 3_600_000]);
});

test('Lịch sử của tôi: mỗi người chỉ thấy thao tác và hóa đơn của chính mình', async () => {
  await runIsolated(async () => {
    const { acc, ktt, cfo } = setup();
    const mine = routine(); await evaluateWorkflow(mine, acc.user, { forceLocalOnly: true });
    const kttOwn = routine(); await evaluateWorkflow(kttOwn, ktt.user, { forceLocalOnly: true });
    const q = ups(); await evaluateWorkflow(q, acc.user, { forceLocalOnly: true }); await answer(q.id, ktt.user, 'B');

    const a = getMyHistory(acc.user);
    assert.deepEqual(a.submissions.map(s => s.invoiceId).sort(), [mine.id, q.id].sort());
    assert.equal(a.submissions.find(s => s.invoiceId === q.id)!.status, 'REJECTED');
    assert.ok(a.actions.length > 0 && a.actions.every(x => x.eventType === 'EVALUATION_STARTED'));
    assert.ok(!a.actions.some(x => x.invoiceId === kttOwn.id));

    const k = getMyHistory(ktt.user);
    assert.deepEqual(k.submissions.map(s => s.invoiceId), [kttOwn.id]);
    const answered = k.actions.find(x => x.eventType === 'HANDOFF_ANSWERED');
    assert.equal(answered?.label, 'Trả lời câu hỏi chuyển tiếp'); assert.equal(answered?.invoiceNumber, q.invoiceNumber);
    assert.equal(answered?.supplierName, base.supplierName); assert.equal(answered?.totalAmount, 12_100_000);
    assert.ok(k.actions.some(x => x.eventType === 'OVERRIDE' && x.resultingStatus === 'REJECTED' && x.reason));
    const db = getDatabase();
    for (const x of k.actions) assert.equal((db.prepare('SELECT actor_id FROM audit_events WHERE id=?').get(x.eventId) as { actor_id: string }).actor_id, ktt.user.id);

    const c = getMyHistory(cfo.user);
    assert.equal(c.submissions.length, 0); assert.ok(!c.actions.some(x => x.invoiceId));
    assert.equal(getMyHistory(acc.user, { limit: 1 }).submissions.length, 1);

    assert.equal((await historyRoute(req('http://localhost/api/history'))).status, 401);
    const res = await historyRoute(req('http://localhost/api/history', acc.token));
    assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await res.json()).history.totals.submissions, 2);
  });
});
