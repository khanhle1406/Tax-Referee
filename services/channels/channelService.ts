/**
 * Kênh nhận hóa đơn (Gmail / Zalo): lưu file gốc, nhận diện người gửi, rồi mới xử lý.
 * Quy tắc chống mạo danh: chỉ nhân viên trong danh bạ VÀ kênh xác thực được (email qua SPF/DKIM, Zalo user id)
 * thì hóa đơn mới được đọc và kiểm; người lạ hoặc email không xác thực ⇒ chờ kế toán xác nhận người gửi.
 * XML đọc tất định (không AI); PDF/ảnh xếp hàng chờ bộ đọc lô.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { artifactRoot, getDatabase, jsonNow } from '@/lib/server/db';
import { assertArtifactCapacity } from '@/lib/server/artifactQuota';
import { appendAuditEvent } from '@/lib/server/audit';
import type { AppUser } from '@/lib/server/auth';
import { assertValidXml, parseXml, sanitizeInvoice } from '@/lib/documentParser';
import { evaluateWorkflow, WorkflowError } from '@/services/workflowService';
import { attachToBatch, createBatch, vnStamp } from '@/services/batchService';
import { getStaff, identifySender, seedStaffDirectory, type SenderIdentity, type StaffMember } from '@/services/staffDirectory';
import { createImapGmailClient, gmailConfigured, type GmailClient } from './gmailChannel';
import { createHttpZaloClient, isAllowedZaloFileUrl, zaloConfigured, type ZaloClient } from './zaloChannel';
import { notify, type NotifyTransport } from './notifier';
import { demoChannelsActive, demoGmailClient, demoNotifier, demoZaloClient, prepareDemoDirectory } from './demoMock';

export type ChannelName = 'GMAIL' | 'ZALO';
export type ChannelMessageStatus = 'PROCESSED' | 'QUEUED' | 'NEEDS_SENDER_REVIEW' | 'REJECTED' | 'ERROR';
export const ALLOWED_EXTENSIONS = ['.xml', '.pdf', '.png', '.jpg', '.jpeg', '.webp'];
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PULL_LIMIT = 20;
/** Trần mỗi lượt lấy: người ngoài công ty không làm cạn quota chứng từ chung bằng một loạt thư nhiều đính kèm. */
export const MAX_ATTACHMENTS_PER_MAIL = 5;
export const MAX_FILES_PER_PULL = 50;
export const MAX_UNVERIFIED_FILES_PER_PULL = 10;
/** Trần chung của hàng chờ xác nhận người gửi (mọi lượt cộng lại): người lạ không làm cạn quota chứng từ qua nhiều lượt. */
export const MAX_PENDING_UNVERIFIED = 100;
/** Người lấy thư là người NHẬP hồ sơ; Kế toán trưởng/CFO giữ quyền duyệt (bất kiêm nhiệm). */
const PULL_ROLES = ['ACCOUNTANT'];
const MANAGER_ROLES = ['CHIEF_ACCOUNTANT', 'CFO'];
const QUEUED_NOTE = 'Đã lưu ảnh/PDF gốc — bản này chưa tự đọc ảnh nhận qua kênh; tải ảnh ở màn Lô hóa đơn hoặc Tiếp nhận để đọc.';

/** Phần vượt trần của một lượt lấy: chỉ ghi siêu dữ liệu, không lưu nội dung file. */
function limitReason(accepted: { files: number; unverified: number; pendingUnverified: number }, verified: boolean, indexInMail?: number): string | undefined {
  if (indexInMail !== undefined && indexInMail > MAX_ATTACHMENTS_PER_MAIL) return `Thư có hơn ${MAX_ATTACHMENTS_PER_MAIL} file đính kèm — chỉ nhận ${MAX_ATTACHMENTS_PER_MAIL} file đầu.`;
  if (accepted.files >= MAX_FILES_PER_PULL) return `Quá ${MAX_FILES_PER_PULL} file trong một lượt lấy — không nhận, gửi lại sau.`;
  if (!verified && accepted.unverified >= MAX_UNVERIFIED_FILES_PER_PULL) return `Quá ${MAX_UNVERIFIED_FILES_PER_PULL} file từ người gửi chưa xác thực trong một lượt — không nhận.`;
  if (!verified && accepted.pendingUnverified + accepted.unverified >= MAX_PENDING_UNVERIFIED) return `Hàng chờ xác nhận người gửi đã đủ ${MAX_PENDING_UNVERIFIED} file — xử lý bớt trước khi nhận thêm.`;
  accepted.files += 1;
  if (!verified) accepted.unverified += 1;
  return undefined;
}

function userById(id: string | null | undefined): AppUser | null {
  if (!id) return null;
  const row = getDatabase().prepare('SELECT id, email, display_name, role FROM users WHERE id=?').get(id) as { id: string; email: string; display_name: string; role: AppUser['role'] } | undefined;
  return row ? { id: row.id, email: row.email, displayName: row.display_name, role: row.role } : null;
}

/** Che địa chỉ liên hệ (chỉ giữ tên miền email) cho người không có quyền xem danh bạ đầy đủ. */
export function maskContact(value: string | null): string | null {
  if (!value) return value;
  const at = value.lastIndexOf('@');
  return at > 0 ? `***${value.slice(at)}` : `${value.slice(0, 3)}***`;
}

export interface InboundFile {
  externalId: string; senderAddress: string; senderName?: string; identity: SenderIdentity;
  subject?: string; receivedAt?: string; fileName: string; mime: string; content: Buffer;
  /** Lý do từ chối trước khi tải (VD liên kết ngoài máy chủ Zalo) — không lưu file. */
  rejectReason?: string;
}
export interface ProcessedOutcome { invoiceId: string; workflowStatus: string; taxAmount: number; staffId: string; senderAddress: string; fileName: string }
export interface PullResult {
  channel: ChannelName; messages: number; files: number; duplicates: number; batchId: string | null;
  counts: Record<ChannelMessageStatus, number>; outcomes: ProcessedOutcome[];
  /** true = kênh mô phỏng của phiên demo (dữ liệu mẫu, không gọi Gmail/Zalo thật). */
  simulated: boolean;
}
export interface ChannelDeps { gmail?: GmailClient; zalo?: ZaloClient; notifier?: NotifyTransport }

const emptyCounts = (): Record<ChannelMessageStatus, number> => ({ PROCESSED: 0, QUEUED: 0, NEEDS_SENDER_REVIEW: 0, REJECTED: 0, ERROR: 0 });
export const isAllowedFile = (fileName: string): boolean => ALLOWED_EXTENSIONS.includes(path.extname(fileName).toLowerCase());

function sourceTypeOf(fileName: string): 'XML' | 'PDF' | 'IMAGE' {
  const ext = path.extname(fileName).toLowerCase();
  return ext === '.xml' ? 'XML' : ext === '.pdf' ? 'PDF' : 'IMAGE';
}

/** Lưu file gốc như màn hình tải lên (document_artifacts, theo mã băm) để mở lại được chứng từ sau này. */
function storeArtifact(fileName: string, mime: string, content: Buffer, hash: string): { artifactId: string; storagePath: string; invoiceId: string } {
  const db = getDatabase();
  const existing = db.prepare('SELECT id, storage_path, invoice_id FROM document_artifacts WHERE content_hash=?').get(hash) as { id: string; storage_path: string; invoice_id: string } | undefined;
  if (existing) return { artifactId: existing.id, storagePath: existing.storage_path, invoiceId: existing.invoice_id };
  const artifactId = crypto.randomUUID();
  const extension = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
  const directory = artifactRoot();
  const storagePath = path.join(directory, `${artifactId}${extension}`);
  const sourceType = sourceTypeOf(fileName);
  assertArtifactCapacity(content.byteLength);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(storagePath, content, { flag: 'wx' });
  db.prepare(`INSERT INTO document_artifacts (id, invoice_id, revision, original_file_name, source_type, mime_type, storage_path, content_hash, byte_size, signature_status, created_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`).run(artifactId, `pending:${artifactId}`, fileName.slice(0, 200), sourceType, mime || 'application/octet-stream', storagePath, hash, content.byteLength, sourceType === 'XML' ? 'UNVERIFIED' : 'NOT_APPLICABLE', jsonNow());
  return { artifactId, storagePath, invoiceId: `pending:${artifactId}` };
}

/** Đọc XML tất định → làm sạch → máy kiểm (không gọi mạng). Trả mã hóa đơn và trạng thái quy trình. */
async function evaluateXml(user: AppUser, artifact: { artifactId: string; invoiceId: string }, hash: string, content: Buffer): Promise<{ invoiceId: string; workflowStatus: string; taxAmount: number }> {
  const text = content.toString('utf8');
  assertValidXml(text);
  const { invoice } = sanitizeInvoice(parseXml(text).rawInvoice);
  const invoiceId = artifact.invoiceId.startsWith('pending:') ? crypto.randomUUID() : artifact.invoiceId;
  const result = await evaluateWorkflow({ ...invoice, id: invoiceId, sourceArtifactId: artifact.artifactId, sourceHash: hash }, user, { forceLocalOnly: true }) as { workflow?: { status?: string } };
  const taxAmount = typeof invoice.taxAmount === 'number' ? invoice.taxAmount : 0;
  return { invoiceId, workflowStatus: result.workflow?.status ?? 'UNKNOWN', taxAmount };
}

/** Nhận một file từ kênh. Cùng (kênh, mã ngoài) đã nhận thì bỏ qua — kéo lại không tạo bản trùng. */
async function ingestFile(user: AppUser, channel: ChannelName, file: InboundFile, ensureBatch: () => string, result: PullResult): Promise<void> {
  const db = getDatabase();
  if (db.prepare('SELECT 1 FROM channel_messages WHERE channel=? AND external_id=?').get(channel, file.externalId)) { result.duplicates++; return; }
  const id = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(file.content).digest('hex');
  const staff = file.identity.verified ? file.identity.staff : null;
  let status: ChannelMessageStatus; let note = file.identity.reason; let storagePath: string | null = null;
  let batchId: string | null = null; let invoiceId: string | null = null;
  // Ghi dòng trước (khóa UNIQUE chặn hai lượt kéo song song xử lý cùng một file).
  db.prepare(`INSERT INTO channel_messages (id, channel, external_id, sender_address, sender_name, sender_staff_id, sender_verified, subject, received_at, file_name, mime, size, sha256, storage_path, status, note, created_at, pulled_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'NEW', NULL, ?, ?)`).run(id, channel, file.externalId.slice(0, 500), file.senderAddress.slice(0, 200), file.senderName?.slice(0, 200) ?? null,
    staff?.id ?? null, staff ? 1 : 0, file.subject?.slice(0, 300) ?? null, file.receivedAt ?? jsonNow(), file.fileName.slice(0, 200), file.mime.slice(0, 100), file.content.byteLength, hash, jsonNow(), user.id);
  try {
    if (file.rejectReason) { status = 'REJECTED'; note = file.rejectReason; }
    else if (file.content.byteLength > MAX_FILE_BYTES) { status = 'REJECTED'; note = 'File lớn hơn 15 MB — không nhận.'; }
    else {
      const artifact = storeArtifact(file.fileName, file.mime, file.content, hash);
      storagePath = artifact.storagePath;
      if (!staff) status = 'NEEDS_SENDER_REVIEW';
      else if (sourceTypeOf(file.fileName) !== 'XML') { status = 'QUEUED'; note = QUEUED_NOTE; }
      else {
        const outcome = await evaluateXml(user, artifact, hash, file.content);
        invoiceId = outcome.invoiceId;
        status = 'PROCESSED';
        // Hóa đơn đã nằm trong một lô (gửi lại thư cũ, hai thư cùng file) ⇒ đánh dấu trùng, không tạo lô rỗng, không báo hai lần.
        const already = db.prepare('SELECT batch_id FROM batch_items WHERE invoice_id=?').get(invoiceId) as { batch_id: string } | undefined;
        if (already) { batchId = already.batch_id; note = `Trùng: hóa đơn đã nằm trong lô ${already.batch_id}.`; result.duplicates++; }
        else {
          batchId = ensureBatch();
          const attached = attachToBatch(user, batchId, { invoiceId, fileName: file.fileName, fileSha256: hash, sourceRef: `${channel}:${file.externalId}`.slice(0, 200), submitterStaffId: staff.id });
          if (attached.duplicate) { note = 'Trùng file đã nhận trong lô này.'; result.duplicates++; }
          else { note = `Máy đã kiểm: ${outcome.workflowStatus}`; result.outcomes.push({ ...outcome, staffId: staff.id, senderAddress: file.senderAddress, fileName: file.fileName }); }
        }
      }
    }
  } catch (error) {
    status = 'ERROR';
    note = (error instanceof WorkflowError || error instanceof Error ? error.message : 'Không đọc được file').slice(0, 300);
  }
  db.prepare('UPDATE channel_messages SET status=?, note=?, storage_path=?, batch_id=?, invoice_id=? WHERE id=?').run(status, note?.slice(0, 300) ?? null, storagePath, batchId, invoiceId, id);
  // Dấu vết người gửi trong nhật ký chống sửa (bảng channel_messages sửa được): mã nhân viên và đã xác thực hay chưa — không ghi địa chỉ.
  appendAuditEvent({ eventType: 'CHANNEL_FILE_INGESTED', entityId: invoiceId ?? `channel-message:${id}`, actorId: user.id,
    payload: { channel, status, senderStaffId: staff?.id ?? null, senderVerified: Boolean(staff), fileSha256: hash, batchId, actorRole: user.role } });
  result.counts[status]++;
  result.files++;
}

function requireRole(user: AppUser, roles: string[], message: string): void {
  if (!user || !roles.includes(user.role)) throw new WorkflowError(message, 403);
}

/** Kéo hóa đơn từ một kênh: một lô cho mỗi lượt kéo (chỉ tạo khi có hóa đơn được xử lý). */
export async function pullChannel(user: AppUser, channel: ChannelName, injected: ChannelDeps = {}): Promise<PullResult> {
  requireRole(user, PULL_ROLES, 'Chỉ Kế toán viên (người nhập liệu) lấy hóa đơn từ kênh — Kế toán trưởng/CFO là người duyệt.');
  // Hộp thư thật của đội không được kéo vào phiên demo của người lạ: phiên demo dùng kênh MÔ PHỎNG (dữ liệu mẫu, không gọi mạng).
  // Demo kênh thật trên máy của đội: đặt TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO=1.
  const simulated = !injected.gmail && !injected.zalo && demoChannelsActive();
  seedStaffDirectory();
  if (simulated) prepareDemoDirectory();
  const deps: ChannelDeps = simulated ? { gmail: demoGmailClient(), zalo: demoZaloClient(), notifier: demoNotifier() } : injected;
  const result: PullResult = { channel, messages: 0, files: 0, duplicates: 0, batchId: null, counts: emptyCounts(), outcomes: [], simulated };
  const ensureBatch = () => result.batchId ??= createBatch(user, { label: `Lô ${channel === 'GMAIL' ? 'Gmail' : 'Zalo'}${simulated ? ' (mô phỏng)' : ''} ${vnStamp()}`, source: channel }).id;
  const accepted = { files: 0, unverified: 0, pendingUnverified: (getDatabase().prepare("SELECT COUNT(*) n FROM channel_messages WHERE status='NEEDS_SENDER_REVIEW'").get() as { n: number }).n };
  // File vượt trần: chỉ đếm (không tạo dòng, không lưu nội dung, không ghi sự kiện từng file) — lượt lấy ghi tổng số bị bỏ.
  let skippedOverLimit = 0;
  const zaloReplies = new Map<string, number>();
  if (channel === 'ZALO') {
    if (!deps.zalo && !zaloConfigured()) throw new WorkflowError('Zalo chưa cấu hình (thiếu ZALO_BOT_TOKEN).', 409);
    const client = deps.zalo ?? createHttpZaloClient();
    const updates = (await client.getUpdates()).filter(u => u.eventName === 'message.image.received' && u.photoUrl).slice(0, PULL_LIMIT);
    result.messages = updates.length;
    for (const update of updates) {
      const identity = identifySender({ zaloUserId: update.fromId });
      const base = { externalId: update.messageId, senderAddress: update.fromId, senderName: update.fromName, identity, subject: update.caption, receivedAt: update.date };
      if (getDatabase().prepare('SELECT 1 FROM channel_messages WHERE channel=? AND external_id=?').get(channel, update.messageId)) { result.duplicates++; continue; }
      let file: InboundFile;
      const overLimit = isAllowedZaloFileUrl(update.photoUrl) ? limitReason(accepted, Boolean(identity.verified && identity.staff)) : undefined;
      if (!isAllowedZaloFileUrl(update.photoUrl)) file = { ...base, fileName: `zalo-${update.messageId}.jpg`, mime: 'image/jpeg', content: Buffer.alloc(0), rejectReason: 'Liên kết ảnh không thuộc máy chủ Zalo — không tải (chống SSRF).' };
      else if (overLimit) { skippedOverLimit++; result.counts.REJECTED++; result.files++; continue; }
      else {
        try {
          const downloaded = await client.download(update.photoUrl!);
          const ext = downloaded.mime === 'image/png' ? '.png' : downloaded.mime === 'image/webp' ? '.webp' : '.jpg';
          file = { ...base, fileName: `zalo-${update.messageId}${ext}`, mime: downloaded.mime, content: downloaded.content };
        } catch (error) { file = { ...base, fileName: `zalo-${update.messageId}.jpg`, mime: 'image/jpeg', content: Buffer.alloc(0), rejectReason: (error instanceof Error ? error.message : 'Không tải được ảnh').slice(0, 200) }; }
      }
      await ingestFile(user, channel, file, ensureBatch, result);
      if (identity.verified && identity.staff) zaloReplies.set(update.chatId, (zaloReplies.get(update.chatId) ?? 0) + 1);
    }
    appendAuditEvent({ eventType: 'CHANNEL_PULLED', entityId: `channel:${channel}`, actorId: user.id, payload: { messages: result.messages, files: result.files, duplicates: result.duplicates, counts: result.counts, batchId: result.batchId, simulated, skippedOverLimit } });
    for (const [chatId, n] of zaloReplies) await notify({ kind: 'SENDER_RECEIPT', text: `Tax Referee đã nhận ${n} ảnh hóa đơn của anh/chị. Kế toán sẽ đọc và báo kết quả.`, to: { zaloChatId: chatId } }, deps.notifier);
    return result;
  }
  if (!deps.gmail && !gmailConfigured()) throw new WorkflowError('Gmail chưa cấu hình (thiếu GMAIL_IMAP_USER / GMAIL_APP_PASSWORD).', 409);
  const client = deps.gmail ?? await createImapGmailClient();
  try {
    const mails = await client.fetchUnseen(PULL_LIMIT);
    result.messages = mails.length;
    const seen: number[] = [];
    for (const mail of mails) {
      const identity = identifySender({ email: mail.from, authenticationResults: mail.authenticationResults });
      let inMail = 0;
      for (const [index, attachment] of mail.attachments.entries()) {
        if (!isAllowedFile(attachment.fileName)) continue;
        inMail += 1;
        if (limitReason(accepted, Boolean(identity.verified && identity.staff), inMail)) { skippedOverLimit++; result.counts.REJECTED++; result.files++; continue; }
        await ingestFile(user, channel, {
          externalId: `${mail.messageId}#${index}`, senderAddress: mail.from, senderName: mail.fromName, identity,
          subject: mail.subject, receivedAt: mail.receivedAt, fileName: attachment.fileName, mime: attachment.mime, content: attachment.content,
        }, ensureBatch, result);
      }
      seen.push(mail.uid);
    }
    await client.markSeen(seen);
  } finally { await client.close(); }
  appendAuditEvent({ eventType: 'CHANNEL_PULLED', entityId: `channel:${channel}`, actorId: user.id, payload: { messages: result.messages, files: result.files, duplicates: result.duplicates, counts: result.counts, batchId: result.batchId, simulated, skippedOverLimit } });
  await sendPullNotifications(result, deps.notifier);
  return result;
}

const APPROVED = ['APPROVED'];
const outcomeText = (status: string) => APPROVED.includes(status) ? 'máy đề xuất duyệt' : status === 'REJECTED' ? 'máy đề xuất không khấu trừ' : 'cần Kế toán trưởng / CFO quyết';
const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}₫`;

/** Sau lượt kéo có lô: tóm tắt cho KTT và báo kết quả cho từng người gửi đã xác thực. Không ném lỗi. */
async function sendPullNotifications(result: PullResult, transport?: NotifyTransport): Promise<void> {
  if (!result.batchId || result.outcomes.length === 0) return;
  const approved = result.outcomes.filter(o => APPROVED.includes(o.workflowStatus));
  const waiting = result.outcomes.filter(o => !APPROVED.includes(o.workflowStatus) && o.workflowStatus !== 'REJECTED');
  const vatWaiting = waiting.reduce((sum, o) => sum + o.taxAmount, 0);
  await notify({ kind: 'BATCH_SUMMARY', batchId: result.batchId, subject: `Tax Referee — ${result.batchId}`,
    text: `Lô ${result.batchId}: ${approved.length} hóa đơn máy đề xuất duyệt, ${waiting.length} cần anh/chị quyết, VAT chờ ${vnd(vatWaiting)} — mở Tax Referee để trả lời.` }, transport);
  for (const o of result.outcomes) {
    await notify({ kind: 'SENDER_OUTCOME', invoiceId: o.invoiceId, batchId: result.batchId, subject: `Kết quả hóa đơn ${o.fileName}`,
      text: `Hóa đơn ${o.fileName}: ${outcomeText(o.workflowStatus)} (thuế GTGT ${vnd(o.taxAmount)}). Lô ${result.batchId}.`, to: { email: o.senderAddress } }, transport);
  }
}

export interface ChannelMessageView {
  id: string; channel: ChannelName; senderAddress: string | null; senderName: string | null; senderStaffId: string | null; senderStaffName: string | null;
  senderVerified: boolean; senderKind: 'VERIFIED' | 'SPOOF_SUSPECT' | 'UNKNOWN'; subject: string | null; receivedAt: string; fileName: string | null;
  size: number | null; status: string; batchId: string | null; invoiceId: string | null; note: string | null;
}

export function listChannelMessages(limit = 100, viewer?: AppUser | null): ChannelMessageView[] {
  const conceal = viewer?.role === 'ACCOUNTANT';
  const db = getDatabase();
  const rows = db.prepare(`SELECT m.*, s.full_name staff_name FROM channel_messages m LEFT JOIN staff_directory s ON s.id=m.sender_staff_id ORDER BY m.created_at DESC LIMIT ?`).all(Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>;
  return rows.map(r => {
    const verified = Number(r.sender_verified) === 1;
    const address = (r.sender_address as string | null) ?? null;
    const matchesStaff = !verified && r.channel === 'GMAIL' && address
      ? Boolean(db.prepare('SELECT 1 FROM staff_directory WHERE lower(email)=? AND active=1').get(address.toLowerCase())) : false;
    return {
      id: String(r.id), channel: r.channel as ChannelName, senderAddress: conceal ? maskContact(address) : address, senderName: (r.sender_name as string | null) ?? null,
      senderStaffId: (r.sender_staff_id as string | null) ?? null, senderStaffName: (r.staff_name as string | null) ?? null, senderVerified: verified,
      senderKind: verified ? 'VERIFIED' : matchesStaff ? 'SPOOF_SUSPECT' : 'UNKNOWN', subject: (r.subject as string | null) ?? null,
      receivedAt: String(r.received_at), fileName: (r.file_name as string | null) ?? null, size: (r.size as number | null) ?? null, status: String(r.status),
      batchId: (r.batch_id as string | null) ?? null, invoiceId: (r.invoice_id as string | null) ?? null, note: (r.note as string | null) ?? null,
    };
  });
}

export function channelStatus(): Record<ChannelName, { configured: boolean; simulated: boolean; lastPullAt: string | null; counts: Record<string, number> }> {
  const db = getDatabase();
  const one = (channel: ChannelName, configured: boolean) => {
    const last = db.prepare('SELECT created_at FROM audit_events WHERE entity_id=? AND event_type=? ORDER BY rowid DESC LIMIT 1').get(`channel:${channel}`, 'CHANNEL_PULLED') as { created_at: string } | undefined;
    const counts = Object.fromEntries((db.prepare('SELECT status, COUNT(*) n FROM channel_messages WHERE channel=? GROUP BY status').all(channel) as Array<{ status: string; n: number }>).map(r => [r.status, r.n]));
    return { configured, simulated: demoChannelsActive(), lastPullAt: last?.created_at ?? null, counts };
  };
  return { GMAIL: one('GMAIL', gmailConfigured()), ZALO: one('ZALO', Boolean(process.env.ZALO_BOT_TOKEN)) };
}

/** Thêm người vào danh bạ người gửi (KTT/CFO). Email đặt chữ thường; email hoặc Zalo id phải có ít nhất một. */
export function addStaff(user: AppUser, input: { fullName: string; department?: string | null; title?: string | null; email?: string | null; zaloUserId?: string | null }): StaffMember {
  requireRole(user, MANAGER_ROLES, 'Chỉ Kế toán trưởng hoặc CFO được sửa danh bạ người gửi.');
  const email = input.email?.trim().toLowerCase() || null;
  const zalo = input.zaloUserId?.trim() || null;
  if (!input.fullName?.trim() || (!email && !zalo)) throw new WorkflowError('Cần họ tên và email hoặc Zalo user id.', 400);
  seedStaffDirectory();
  const db = getDatabase();
  if (email && db.prepare('SELECT 1 FROM staff_directory WHERE lower(email)=?').get(email)) throw new WorkflowError('Email đã có trong danh bạ.', 409);
  if (zalo && db.prepare('SELECT 1 FROM staff_directory WHERE zalo_user_id=?').get(zalo)) throw new WorkflowError('Zalo user id đã có trong danh bạ.', 409);
  const id = `STAFF-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  db.prepare(`INSERT INTO staff_directory (id,full_name,department,title,email,zalo_user_id,app_user_id,manager_staff_id,active,created_at) VALUES (?,?,?,?,?,?,NULL,?,1,?)`)
    .run(id, input.fullName.trim().slice(0, 120), input.department?.trim().slice(0, 80) || null, input.title?.trim().slice(0, 80) || null, email, zalo, getStaff('STAFF-KTT') ? 'STAFF-KTT' : null, jsonNow());
  appendAuditEvent({ eventType: 'STAFF_ADDED', entityId: `staff:${id}`, actorId: user.id, payload: { hasEmail: Boolean(email), hasZalo: Boolean(zalo), actorRole: user.role } });
  return getStaff(id)!;
}

/**
 * KTT/CFO xác nhận người gửi lạ là một nhân viên, rồi xử lý file đó (XML) như hồ sơ nhân viên đã xác thực. Hồ sơ và lô được tạo dưới tên
 * Kế toán viên đã lấy thư (người nhập), không phải người xác nhận — người xác nhận vẫn giữ quyền trả lời câu hỏi và chốt lô.
 */
export async function assignSender(user: AppUser, messageId: string, staffId: string): Promise<ChannelMessageView> {
  requireRole(user, MANAGER_ROLES, 'Chỉ Kế toán trưởng hoặc CFO được xác nhận người gửi.');
  const db = getDatabase();
  const message = db.prepare('SELECT * FROM channel_messages WHERE id=?').get(messageId) as Record<string, unknown> | undefined;
  if (!message) throw new WorkflowError('Không tìm thấy file đã nhận.', 404);
  if (message.status !== 'NEEDS_SENDER_REVIEW') throw new WorkflowError('File này không chờ xác nhận người gửi.', 409);
  const staff = getStaff(staffId);
  if (!staff || !staff.active) throw new WorkflowError('Không tìm thấy nhân viên trong danh bạ.', 404);
  const storagePath = message.storage_path as string | null;
  if (!storagePath || !fs.existsSync(storagePath)) throw new WorkflowError('Không còn file gốc để xử lý.', 410);
  const content = fs.readFileSync(storagePath);
  const hash = String(message.sha256);
  const fileName = String(message.file_name ?? 'tep');
  const entrant = userById(message.pulled_by_user_id as string | null) ?? user;
  let status: ChannelMessageStatus = 'QUEUED'; let note = `Người gửi do ${user.role} xác nhận là ${staff.fullName}.`;
  let batchId: string | null = null; let invoiceId: string | null = null;
  if (sourceTypeOf(fileName) === 'XML') {
    try {
      const artifact = storeArtifact(fileName, String(message.mime ?? ''), content, hash);
      const outcome = await evaluateXml(entrant, artifact, hash, content);
      invoiceId = outcome.invoiceId;
      const already = db.prepare('SELECT batch_id FROM batch_items WHERE invoice_id=?').get(invoiceId) as { batch_id: string } | undefined;
      if (already) { batchId = already.batch_id; note += ` Trùng: hóa đơn đã nằm trong lô ${already.batch_id}.`; }
      else {
        batchId = createBatch(entrant, { label: `Lô ${message.channel === 'ZALO' ? 'Zalo' : 'Gmail'} — xác nhận người gửi ${vnStamp()}`, source: message.channel as ChannelName }).id;
        attachToBatch(entrant, batchId, { invoiceId, fileName, fileSha256: hash, sourceRef: `${message.channel}:${message.external_id}`.slice(0, 200), submitterStaffId: staff.id });
        note += ` Máy đã kiểm: ${outcome.workflowStatus}`;
      }
      status = 'PROCESSED';
    } catch (error) { status = 'ERROR'; note = (error instanceof Error ? error.message : 'Không đọc được file').slice(0, 300); }
  } else note += ` ${QUEUED_NOTE}`;
  db.prepare('UPDATE channel_messages SET sender_staff_id=?, status=?, note=?, batch_id=?, invoice_id=? WHERE id=?').run(staff.id, status, note.slice(0, 300), batchId, invoiceId, messageId);
  appendAuditEvent({ eventType: 'CHANNEL_SENDER_ASSIGNED', entityId: invoiceId ?? `channel-message:${messageId}`, actorId: user.id, payload: { staffId: staff.id, status, actorRole: user.role, processedAs: entrant.id, batchId } });
  return listChannelMessages(200).find(m => m.id === messageId)!;
}
