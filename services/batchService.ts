/**
 * Xử lý hóa đơn theo LÔ: máy vẫn quyết định từng hóa đơn (services/policyEngine.ts, không đổi), còn "chốt lô" là bước
 * con người ký trước khi ghi sổ — đáp ứng góp ý "không để máy tự duyệt trong tài chính" mà không bắt người duyệt từng ca
 * thường quy. Duyệt nhóm đi qua đúng answerHandoff hiện có nên mọi kiểm soát (thẩm quyền CFO, bất kiêm nhiệm,
 * quy tắc luật định không chấp nhận được) vẫn áp dụng cho từng hóa đơn, mỗi hóa đơn một sự kiện nhật ký.
 */
import crypto from 'crypto';
import { appendAuditEvent } from '@/lib/server/audit';
import type { AppUser } from '@/lib/server/auth';
import { getActivePolicy, getDatabase } from '@/lib/server/db';
import { explainDecision, type DecisionExplanation } from '@/lib/explainDecision';
import { ruleContract } from '@/data/policyContract';
import { InvoiceInputSchema, RefereeDecisionSchema, type RefereeDecision } from '@/lib/schemas';
import { answerHandoff, readRecord, senderConfirmedBy, WorkflowError } from '@/services/workflowService';
import { getStaff } from '@/services/staffDirectory';

/** Điều kiện SQL (bí danh hóa đơn `i`): hóa đơn được phép vào sổ — không thuộc lô nào, hoặc đã được người có thẩm quyền ghi sổ
 *  khi chốt lô (batch_items.posted_at). Hóa đơn còn chờ/tạm giữ lúc chốt, nếu được duyệt sau, phải chốt bổ sung mới vào sổ.
 *  Sổ sách và xuất chứng từ (app/api/ledger/**) chỉ lấy hóa đơn APPROVED thỏa điều kiện này. */
export const LEDGER_READY_SQL = 'NOT EXISTS (SELECT 1 FROM batch_items bi WHERE bi.invoice_id = i.id AND (bi.posted_at IS NULL OR bi.posted_content_hash IS NOT i.content_hash))';
// Ghi sổ gắn với NỘI DUNG lúc chốt (posted_content_hash): hồ sơ bị sửa sau khi chốt rời sổ cho tới khi được chốt bổ sung.

export type BatchSource = 'UPLOAD' | 'GMAIL' | 'ZALO' | 'MANUAL';
export type BatchBucket = 'MACHINE_APPROVED' | 'HUMAN_APPROVED' | 'NEEDS_HUMAN' | 'ON_HOLD' | 'REJECTED' | 'ERROR' | 'PROCESSING';
export const BUCKET_LABELS: Record<BatchBucket, string> = {
  MACHINE_APPROVED: 'Máy đề xuất duyệt', HUMAN_APPROVED: 'Đã duyệt sau khi hỏi người', NEEDS_HUMAN: 'Cần người quyết',
  ON_HOLD: 'Tạm giữ', REJECTED: 'Từ chối', ERROR: 'Không đọc được', PROCESSING: 'Đang xử lý',
};
const WAITING = new Set(['WAITING_CHIEF_ACCOUNTANT', 'WAITING_CFO', 'FORWARDED', 'NEEDS_CONFIRMATION']);
const HUMAN_EVENTS = ['HANDOFF_ANSWERED', 'HUMAN_RESOLUTION_RECORDED', 'OVERRIDE', 'INVOICE_HUMAN_OVERRIDE', 'RESOLVE'];
const now = () => new Date().toISOString();
const VN_TZ = 'Asia/Ho_Chi_Minh';
/** Ngày giờ theo giờ Việt Nam cho nhãn lô (máy chủ có thể chạy UTC). */
export const vnStamp = (date = new Date()): string => date.toLocaleString('vi-VN', { timeZone: VN_TZ });
const vnDateCode = (date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/-/g, '');
const APPROVED_BUCKETS = new Set<BatchBucket>(['MACHINE_APPROVED', 'HUMAN_APPROVED']);

export interface BatchRow { id: string; label: string; source: BatchSource; status: 'OPEN' | 'SIGNED_OFF'; createdByUserId: string | null; createdAt: string; signedOffByUserId: string | null; signedOffAt: string | null; signoffNote: string | null }
export interface BatchItemView {
  createdByUserId?: string | null;
  position: number; invoiceId: string | null; fileName: string | null; error: string | null; bucket: BatchBucket; bucketLabel: string;
  invoiceNumber?: string; supplierName?: string; totalAmount?: number; taxAmount?: number; status?: string; requiresCFO?: boolean;
  submitter?: { id: string; name: string; department: string | null } | null;
  explanation?: DecisionExplanation; questionKey?: string;
  /** Thời điểm hóa đơn được ghi sổ khi chốt lô (null = chưa ghi sổ). */
  postedAt?: string | null; revision?: number; evaluationId?: string | null; approvedTax?: number;
  /** Mã băm nội dung hiện tại và lúc ghi sổ: khác nhau nghĩa là hồ sơ đã bị sửa sau khi chốt. */
  contentHash?: string | null; postedContentHash?: string | null;
}
export interface BatchGroupMember { invoiceId: string; invoiceNumber?: string; supplierName?: string; totalAmount?: number; revision: number; evaluationId: string | null }
export interface BatchGroup { key: string; label: string; invoiceIds: string[]; members: BatchGroupMember[]; requiresCFO: boolean; sampleQuestion: string; questionItems: Array<{ n: number; text: string; answers: [string, string] }> }

const mapBatch = (r: Record<string, unknown>): BatchRow => ({
  id: String(r.id), label: String(r.label), source: r.source as BatchSource, status: r.status as BatchRow['status'],
  createdByUserId: (r.created_by_user_id as string) ?? null, createdAt: String(r.created_at), signedOffByUserId: (r.signed_off_by_user_id as string) ?? null,
  signedOffAt: (r.signed_off_at as string) ?? null, signoffNote: (r.signoff_note as string) ?? null,
});

function requireBatch(id: string): BatchRow {
  const r = getDatabase().prepare('SELECT * FROM batches WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!r) throw new WorkflowError('Không tìm thấy lô.', 404);
  return mapBatch(r);
}

export function createBatch(user: AppUser, input: { label?: string; source?: BatchSource } = {}): BatchRow {
  const source: BatchSource = input.source && ['UPLOAD', 'GMAIL', 'ZALO', 'MANUAL'].includes(input.source) ? input.source : 'UPLOAD';
  const id = `LO-${vnDateCode()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const label = (input.label || '').trim().slice(0, 120) || `Lô ${source === 'UPLOAD' ? 'tải lên' : source} ${vnStamp()}`;
  getDatabase().prepare('INSERT INTO batches (id,label,source,status,created_by_user_id,created_at) VALUES (?,?,?,?,?,?)').run(id, label, source, 'OPEN', user.id, now());
  appendAuditEvent({ eventType: 'BATCH_CREATED', entityId: `batch:${id}`, actorId: user.id, payload: { label, source, actorRole: user.role } });
  return requireBatch(id);
}

/**
 * Gắn một hóa đơn (hoặc một file đọc lỗi) vào lô. Cùng mã băm file trong cùng lô thì trả lại mục cũ (gửi lại không tạo bản trùng).
 * Chỉ gắn được hóa đơn do chính người tạo lô nhập — không ai kéo hóa đơn của người khác ra khỏi sổ bằng cách gắn vào lô của mình.
 */
export function attachToBatch(user: AppUser, batchId: string, input: { invoiceId?: string | null; fileName?: string | null; fileSha256?: string | null; sourceRef?: string | null; submitterStaffId?: string | null; error?: string | null }): { position: number; duplicate: boolean } {
  const db = getDatabase();
  const batch = requireBatch(batchId);
  if (batch.status !== 'OPEN') throw new WorkflowError('Lô đã chốt, không thêm hóa đơn được.', 409);
  const invoice = input.invoiceId ? db.prepare('SELECT created_by_user_id FROM invoices WHERE id=?').get(input.invoiceId) as { created_by_user_id: string | null } | undefined : undefined;
  if (input.invoiceId && !invoice) throw new WorkflowError('Không tìm thấy hóa đơn để gắn vào lô.', 404);
  if (batch.createdByUserId && batch.createdByUserId !== user.id) throw new WorkflowError('Chỉ người tạo lô được thêm hóa đơn vào lô.', 403);
  if (invoice?.created_by_user_id && invoice.created_by_user_id !== user.id) throw new WorkflowError('Chỉ gắn vào lô hóa đơn do chính anh/chị nhập.', 403);
  if (input.fileSha256) {
    const existing = db.prepare('SELECT position FROM batch_items WHERE batch_id=? AND file_sha256=?').get(batchId, input.fileSha256) as { position: number } | undefined;
    if (existing) return { position: existing.position, duplicate: true };
  }
  if (input.invoiceId) {
    const inBatch = db.prepare('SELECT batch_id, position FROM batch_items WHERE invoice_id=?').get(input.invoiceId) as { batch_id: string; position: number } | undefined;
    if (inBatch) { if (inBatch.batch_id === batchId) return { position: inBatch.position, duplicate: true }; throw new WorkflowError('Hóa đơn đã nằm trong một lô khác — một hóa đơn chỉ được ghi sổ một lần.', 409); }
  }
  return db.transaction(() => {
    const position = ((db.prepare('SELECT COALESCE(MAX(position),0) p FROM batch_items WHERE batch_id=?').get(batchId) as { p: number }).p) + 1;
    db.prepare('INSERT INTO batch_items (batch_id,position,invoice_id,file_name,file_sha256,source_ref,submitter_staff_id,error,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(batchId, position, input.invoiceId ?? null, input.fileName?.slice(0, 200) ?? null, input.fileSha256 ?? null, input.sourceRef?.slice(0, 200) ?? null, input.submitterStaffId ?? null, input.error?.slice(0, 300) ?? null, now());
    appendAuditEvent({ eventType: 'BATCH_ITEM_ATTACHED', entityId: input.invoiceId ?? `batch:${batchId}`, actorId: user.id,
      payload: { batchId, position, fileSha256: input.fileSha256 ?? null, submitterStaffId: input.submitterStaffId ?? null, readError: input.error ? true : undefined, actorRole: user.role } });
    return { position, duplicate: false };
  })();
}

export function listBatches(limit = 30): Array<BatchRow & { items: number; approved: number; waiting: number }> {
  const rows = getDatabase().prepare(`SELECT b.*, COUNT(bi.position) items,
      SUM(CASE WHEN i.status='APPROVED' THEN 1 ELSE 0 END) approved,
      SUM(CASE WHEN i.status IN ('WAITING_CHIEF_ACCOUNTANT','WAITING_CFO','FORWARDED','NEEDS_CONFIRMATION') THEN 1 ELSE 0 END) waiting
    FROM batches b LEFT JOIN batch_items bi ON bi.batch_id=b.id LEFT JOIN invoices i ON i.id=bi.invoice_id
    GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?`).all(Math.min(Math.max(limit, 1), 100)) as Array<Record<string, unknown>>;
  return rows.map(r => ({ ...mapBatch(r), items: Number(r.items) || 0, approved: Number(r.approved) || 0, waiting: Number(r.waiting) || 0 }));
}

function humanTouched(invoiceId: string): boolean {
  const placeholders = HUMAN_EVENTS.map(() => '?').join(',');
  return Boolean(getDatabase().prepare(`SELECT 1 FROM audit_events WHERE entity_id=? AND actor_id IS NOT NULL AND event_type IN (${placeholders}) LIMIT 1`).get(invoiceId, ...HUMAN_EVENTS));
}

function bucketOf(status: string | undefined, error: string | null, invoiceId: string | null): BatchBucket {
  if (error || !invoiceId || !status) return error ? 'ERROR' : 'PROCESSING';
  if (status === 'APPROVED') return humanTouched(invoiceId) ? 'HUMAN_APPROVED' : 'MACHINE_APPROVED';
  if (WAITING.has(status)) return 'NEEDS_HUMAN';
  if (status === 'ON_HOLD' || status === 'PAUSED') return 'ON_HOLD';
  if (status === 'REJECTED') return 'REJECTED';
  return 'PROCESSING';
}

type QuestionItem = { n: number; text: string; answers: [string, string]; ruleIds: string[]; effects?: Array<{ kind: string; values?: Record<string, unknown>; confirm?: string[] }> };
/** Quy tắc mà đáp án xác nhận số liệu riêng của từng tờ (ảnh mờ, số liệu lệch): không bao giờ trả lời chung. */
const NEVER_GROUP_RULES = new Set(['RULE_IMAGE_BLURRY', 'RULE_DATA_QUALITY']);
/** Ký tự tách nội dung câu với hệ quả trong khóa nhóm — không thể sinh ra từ câu chữ. */
const SEP = '\u0001';

/**
 * Khóa nhóm câu hỏi: hai hóa đơn chỉ được trả lời chung khi từng ý có cùng quy tắc, cùng dạng câu hỏi và CÙNG hệ quả đáp án.
 * Không gộp ý mà đáp án xác nhận hay nhập giá trị riêng của từng tờ (CONFIRM_FIELDS, NEED_VALUE, SET_FIELDS kèm xác nhận trường,
 * ảnh mờ, số liệu lệch): một lần chọn A không được xác nhận những con số người duyệt chưa nhìn thấy.
 */
export function questionKey(decision: RefereeDecision): string | undefined {
  if (decision.status !== 'ESCALATED') return undefined;
  const items = decision.handoff?.questionSpec?.items as QuestionItem[] | undefined;
  if (!items?.length) return undefined;
  const groupable = items.every(item => !item.ruleIds.some(id => NEVER_GROUP_RULES.has(id)) && (item.effects ?? []).every(e =>
    e.kind === 'RESOLVE' || e.kind === 'REQUEST_INFO' || e.kind === 'REJECT' || (e.kind === 'SET_FIELDS' && !(e.confirm && e.confirm.length))));
  if (!groupable) return undefined;
  // Bỏ số tiền, số hóa đơn và phần trong ngoặc kép để các tờ cùng loại câu hỏi vẫn gộp được; hệ quả giữ nguyên giá trị (VD hasBankSlip=true).
  const shape = (text: string) => text.replace(/“[^”]*”/g, '').replace(/[\d.,]+\s?₫?/g, '#').replace(/\s+/g, ' ').trim();
  const effects = (item: QuestionItem) => JSON.stringify((item.effects ?? []).map(e => e.kind === 'SET_FIELDS' ? { kind: e.kind, values: e.values } : e));
  return items.map(item => `${item.ruleIds.join('+')}${SEP}${shape(item.text)}${SEP}${effects(item)}`).join(' | ');
}

/** Nhãn nhóm đọc được: tên quy tắc của từng ý, kèm nội dung câu với ý xác minh dữ liệu nguồn. */
function groupLabel(items: QuestionItem[]): string {
  return items.map(item => item.ruleIds.map(id => ruleContract(id).label).join(' + ') +
    (item.ruleIds.includes('RULE_SOURCE_REVIEW') ? ` (${item.text.replace(/“[^”]*”/g, '').replace(/\d[\d.,]*\s?₫/g, '…').replace(/\s+/g, ' ').trim().slice(0, 80)})` : '')).join(' · ');
}

export function getBatch(batchId: string, user: AppUser): {
  batch: BatchRow; items: BatchItemView[]; summary: Record<BatchBucket, number> & { total: number; vatApproved: number; vatPending: number; posted: number; awaitingPost: number; vatAwaitingPost: number };
  groups: BatchGroup[]; canSignOff: boolean; signOffBlockers: string[];
} {
  const db = getDatabase();
  const batch = requireBatch(batchId);
  const config = getActivePolicy().config;
  const rows = db.prepare(`SELECT bi.*, i.status, i.payload_json, i.approved_deductible_tax, i.created_by_user_id invoice_creator, i.revision invoice_revision, i.content_hash invoice_content_hash, e.id invoice_evaluation_id, e.decision_json
      FROM batch_items bi LEFT JOIN invoices i ON i.id=bi.invoice_id
      LEFT JOIN evaluations e ON e.id=(SELECT id FROM evaluations WHERE invoice_id=bi.invoice_id ORDER BY rowid DESC LIMIT 1)
      WHERE bi.batch_id=? ORDER BY bi.position`).all(batchId) as Array<Record<string, unknown>>;
  const summary = { MACHINE_APPROVED: 0, HUMAN_APPROVED: 0, NEEDS_HUMAN: 0, ON_HOLD: 0, REJECTED: 0, ERROR: 0, PROCESSING: 0, total: rows.length, vatApproved: 0, vatPending: 0, posted: 0, awaitingPost: 0, vatAwaitingPost: 0 };
  const groups = new Map<string, BatchGroup>();
  const items: BatchItemView[] = rows.map(r => {
    const invoiceId = (r.invoice_id as string) ?? null;
    const error = (r.error as string) ?? null;
    const bucket = bucketOf(r.status as string | undefined, error, invoiceId);
    summary[bucket] += 1;
    const view: BatchItemView = { position: Number(r.position), invoiceId, fileName: (r.file_name as string) ?? null, error, bucket, bucketLabel: BUCKET_LABELS[bucket], createdByUserId: (r.invoice_creator as string) ?? null,
      postedAt: (r.posted_at as string) ?? null, revision: Number(r.invoice_revision) || 0, evaluationId: (r.invoice_evaluation_id as string) ?? null, approvedTax: Number(r.approved_deductible_tax) || 0,
      contentHash: (r.invoice_content_hash as string) ?? null, postedContentHash: (r.posted_content_hash as string) ?? null };
    if (isPosted(view)) summary.posted += 1;
    if (!isPosted(view) && APPROVED_BUCKETS.has(bucket)) { summary.awaitingPost += 1; summary.vatAwaitingPost += view.approvedTax ?? 0; }
    const staff = getStaff(r.submitter_staff_id as string | null);
    view.submitter = staff ? { id: staff.id, name: staff.fullName, department: staff.department } : null;
    if (!invoiceId || !r.payload_json) return view;
    const invoice = InvoiceInputSchema.safeParse(JSON.parse(String(r.payload_json)));
    const decision = r.decision_json ? RefereeDecisionSchema.safeParse(JSON.parse(String(r.decision_json))) : null;
    if (!invoice.success) return view;
    Object.assign(view, { invoiceNumber: invoice.data.invoiceNumber, supplierName: invoice.data.supplierName, totalAmount: invoice.data.totalAmount, taxAmount: invoice.data.taxAmount, status: r.status as string });
    if (bucket === 'MACHINE_APPROVED' || bucket === 'HUMAN_APPROVED') summary.vatApproved += Number(r.approved_deductible_tax) || 0;
    if (bucket === 'NEEDS_HUMAN') summary.vatPending += Math.max(0, invoice.data.taxAmount);
    if (decision?.success) {
      const d = decision.data;
      view.requiresCFO = d.status === 'ESCALATED' ? d.requiresCFO : false;
      view.explanation = explainDecision(invoice.data, d, config);
      // Phiếu nói theo kết quả CUỐI: ca máy dừng nhưng người đã quyết thì không còn "VAT chờ quyết định".
      const approvedTax = Number(r.approved_deductible_tax) || 0;
      if (bucket === 'HUMAN_APPROVED') {
        const stops = view.explanation.highlights.length;
        const deducted = new Intl.NumberFormat('vi-VN').format(approvedTax);
        // Câu trả lời bổ sung dữ kiện (VD đã có ủy nhiệm chi) ⇒ máy kiểm lại ra thường quy, lượt đánh giá mới không còn điểm dừng.
        Object.assign(view.explanation, stops
          ? { headline: `Máy dừng ở ${stops} điểm; người có thẩm quyền đã duyệt — khấu trừ ${deducted}₫`, plain: 'Máy không tự quyết ca này; người có thẩm quyền đã trả lời và duyệt. Dưới đây là chỗ máy đã dừng.', vatAtStake: 0 }
          : { headline: `Người có thẩm quyền đã xác nhận dữ kiện; máy kiểm lại và đề xuất duyệt — khấu trừ ${deducted}₫`, plain: 'Máy đã dừng hỏi; câu trả lời bổ sung dữ kiện còn thiếu, máy kiểm lại thì mọi điều kiện đều đạt.', vatAtStake: 0 });
      }
      if (bucket === 'REJECTED' || bucket === 'ON_HOLD') Object.assign(view.explanation, { headline: bucket === 'REJECTED' ? 'Đã từ chối — không khấu trừ VAT' : 'Đang tạm giữ — chưa khấu trừ VAT', plain: bucket === 'REJECTED' ? 'Người có thẩm quyền đã quyết định không khấu trừ.' : 'Hồ sơ đang chờ bổ sung chứng từ hoặc bị giữ thuế.', vatAtStake: 0 });
      if (bucket === 'NEEDS_HUMAN' && d.status === 'ESCALATED') {
        const key = questionKey(d);
        if (key) {
          view.questionKey = key;
          const specItems = (d.handoff?.questionSpec?.items ?? []) as QuestionItem[];
          const group = groups.get(key) ?? { key, label: groupLabel(specItems), invoiceIds: [], members: [], requiresCFO: false, sampleQuestion: d.handoff?.question ?? '', questionItems: specItems.map(item => ({ n: item.n, text: item.text, answers: item.answers })) };
          group.invoiceIds.push(invoiceId);
          group.members.push({ invoiceId, invoiceNumber: invoice.data.invoiceNumber, supplierName: invoice.data.supplierName, totalAmount: invoice.data.totalAmount, revision: view.revision ?? 0, evaluationId: view.evaluationId ?? null });
          group.requiresCFO = group.requiresCFO || d.requiresCFO;
          groups.set(key, group);
        }
      }
    }
    return view;
  });
  const blockers = signOffBlockers(batch, items, user);
  return { batch, items, summary, groups: [...groups.values()].filter(g => g.invoiceIds.length > 1), canSignOff: blockers.length === 0, signOffBlockers: blockers };
}

/** Đã ghi sổ ĐÚNG nội dung hiện tại (sửa sau khi chốt thì coi như chưa ghi sổ). */
const isPosted = (i: BatchItemView) => Boolean(i.postedAt) && i.postedContentHash === i.contentHash;
/** Hóa đơn sẽ được ghi sổ ở lần chốt này: đã duyệt và chưa ghi sổ (hoặc đã sửa sau lần ghi sổ trước). */
const toPost = (items: BatchItemView[]) => items.filter(i => APPROVED_BUCKETS.has(i.bucket) && !isPosted(i));

function signOffBlockers(batch: BatchRow, items: BatchItemView[], user: AppUser): string[] {
  const out: string[] = [];
  const kttLimit = getActivePolicy().config.kttApprovalLimit ?? 200_000_000;
  const pending = toPost(items);
  const supplement = batch.status === 'SIGNED_OFF';
  if (supplement && !pending.length) out.push('Lô đã được chốt.');
  if (user.role === 'ACCOUNTANT') out.push('Chỉ Kế toán trưởng hoặc CFO được chốt lô.');
  if (batch.createdByUserId && batch.createdByUserId === user.id) out.push('Người tạo lô không được tự chốt lô (bất kiêm nhiệm).');
  if (!supplement && items.some(i => i.bucket === 'PROCESSING')) out.push('Còn hóa đơn đang xử lý.');
  if (!supplement && !pending.length) out.push('Chưa có hóa đơn nào đủ điều kiện để chốt.');
  if (pending.some(i => i.createdByUserId === user.id)) out.push('Lô có hóa đơn do chính anh/chị nhập — người khác phải chốt (bất kiêm nhiệm).');
  if (pending.some(i => senderConfirmedBy(i.invoiceId) === user.id)) out.push('Lô có hóa đơn do chính anh/chị xác nhận người gửi — người khác phải chốt (bất kiêm nhiệm).');
  if (user.role !== 'CFO' && pending.some(i => Math.abs(i.totalAmount ?? 0) >= kttLimit)) out.push('Lô có hóa đơn từ hạn mức CFO — cần CFO chốt.');
  return out;
}

/**
 * Chốt lô: người ký xác nhận các hóa đơn đã duyệt được ghi sổ (đánh dấu từng hóa đơn). Hóa đơn còn chờ hoặc tạm giữ không bị ghi sổ;
 * nếu sau đó được duyệt, người có thẩm quyền "chốt bổ sung" trên cùng lô — cùng luật bất kiêm nhiệm và hạn mức CFO.
 */
export function signOffBatch(batchId: string, user: AppUser, note: string): { batchId: string; postedInvoices: number; vat: number; stillWaiting: number; supplement: boolean } {
  const text = (note || '').trim();
  if (text.length < 8) throw new WorkflowError('Ghi lý do chốt lô (ít nhất 8 ký tự).', 400);
  const view = getBatch(batchId, user);
  if (view.signOffBlockers.length) throw new WorkflowError(view.signOffBlockers[0], user.role === 'ACCOUNTANT' || view.signOffBlockers.some(b => b.includes('bất kiêm nhiệm') || b.includes('cần CFO')) ? 403 : 409);
  const posted = toPost(view.items);
  const supplement = view.batch.status === 'SIGNED_OFF';
  const vat = posted.reduce((sum, item) => sum + (item.approvedTax ?? 0), 0);
  const stillWaiting = view.summary.NEEDS_HUMAN + view.summary.ON_HOLD;
  const db = getDatabase();
  const at = now();
  db.transaction(() => {
    if (!supplement) {
      const changed = db.prepare("UPDATE batches SET status='SIGNED_OFF', signed_off_by_user_id=?, signed_off_at=?, signoff_note=? WHERE id=? AND status='OPEN'").run(user.id, at, text.slice(0, 500), batchId);
      if (changed.changes !== 1) throw new WorkflowError('Lô vừa được người khác chốt. Tải lại.', 409);
    }
    // Ghi đúng nội dung người ký đã xem: nếu hồ sơ vừa bị sửa giữa lúc tải trang và lúc chốt thì mã băm khác, không ghi.
    const mark = db.prepare(`UPDATE batch_items SET posted_at=?, posted_by_user_id=?, posted_content_hash=? WHERE batch_id=? AND invoice_id=?
      AND (posted_at IS NULL OR posted_content_hash IS NOT ?) AND ? = (SELECT content_hash FROM invoices WHERE id=?) AND (SELECT status FROM invoices WHERE id=?) = 'APPROVED'`);
    for (const item of posted) if (mark.run(at, user.id, item.contentHash, batchId, item.invoiceId, item.contentHash, item.contentHash, item.invoiceId, item.invoiceId).changes !== 1) throw new WorkflowError('Hồ sơ trong lô vừa thay đổi. Tải lại rồi chốt.', 409);
    appendAuditEvent({ eventType: supplement ? 'BATCH_SUPPLEMENT_SIGNED_OFF' : 'BATCH_SIGNED_OFF', entityId: `batch:${batchId}`, actorId: user.id, payload: { actorRole: user.role, actorName: user.displayName, reason: text, invoiceIds: posted.map(i => i.invoiceId), vat, stillWaiting } });
    for (const item of posted) appendAuditEvent({ eventType: 'INVOICE_POSTED_BY_BATCH', entityId: String(item.invoiceId), actorId: user.id, payload: { batchId, actorRole: user.role, reason: text, supplement, contentHash: item.contentHash, repost: Boolean(item.postedAt) } });
  })();
  return { batchId, postedInvoices: posted.length, vat, stillWaiting, supplement };
}

/**
 * Duyệt nhóm: cùng một đáp án cho các hóa đơn cùng câu hỏi trong lô. Từng hóa đơn đi qua answerHandoff (thẩm quyền,
 * bất kiêm nhiệm, quy tắc không chấp nhận được), lỗi ở một hóa đơn không chặn các hóa đơn khác.
 */
export async function answerGroup(batchId: string, user: AppUser, input: { invoiceIds: string[]; answers: Record<string, string>; reason: string; members?: Array<{ invoiceId: string; revision: number; evaluationId: string | null }> }):
  Promise<Array<{ invoiceId: string; ok: boolean; status?: string; error?: string }>> {
  if (user.role === 'ACCOUNTANT') throw new WorkflowError('Cần Kế toán trưởng hoặc CFO trả lời câu hỏi chuyển tiếp.', 403);
  const ids = [...new Set(input.invoiceIds)].slice(0, 50);
  if (ids.length < 2) throw new WorkflowError('Duyệt nhóm cần ít nhất 2 hóa đơn cùng câu hỏi.', 400);
  const view = getBatch(batchId, user);
  const members = view.items.filter(i => i.invoiceId && ids.includes(i.invoiceId));
  if (members.length !== ids.length) throw new WorkflowError('Có hóa đơn không thuộc lô này.', 400);
  const keys = new Set(members.map(m => m.questionKey));
  if (keys.size !== 1 || !members[0].questionKey) throw new WorkflowError('Chỉ duyệt nhóm các hóa đơn cùng câu hỏi (cùng quy tắc) và đang chờ trả lời.', 400);
  // Phiên bản người duyệt đã nhìn thấy (getBatch → thẻ nhóm): hồ sơ bị sửa giữa chừng thì answerHandoff chặn (409), không áp đáp án lên bản mới.
  const seen = new Map((input.members ?? []).map(m => [m.invoiceId, m]));
  if (input.members && ids.some(id => !seen.has(id))) throw new WorkflowError('Thiếu phiên bản hồ sơ của hóa đơn trong nhóm. Tải lại lô.', 400);
  const results: Array<{ invoiceId: string; ok: boolean; status?: string; error?: string }> = [];
  for (const id of ids) {
    try {
      const row = readRecord(id);
      const expected = seen.get(id);
      const outcome = await answerHandoff(id, user, { answers: input.answers, reason: input.reason, revision: expected ? expected.revision : row.revision, evaluationId: expected ? expected.evaluationId : row.evaluation_id }) as { status?: string };
      results.push({ invoiceId: id, ok: true, status: outcome.status });
    } catch (error) {
      results.push({ invoiceId: id, ok: false, error: error instanceof Error ? error.message : 'Không xử lý được.' });
    }
  }
  appendAuditEvent({ eventType: 'BATCH_GROUP_ANSWERED', entityId: `batch:${batchId}`, actorId: user.id, payload: { actorRole: user.role, answers: input.answers, reason: input.reason, results } });
  return results;
}
