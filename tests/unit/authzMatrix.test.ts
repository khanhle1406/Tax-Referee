/**
 * Bảng quyền trên trang /trust (lib/capabilities.ts) phải khớp hành vi thật: với mỗi quyền của con người, gọi chính hàm thực thi
 * bằng từng vai trò (Kế toán viên / Kế toán trưởng / CFO) trong DB cô lập và so với bảng. Bảng lệch mã thì test đỏ.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { getActivePolicy, getDatabase, runIsolated } from '../../lib/server/db';
import { switchRole, type AppUser } from '../../lib/server/auth';
import { CAPABILITIES, HUMAN_ROLES, can, type Principal } from '../../lib/capabilities';
import { allowedActions, answerHandoff, applyWorkflowAction, evaluateWorkflow, readRecord, reviewPostAudit } from '../../services/workflowService';
import { setAutomationPaused } from '../../services/automationControl';
import { answerGroup, attachToBatch, createBatch, signOffBatch } from '../../services/batchService';
import { addStaff, assignSender, listChannelMessages, pullChannel } from '../../services/channels/channelService';
import type { GmailClient, InboundMail } from '../../services/channels/gmailChannel';

/** Client Gmail giả: không gọi mạng. */
const fakeGmail = (mails: InboundMail[]): GmailClient => ({ fetchUnseen: async () => mails, markSeen: async () => undefined, close: async () => undefined });
import { createPolicyDraft, publishPolicy, rollbackPolicy } from '../../services/policyService';
import { getDashboard } from '../../services/dashboardService';
import { getMyHistory } from '../../services/historyService';

const base = { invoiceDate: '2026-10-05', supplierTaxCode: '0312345678', supplierName: 'Công ty TNHH Minh An', taxRate: 10 };
let seq = 0;
const routine = () => { seq += 1; const n = String(9_100_000 + seq); return { ...base, id: `AZ-${n}`, invoiceNumber: n, invoiceDate: `2026-${String(1 + (seq % 9)).padStart(2, '0')}-${String(1 + (seq % 27)).padStart(2, '0')}`, itemName: 'Phí chuyển phát tài liệu', preTaxAmount: 2_000_000, taxAmount: 200_000, totalAmount: 2_200_000, paymentMethod: 'BANK_TRANSFER' }; };
const cfoCase = () => { seq += 1; const n = String(9_200_000 + seq); return { ...base, id: `AZC-${n}`, invoiceNumber: n, itemName: '10 laptop Dell Latitude', preTaxAmount: 300_000_000, taxAmount: 30_000_000, totalAmount: 330_000_000, paymentMethod: 'BANK_TRANSFER', hasBankSlip: true, sellerStatus: 'ACTIVE' }; };
const act = (id: string, user: AppUser, action: string, extra: Record<string, unknown> = {}) => { const row = readRecord(id); return applyWorkflowAction(id, user, { action, reason: 'Kiểm thử bảng quyền', evaluationId: row.evaluation_id, revision: row.revision, ...extra }); };
async function attempt(fn: () => unknown): Promise<boolean> { try { await fn(); return true; } catch { return false; } }

type Users = Record<(typeof HUMAN_ROLES)[number], AppUser>;
function setup(): Users {
  const db = getDatabase(), policy = getActivePolicy();
  policy.config.companyTaxCode = '0102030405';
  db.prepare('UPDATE policy_versions SET payload_json=? WHERE version=?').run(JSON.stringify(policy), policy.version);
  return { ACCOUNTANT: switchRole('ACCOUNTANT')!.user, CHIEF_ACCOUNTANT: switchRole('CHIEF_ACCOUNTANT')!.user, CFO: switchRole('CFO')!.user };
}

/** Mỗi quyền: dựng tình huống bằng người khác (để không vướng bất kiêm nhiệm), rồi để `actor` thử. Trả true nếu được phép. */
const SCENARIOS: Record<string, (u: Users, actor: AppUser) => Promise<boolean>> = {
  'batch.create': async (_u, actor) => attempt(() => createBatch(actor, { label: 'Lô thử quyền' })),
  // Lô do kế toán viên tạo, có một ca thường quy đã tự duyệt: người khác người tạo, đủ vai trò mới chốt được.
  'batch.signoff': async (u, actor) => { const lot = createBatch(u.ACCOUNTANT, { label: 'Lô chốt thử' }); const inv = routine(); await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true });
    attachToBatch(u.ACCOUNTANT, lot.id, { invoiceId: inv.id }); return attempt(() => signOffBatch(lot.id, actor, 'Chốt lô sau khi xem tổng hợp')); },
  // Hai hóa đơn tiếp khách có rượu ở hai nhà hàng khác nhau: cùng một câu hỏi, trả lời chung được.
  'batch.answerGroup': async (u, actor) => { const lot = createBatch(u.ACCOUNTANT, { label: 'Lô nhóm thử' }); const ids: string[] = [];
    for (const k of [1, 2]) { seq += 1; const n = String(9_500_000 + seq); const inv = { ...base, id: `AZG-${n}`, invoiceNumber: n, supplierTaxCode: `031955${String(seq).padStart(4, '0')}`, itemName: 'Tiếp khách đối tác - rượu vang', preTaxAmount: 3_000_000, taxAmount: 300_000, totalAmount: 3_300_000, paymentMethod: 'BANK_TRANSFER' as const };
      void k; await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true }); attachToBatch(u.ACCOUNTANT, lot.id, { invoiceId: inv.id }); ids.push(inv.id); }
    return attempt(async () => { const r = await answerGroup(lot.id, actor, { invoiceIds: ids, answers: { '1': 'A', '2': 'A' }, reason: 'Tiếp khách theo quy chế, có bảng kê' }); if (!r.every(x => x.ok)) throw new Error('bị chặn'); }); },
  'channel.pull': async (_u, actor) => attempt(() => pullChannel(actor, 'GMAIL', { gmail: fakeGmail([]) })),
  'staff.edit': async (_u, actor) => attempt(() => addStaff(actor, { fullName: 'Người thử quyền', email: `thu-quyen-${actor.role.toLowerCase()}@example.com` })),
  // File PDF từ người lạ chờ xác nhận người gửi; người thử gắn cho một nhân viên trong danh bạ.
  'channel.assignSender': async (u, actor) => { await pullChannel(u.ACCOUNTANT, 'GMAIL', { gmail: fakeGmail([{ uid: 1, messageId: `<authz-${actor.role}@example.net>`, from: 'la@example.net', attachments: [{ fileName: 'hd.pdf', mime: 'application/pdf', content: Buffer.from('%PDF-1.4 thu quyen') }] }]) });
    const message = listChannelMessages().find(m => m.status === 'NEEDS_SENDER_REVIEW')!; return attempt(() => assignSender(actor, message.id, 'STAFF-KD')); },
  'invoice.submit': async (_u, actor) => attempt(() => evaluateWorkflow(routine(), actor, { forceLocalOnly: true })),
  'invoice.confirmFields': async (u, actor) => { const inv = routine(); await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true });
    return attempt(() => evaluateWorkflow(inv, actor, { forceLocalOnly: true, expectedRevision: readRecord(inv.id).revision, confirmations: [{ field: 'totalAmount', evidence: 'Đối chiếu hóa đơn gốc' }] })); },
  // Ca trong hạn mức KTT: hóa đơn 12,1 triệu chưa rõ hình thức thanh toán → câu hỏi "1A chuyển khoản / 1B tiền mặt".
  'handoff.answer': async (u, actor) => { seq += 1; const n = String(9_300_000 + seq); const inv = { ...base, id: `AZH-${n}`, invoiceNumber: n, itemName: 'Bộ lưu điện UPS 3kVA', preTaxAmount: 11_000_000, taxAmount: 1_100_000, totalAmount: 12_100_000 };
    await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true }); const r = readRecord(inv.id);
    return attempt(() => answerHandoff(inv.id, actor, { answers: { '1': 'B' }, reason: 'Đã trả tiền mặt cho nhà cung cấp', revision: r.revision, evaluationId: r.evaluation_id })); },
  'invoice.approve.ktt': async (u, actor) => { setAutomationPaused(true, u.CHIEF_ACCOUNTANT, 'Dừng để thử duyệt tay'); const inv = routine(); await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true });
    setAutomationPaused(false, u.CHIEF_ACCOUNTANT, 'Bật lại sau phép thử'); if (readRecord(inv.id).status !== 'WAITING_CHIEF_ACCOUNTANT') throw new Error('setup');
    return attempt(() => act(inv.id, actor, 'OVERRIDE', { targetStatus: 'APPROVED' })); },
  'invoice.approve.cfo': async (u, actor) => { const inv = cfoCase(); const d = (await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true })).decision;
    return attempt(() => act(inv.id, actor, 'OVERRIDE', { targetStatus: 'APPROVED', resolvedFindingIds: (d.findings || []).map((f: { ruleId: string }) => f.ruleId) })); },
  'workflow.hold': async (u, actor) => { const inv = routine(); await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true }); return attempt(() => act(inv.id, actor, 'TAX_HOLD')); },
  'workflow.releaseCfoHold': async (u, actor) => { const inv = routine(); await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true }); act(inv.id, u.CFO, 'TAX_HOLD'); return attempt(() => act(inv.id, actor, 'RELEASE_TAX_HOLD')); },
  'workflow.undo': async (u, actor) => { const inv = routine(); await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true });
    if (actor.role === 'ACCOUNTANT') return allowedActions(readRecord(inv.id), actor).undo; act(inv.id, actor, 'PAUSE'); return attempt(() => act(inv.id, actor, 'UNDO')); },
  'postAudit.review': async (u, actor) => { const db = getDatabase(), policy = getActivePolicy(); policy.config.postAuditRate = 1; db.prepare('UPDATE policy_versions SET payload_json=? WHERE version=?').run(JSON.stringify(policy), policy.version);
    const inv = routine(); await evaluateWorkflow(inv, u.ACCOUNTANT, { forceLocalOnly: true }); return attempt(() => reviewPostAudit(inv.id, actor, { result: 'CONFIRMED', reason: 'Đã đối chiếu hợp đồng và UNC' })); },
  'automation.toggle': async (_u, actor) => attempt(() => setAutomationPaused(true, actor, 'Dừng tự động hóa để kiểm tra')),
  'policy.publishLoosening': async (u, actor) => { const author = actor.role === 'CFO' ? u.CHIEF_ACCOUNTANT : u.CFO; seq += 1;
    const draft = createPolicyDraft({ config: { ...getActivePolicy().config, kttApprovalLimit: 250_000_000 }, version: `AZ-LOOSE-${seq}` }, author.id);
    return attempt(() => publishPolicy(draft.version, actor.id, 'Thử công bố', actor.role)); },
  'policy.rollbackLoosening': async (u, actor) => { const baseVersion = getActivePolicy().version; seq += 1;
    const strict = createPolicyDraft({ config: { ...getActivePolicy().config, postAuditRate: 0.3 }, version: `AZ-STRICT-${seq}` }, u.CHIEF_ACCOUNTANT.id);
    publishPolicy(strict.version, u.CHIEF_ACCOUNTANT.id, 'Siết hậu kiểm', u.CHIEF_ACCOUNTANT.role);
    return attempt(() => rollbackPolicy(baseVersion, actor.id, 'Quay lại bản trước', actor.role)); },
  'dashboard.view': async (u, actor) => { await evaluateWorkflow(routine(), u.ACCOUNTANT, { forceLocalOnly: true }); return attempt(() => getDashboard(actor)); },
  // Được xem nhưng chỉ bản ghi của chính mình: có bản ghi của người khác trong kết quả thì coi như sai quyền (trả false).
  'history.viewOwn': async (u, actor) => { await evaluateWorkflow(routine(), u.ACCOUNTANT, { forceLocalOnly: true }); await evaluateWorkflow(routine(), u.CHIEF_ACCOUNTANT, { forceLocalOnly: true });
    return attempt(() => { const h = getMyHistory(actor), db = getDatabase();
      const foreign = h.submissions.some(s => readRecord(s.invoiceId).created_by_user_id !== actor.id)
        || h.actions.some(a => (db.prepare('SELECT actor_id FROM audit_events WHERE id=?').get(a.eventId) as { actor_id: string | null }).actor_id !== actor.id);
      if (foreign || (actor.role !== 'CFO' && !h.submissions.length)) throw new Error('lịch sử lẫn bản ghi người khác'); }); },
};
/** Quyền được thực thi ở route API: kiểm cổng vai trò có trong mã nguồn route (không dựa số dòng). */
const ROUTE_GATES: Record<string, { file: string; gate: string }> = {
  'policy.draft': { file: 'app/api/policy/route.ts', gate: "['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)" },
  'precedent.manage': { file: 'app/api/precedents/route.ts', gate: "user.role !== 'CFO'" },
  'supplier.update': { file: 'app/api/suppliers/route.ts', gate: "user.role === 'ACCOUNTANT'" },
  'ledger.export': { file: 'app/api/ledger/export/route.ts', gate: "['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)" },
};

test('mọi quyền của con người trong bảng đều có phép kiểm (hàm thật hoặc cổng route)', () => {
  const humanCaps = CAPABILITIES.filter(c => c.allowed.some(p => (HUMAN_ROLES as readonly string[]).includes(p)));
  for (const c of humanCaps) assert.ok(SCENARIOS[c.action] || ROUTE_GATES[c.action], `thiếu phép kiểm cho ${c.action}`);
  for (const c of CAPABILITIES) assert.ok(c.enforcedBy.includes('·') && fs.existsSync(c.enforcedBy.split('·')[1].trim()), `enforcedBy trỏ tới file có thật: ${c.action}`);
});

for (const [action, scenario] of Object.entries(SCENARIOS)) {
  test(`bảng quyền khớp hành vi thật: ${action}`, async () => {
    for (const role of HUMAN_ROLES) {
      await runIsolated(async () => {
        const users = setup();
        const allowed = await scenario(users, users[role]);
        assert.equal(allowed, can(role as Principal, action), `${action} × ${role}: thực tế ${allowed ? 'được' : 'bị chặn'}, bảng ghi ${can(role as Principal, action) ? 'được' : 'không'}`);
      });
    }
  });
}

test('quyền thực thi ở route có cổng vai trò trong mã nguồn', () => {
  for (const [action, { file, gate }] of Object.entries(ROUTE_GATES)) assert.ok(fs.readFileSync(file, 'utf8').includes(gate), `${action}: ${file} thiếu cổng ${gate}`);
});
