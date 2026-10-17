/**
 * Tổng quan cho Kế toán trưởng và CFO: chỉ ĐỌC dữ liệu đã có (hóa đơn, lượt đánh giá, nhật ký, lô, kênh, hậu kiểm).
 * Không ghi DB, không tạo bảng, không chạy lại đánh giá.
 *
 * "Máy tự xử lý" được xác định theo nhật ký, không theo trạng thái: hóa đơn đang APPROVED mà sự kiện đưa nó về APPROVED
 * là ROUTINE_AUTO_APPROVED (actorRole SYSTEM_REFEREE) hoặc ROUTINE_RELEASED_AFTER_RESUME (máy kiểm lại theo policy khi bật lại
 * tự động hóa — người chỉ bật công tắc, không quyết định từng hóa đơn), đồng thời hồ sơ CHƯA TỪNG có lượt đánh giá ESCALATED
 * và chưa có thao tác nào của Kế toán trưởng/CFO (trả lời, ghi đè, xác minh, giữ thuế, hoàn tác, dừng) trước sự kiện duyệt.
 * Còn lại là "có người xử lý rồi duyệt".
 */
import { getDatabase } from '@/lib/server/db';
import type { AppUser } from '@/lib/server/auth';
import { WorkflowError } from './workflowService';
import { listPostAudits } from './postAuditService';
import { ruleContract } from '@/data/policyContract';
import { RISK_GROUP_LABELS, groupOf } from '@/lib/riskTaxonomy';
import { caseDeadline } from '@/lib/workflowPresentation';
import type { RiskGroup, RuleKind } from '@/lib/schemas';

export interface OutcomeBucket { count: number; pct: number; vat: number }
export interface SourceRow { key: string; label: string; invoices: number; needsHuman: number; needsHumanPct: number }
export interface SubmitterRow extends SourceRow { department: string | null }
export interface DashboardData {
  period: string | null;
  periods: string[];
  generatedAt: string;
  viewerRole: AppUser['role'];
  totals: { invoices: number; vat: number; totalAmount: number };
  outcomes: { machine: OutcomeBucket; human: OutcomeBucket; rejected: OutcomeBucket; waiting: OutcomeBucket; onHold: OutcomeBucket; processing: OutcomeBucket };
  vat: { deducted: number; excluded: number; pending: number; onHold: number };
  myQueue: { count: number; vat: number; recipient: 'CFO' | 'CHIEF_ACCOUNTANT' };
  stopReasons: Array<{ ruleId: string; label: string; count: number }>;
  riskGroups: Array<{ group: RiskGroup; label: string; count: number }>;
  response: { answered: number; averageMinutes: number | null; overdue24h: number; overdueItems: Array<{ id: string; invoiceNumber: string; supplierName: string; hoursWaiting: number }> };
  batches: { total: number; signedOff: number; open: number; approvedInOpenBatches: number; approvedVatInOpenBatches: number };
  bySource: SourceRow[];
  bySubmitter: SubmitterRow[];
  postAudit: { sampled: number; reviewed: number; pending: number; agreed: number; disagreed: number };
}

const WAITING = new Set(['WAITING_CHIEF_ACCOUNTANT', 'WAITING_CFO', 'FORWARDED', 'NEEDS_CONFIRMATION']);
const HOLD = new Set(['ON_HOLD', 'PAUSED']);
const APPROVERS = new Set(['CHIEF_ACCOUNTANT', 'CFO']);
/** Thao tác của KTT/CFO được coi là "trả lời" một lần chuyển tiếp. */
const ANSWER_EVENTS = new Set(['HANDOFF_ANSWERED', 'HUMAN_RESOLUTION_RECORDED', 'OVERRIDE', 'TAX_HOLD', 'EVALUATION_STARTED']);
/** Thao tác của KTT/CFO trước khi duyệt khiến hồ sơ không còn là "máy tự xử lý". */
const TOUCH_EVENTS = new Set([...ANSWER_EVENTS, 'RELEASE_TAX_HOLD', 'INVOICE_ACTION_REVERTED', 'PAUSE', 'RESUME']);
const MACHINE_APPROVAL_EVENTS = new Set(['ROUTINE_AUTO_APPROVED', 'ROUTINE_RELEASED_AFTER_RESUME']);
const SOURCE_LABELS: Record<string, string> = { WEB: 'Nhập trên web', UPLOAD: 'Tải lên theo lô', GMAIL: 'Gmail', EMAIL: 'Email', ZALO: 'Zalo' };
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type DashboardEvent = { type: string; entity: string; actorId: string | null; role: string | null; target: string | null; evaluationId: string | null; resulting: string | null; at: string };
type Inv = { id: string; status: string; approved: number; creator: string | null; invoiceNumber: string; supplierName: string; taxAmount: number; totalAmount: number; createdAt: string };
type Evaluation = { invoiceId: string; status: string | null; requiresCfo: number | null; findings: string | null; createdAt: string };

const json = <T>(text: string | null | undefined, fallback: T): T => { try { return text ? JSON.parse(text) as T : fallback; } catch { return fallback; } };
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const ms = (iso: string): number => Date.parse(iso);
const isApprover = (e: DashboardEvent): boolean => Boolean(e.actorId) && APPROVERS.has(e.role ?? '');

/**
 * Thời gian trả lời: từ lúc hồ sơ vào trạng thái chờ người đến thao tác đầu tiên của KTT/CFO. Một lần trả lời "1A, 2B" ghi nhiều
 * sự kiện (đánh giá lại, ghi đè) và kết thúc bằng HANDOFF_ANSWERED cùng evaluationId — các sự kiện ở giữa thuộc cùng câu trả lời,
 * không phải một lần chuyển tiếp mới được trả lời ngay (tránh kéo trung bình về 0).
 */
export function answerDurations(events: DashboardEvent[]): { durations: number[]; waitingSince: number | null } {
  const durations: number[] = []; let pending: number | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (isApprover(e) && ANSWER_EVENTS.has(e.type)) {
      if (pending !== null) { durations.push(Math.max(0, ms(e.at) - pending)); pending = null; }
      let end = e.type === 'HANDOFF_ANSWERED' ? i : -1;
      for (let j = i + 1; end < 0 && j < events.length; j++) {
        const x = events[j];
        if (x.actorId && x.actorId !== e.actorId) break;
        if (x.type === 'HANDOFF_ANSWERED' && x.actorId === e.actorId && x.evaluationId === e.evaluationId) end = j;
      }
      if (end >= i) {
        const h = events[end];
        if (WAITING.has(h.resulting ?? '')) { const follow = events.slice(i + 1, end).reverse().find(x => WAITING.has(x.target ?? '')); pending = ms((follow ?? h).at); }
        i = end;
      }
      continue;
    }
    if (e.target) {
      if (WAITING.has(e.target)) { if (pending === null) pending = ms(e.at); }
      else if (e.target !== 'EVALUATING') pending = null;
    }
  }
  return { durations, waitingSince: pending };
}

/** MACHINE / HUMAN cho một hóa đơn đang APPROVED (xem chú thích đầu file). */
export function approvalSource(inv: Pick<Inv, 'creator'>, events: DashboardEvent[], everEscalated: boolean, latestDecisionStatus: string | null): 'MACHINE' | 'HUMAN' {
  let index = -1;
  for (let i = events.length - 1; i >= 0; i--) if (events[i].target === 'APPROVED') { index = i; break; }
  if (index < 0) return !everEscalated && latestDecisionStatus === 'ROUTINE' ? 'MACHINE' : 'HUMAN';
  const approval = events[index];
  const machineEvent = approval.type === 'ROUTINE_RELEASED_AFTER_RESUME' || (approval.type === 'ROUTINE_AUTO_APPROVED' && approval.role === 'SYSTEM_REFEREE' && !approval.actorId);
  const touched = events.slice(0, index).some(e => isApprover(e) && TOUCH_EVENTS.has(e.type) && e.actorId !== inv.creator);
  return machineEvent && !everEscalated && !touched ? 'MACHINE' : 'HUMAN';
}

export function getDashboard(user: AppUser, options: { period?: string | null } = {}): DashboardData {
  if (user.role === 'ACCOUNTANT') throw new WorkflowError('Tổng quan dành cho Kế toán trưởng và CFO.', 403);
  const period = options.period ? String(options.period) : null;
  if (period && !PERIOD_PATTERN.test(period)) throw new WorkflowError('Kỳ phải có dạng YYYY-MM.', 400);
  const db = getDatabase();
  const where = period ? 'WHERE substr(invoice_date,1,7)=?' : '';
  const args = period ? [period] : [];

  const invoices: Inv[] = (db.prepare(`SELECT id, status, approved_deductible_tax, created_by_user_id, invoice_number, created_at,
      json_extract(payload_json,'$.supplierName') supplier_name, json_extract(payload_json,'$.taxAmount') tax_amount, json_extract(payload_json,'$.totalAmount') total_amount
    FROM invoices ${where}`).all(...args) as Array<Record<string, unknown>>).map(r => ({
    id: String(r.id), status: String(r.status), approved: num(r.approved_deductible_tax), creator: (r.created_by_user_id as string | null) ?? null,
    invoiceNumber: String(r.invoice_number ?? ''), supplierName: String(r.supplier_name ?? ''), taxAmount: num(r.tax_amount), totalAmount: num(r.total_amount), createdAt: String(r.created_at),
  }));
  const ids = new Set(invoices.map(i => i.id));

  const evaluations = new Map<string, Evaluation[]>();
  for (const r of db.prepare(`SELECT invoice_id, created_at, json_extract(decision_json,'$.status') status, json_extract(decision_json,'$.requiresCFO') requires_cfo,
      json_extract(decision_json,'$.findings') findings FROM evaluations WHERE invoice_id IN (SELECT id FROM invoices ${where}) ORDER BY rowid`).all(...args) as Array<Record<string, unknown>>) {
    const list = evaluations.get(String(r.invoice_id)) ?? [];
    list.push({ invoiceId: String(r.invoice_id), status: (r.status as string) ?? null, requiresCfo: (r.requires_cfo as number) ?? null, findings: (r.findings as string) ?? null, createdAt: String(r.created_at) });
    evaluations.set(String(r.invoice_id), list);
  }
  const events = new Map<string, DashboardEvent[]>();
  for (const r of db.prepare(`SELECT event_type, entity_id, actor_id, created_at, json_extract(payload_json,'$.actorRole') actor_role,
      json_extract(payload_json,'$.targetStatus') target_status, json_extract(payload_json,'$.evaluationId') evaluation_id,
      json_extract(payload_json,'$.resultingStatus') resulting_status
    FROM audit_events WHERE entity_id IN (SELECT id FROM invoices ${where}) ORDER BY rowid`).all(...args) as Array<Record<string, unknown>>) {
    const list = events.get(String(r.entity_id)) ?? [];
    list.push({ type: String(r.event_type), entity: String(r.entity_id), actorId: (r.actor_id as string) ?? null, role: (r.actor_role as string) ?? null,
      target: (r.target_status as string) ?? null, evaluationId: (r.evaluation_id as string) ?? null, resulting: (r.resulting_status as string) ?? null, at: String(r.created_at) });
    events.set(String(r.entity_id), list);
  }

  const bucket = (): OutcomeBucket => ({ count: 0, pct: 0, vat: 0 });
  const outcomes = { machine: bucket(), human: bucket(), rejected: bucket(), waiting: bucket(), onHold: bucket(), processing: bucket() };
  const vat = { deducted: 0, excluded: 0, pending: 0, onHold: 0 };
  // Hóa đơn đã duyệt nhưng còn nằm trong lô chưa được ghi sổ (lô mở, hoặc duyệt sau khi chốt — chờ chốt bổ sung): chưa tính là đã khấu trừ.
  const unposted = new Set((db.prepare('SELECT invoice_id FROM batch_items WHERE invoice_id IS NOT NULL AND posted_at IS NULL').all() as Array<{ invoice_id: string }>).map(r => r.invoice_id));
  const recipient: 'CFO' | 'CHIEF_ACCOUNTANT' = user.role === 'CFO' ? 'CFO' : 'CHIEF_ACCOUNTANT';
  const myQueue = { count: 0, vat: 0, recipient };
  const ruleCounts = new Map<string, number>();
  const groupCounts = new Map<RiskGroup, number>([['UNCERTAIN_INFO', 0], ['OUT_OF_POLICY', 0], ['EXCEED_AUTHORITY', 0]]);
  const allDurations: number[] = [];
  const overdue: DashboardData['response']['overdueItems'] = [];
  const needsHuman = new Map<string, boolean>();
  const now = Date.now();
  let totalVat = 0, totalAmount = 0;

  for (const inv of invoices) {
    totalVat += inv.taxAmount; totalAmount += inv.totalAmount;
    const evs = events.get(inv.id) ?? [];
    const evals = evaluations.get(inv.id) ?? [];
    const latest = evals.at(-1) ?? null;
    const escalated = evals.filter(e => e.status === 'ESCALATED');
    let outcome: keyof typeof outcomes;
    if (inv.status === 'APPROVED') {
      outcome = approvalSource(inv, evs, escalated.length > 0, latest?.status ?? null) === 'MACHINE' ? 'machine' : 'human';
      if (!unposted.has(inv.id)) vat.deducted += inv.approved;
      vat.excluded += Math.max(0, inv.taxAmount - inv.approved);
    } else if (inv.status === 'REJECTED') { outcome = 'rejected'; vat.excluded += inv.taxAmount; }
    else if (WAITING.has(inv.status)) { outcome = 'waiting'; vat.pending += inv.taxAmount; }
    else if (HOLD.has(inv.status)) { outcome = 'onHold'; vat.onHold += inv.taxAmount; }
    else outcome = 'processing';
    outcomes[outcome].count += 1; outcomes[outcome].vat += outcome === 'machine' || outcome === 'human' ? inv.approved : inv.taxAmount;
    needsHuman.set(inv.id, (outcome !== 'machine' && outcome !== 'processing') || escalated.length > 0);

    // Lý do dừng và nhóm rủi ro: mỗi hóa đơn đếm một lần cho mỗi quy tắc/nhóm từng làm nó dừng.
    const rules = new Set<string>(), groups = new Set<RiskGroup>();
    for (const e of escalated) for (const f of json<Array<{ ruleId?: string; kind?: RuleKind }>>(e.findings, [])) {
      if (!f?.ruleId) continue;
      rules.add(f.ruleId); groups.add(groupOf(f.ruleId, f.kind));
    }
    for (const r of rules) ruleCounts.set(r, (ruleCounts.get(r) ?? 0) + 1);
    for (const g of groups) groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);

    allDurations.push(...answerDurations(evs).durations);
    if (WAITING.has(inv.status)) {
      const cfoNeeded = inv.status === 'WAITING_CFO' || inv.status === 'FORWARDED' || (latest?.status === 'ESCALATED' && Boolean(latest.requiresCfo));
      if ((recipient === 'CFO') === cfoNeeded && inv.creator !== user.id) { myQueue.count += 1; myQueue.vat += inv.taxAmount; }
      // Cùng mốc 24 giờ với hộp Thẩm định (lượt đánh giá gần nhất, nếu chưa có thì lúc tạo hồ sơ).
      const started = latest?.createdAt || inv.createdAt;
      const sla = caseDeadline(started, now);
      if (sla?.overdue) overdue.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, supplierName: inv.supplierName, hoursWaiting: Math.floor((now - ms(started)) / 3_600_000) });
    }
  }
  const total = invoices.length;
  for (const b of Object.values(outcomes)) b.pct = pct(b.count, total);

  // Lô hóa đơn: chốt lô là bước người ký trước khi ghi sổ.
  const batchWhere = period ? 'WHERE substr(created_at,1,7)=?' : '';
  const batchRow = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(signed_off_at IS NOT NULL),0) signed FROM batches ${batchWhere}`).get(...args) as { total: number; signed: number };
  const approvedOpen = invoices.filter(i => i.status === 'APPROVED' && unposted.has(i.id));

  // Kênh nguồn và người gửi: tin nhắn kênh (Gmail/Zalo) ưu tiên, rồi lô, còn lại là nhập trên web.
  const sourceOf = new Map<string, string>(), staffOf = new Map<string, string>();
  for (const r of db.prepare('SELECT bi.invoice_id, b.source, bi.submitter_staff_id FROM batch_items bi JOIN batches b ON b.id=bi.batch_id WHERE bi.invoice_id IS NOT NULL ORDER BY bi.rowid').all() as Array<{ invoice_id: string; source: string | null; submitter_staff_id: string | null }>) {
    if (!ids.has(r.invoice_id)) continue;
    sourceOf.set(r.invoice_id, String(r.source || 'UPLOAD').toUpperCase());
    if (r.submitter_staff_id) staffOf.set(r.invoice_id, r.submitter_staff_id);
  }
  for (const r of db.prepare('SELECT invoice_id, channel, sender_staff_id, sender_verified FROM channel_messages WHERE invoice_id IS NOT NULL ORDER BY rowid').all() as Array<{ invoice_id: string; channel: string; sender_staff_id: string | null; sender_verified: number }>) {
    if (!ids.has(r.invoice_id)) continue;
    sourceOf.set(r.invoice_id, String(r.channel || 'EMAIL').toUpperCase());
    if (r.sender_staff_id && Number(r.sender_verified) === 1 && !staffOf.has(r.invoice_id)) staffOf.set(r.invoice_id, r.sender_staff_id);
  }
  const staff = new Map((db.prepare('SELECT id, full_name, department, app_user_id FROM staff_directory').all() as Array<{ id: string; full_name: string; department: string | null; app_user_id: string | null }>).map(s => [s.id, s]));
  const staffByUser = new Map([...staff.values()].filter(s => s.app_user_id).map(s => [s.app_user_id!, s]));
  const users = new Map((db.prepare('SELECT id, display_name FROM users').all() as Array<{ id: string; display_name: string }>).map(u => [u.id, u.display_name]));

  const sources = new Map<string, SourceRow>(), submitters = new Map<string, SubmitterRow>();
  for (const inv of invoices) {
    const key = sourceOf.get(inv.id) ?? 'WEB';
    const s = sources.get(key) ?? { key, label: SOURCE_LABELS[key] ?? key, invoices: 0, needsHuman: 0, needsHumanPct: 0 };
    s.invoices += 1; if (needsHuman.get(inv.id)) s.needsHuman += 1; sources.set(key, s);

    const member = staff.get(staffOf.get(inv.id) ?? '') ?? (inv.creator ? staffByUser.get(inv.creator) : undefined);
    const personKey = member ? member.id : inv.creator ? `user:${inv.creator}` : 'unknown';
    const label = member?.full_name ?? (inv.creator ? users.get(inv.creator) ?? 'Người dùng đã xóa' : 'Chưa rõ người gửi');
    const p = submitters.get(personKey) ?? { key: personKey, label, department: member?.department ?? null, invoices: 0, needsHuman: 0, needsHumanPct: 0 };
    p.invoices += 1; if (needsHuman.get(inv.id)) p.needsHuman += 1; submitters.set(personKey, p);
  }
  const finish = <T extends SourceRow>(rows: Iterable<T>): T[] => [...rows].map(r => ({ ...r, needsHumanPct: pct(r.needsHuman, r.invoices) })).sort((a, b) => b.invoices - a.invoices || a.label.localeCompare(b.label, 'vi'));

  // Hậu kiểm: bảng chỉ tồn tại sau lần tự duyệt đầu tiên; không tạo bảng trong một yêu cầu chỉ đọc.
  const postAudit = { sampled: 0, reviewed: 0, pending: 0, agreed: 0, disagreed: 0 };
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='post_audits'").get()) {
    for (const item of listPostAudits().items) {
      if (!ids.has(item.invoiceId)) continue;
      postAudit.sampled += 1;
      if (item.status === 'REVIEWED') { postAudit.reviewed += 1; if (item.result === 'CONFIRMED') postAudit.agreed += 1; else postAudit.disagreed += 1; }
      else postAudit.pending += 1;
    }
  }

  const periods = (db.prepare("SELECT DISTINCT substr(invoice_date,1,7) p FROM invoices WHERE invoice_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]*' ORDER BY p DESC LIMIT 24").all() as Array<{ p: string }>).map(r => r.p).filter(p => PERIOD_PATTERN.test(p));
  const average = allDurations.length ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length : null;
  return {
    period, periods, generatedAt: new Date(now).toISOString(), viewerRole: user.role,
    totals: { invoices: total, vat: totalVat, totalAmount },
    outcomes, vat, myQueue,
    stopReasons: [...ruleCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([ruleId, count]) => ({ ruleId, label: ruleContract(ruleId).label, count })),
    riskGroups: [...groupCounts].map(([group, count]) => ({ group, label: RISK_GROUP_LABELS[group], count })),
    response: { answered: allDurations.length, averageMinutes: average === null ? null : Math.round(average / 60_000), overdue24h: overdue.length, overdueItems: overdue.sort((a, b) => b.hoursWaiting - a.hoursWaiting).slice(0, 5) },
    batches: { total: batchRow.total, signedOff: batchRow.signed, open: batchRow.total - batchRow.signed, approvedInOpenBatches: approvedOpen.length, approvedVatInOpenBatches: approvedOpen.reduce((s, i) => s + i.approved, 0) },
    bySource: finish(sources.values()),
    bySubmitter: finish(submitters.values()),
    postAudit,
  };
}
