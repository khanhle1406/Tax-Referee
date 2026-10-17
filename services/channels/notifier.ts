/**
 * Gửi tin ra ngoài (email qua SMTP Gmail, tin Zalo qua Bot API sendMessage).
 * Luôn ghi outbound_notifications (SENT / FAILED / SKIPPED_NOT_CONFIGURED) và KHÔNG BAO GIỜ ném lỗi vào quy trình duyệt.
 * Không ghi token / mật khẩu vào log hay vào lỗi lưu lại.
 */
import crypto from 'node:crypto';
import { getDatabase, jsonNow } from '@/lib/server/db';
import { gmailConfigured } from './gmailChannel';
import { zaloConfigured, ZALO_API_BASE } from './zaloChannel';

export type NotifyStatus = 'SENT' | 'FAILED' | 'SKIPPED_NOT_CONFIGURED' | 'SIMULATED';
export interface NotifyInput { kind: string; text: string; subject?: string; invoiceId?: string | null; batchId?: string | null; to?: { email?: string | null; zaloChatId?: string | null } }
export interface NotifyTransport {
  emailReady: boolean; zaloReady: boolean;
  /** Bộ gửi mô phỏng (phiên demo): không gửi ra ngoài, ghi trạng thái SIMULATED. Có người nhận mặc định riêng. */
  simulated?: boolean; defaultEmail?: string; defaultZaloChatId?: string;
  sendEmail(to: string, subject: string, text: string): Promise<void>;
  sendZalo(chatId: string, text: string): Promise<void>;
}
export interface NotificationRecord { id: string; channel: 'EMAIL' | 'ZALO'; recipient: string | null; status: NotifyStatus; error: string | null }

/** Kênh gửi thật: SMTP smtp.gmail.com:465 (App Password) và Zalo Bot API. Nạp nodemailer động. */
export function defaultTransport(): NotifyTransport {
  return {
    emailReady: gmailConfigured(), zaloReady: zaloConfigured(),
    async sendEmail(to, subject, text) {
      const nodemailer = await import('nodemailer');
      const mailer = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.GMAIL_IMAP_USER, pass: process.env.GMAIL_APP_PASSWORD } });
      await mailer.sendMail({ from: process.env.GMAIL_IMAP_USER, to, subject, text });
    },
    async sendZalo(chatId, text) {
      const response = await fetch(`${ZALO_API_BASE}/bot${process.env.ZALO_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 2000) }), signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; description?: string };
      if (!response.ok || body.ok === false) throw new Error(`Zalo trả lỗi ${response.status}`);
    },
  };
}

/** Lỗi lưu lại không được chứa token: cắt bỏ mọi đoạn giống token trong đường dẫn bot. */
const safeError = (error: unknown): string => (error instanceof Error ? error.message : 'Gửi lỗi').replace(/bot[^/\s]+/g, 'bot***').slice(0, 300);

function record(channel: 'EMAIL' | 'ZALO', recipient: string | null, input: NotifyInput, status: NotifyStatus, error: string | null): NotificationRecord {
  const id = crypto.randomUUID();
  try {
    getDatabase().prepare('INSERT INTO outbound_notifications (id,channel,recipient,invoice_id,batch_id,kind,body,status,error,created_at,sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, channel, recipient?.slice(0, 200) ?? null, input.invoiceId ?? null, input.batchId ?? null, input.kind.slice(0, 60), input.text.slice(0, 2000), status, error, jsonNow(), status === 'SENT' ? jsonNow() : null);
  } catch { /* không để lỗi ghi nhật ký gửi tin chặn quy trình */ }
  return { id, channel, recipient, status, error };
}

/**
 * Gửi một tin. Không có `to` ⇒ gửi Kế toán trưởng (GMAIL_NOTIFY_TO / ZALO_NOTIFY_CHAT_ID).
 * Kênh chưa cấu hình hoặc không có người nhận ⇒ ghi SKIPPED_NOT_CONFIGURED. Không bao giờ ném lỗi.
 */
export async function notify(input: NotifyInput, transport: NotifyTransport = defaultTransport()): Promise<NotificationRecord[]> {
  const out: NotificationRecord[] = [];
  try {
    // Bộ gửi mô phỏng (phiên demo) KHÔNG đọc người nhận thật trong biến môi trường: địa chỉ của đội không lọt vào DB phiên của người lạ.
    const email = input.to ? input.to.email ?? null : transport.simulated ? transport.defaultEmail ?? null : process.env.GMAIL_NOTIFY_TO ?? null;
    const zalo = input.to ? input.to.zaloChatId ?? null : transport.simulated ? transport.defaultZaloChatId ?? null : process.env.ZALO_NOTIFY_CHAT_ID ?? null;
    if (!input.to || input.to.email !== undefined) {
      if (!transport.emailReady || !email) out.push(record('EMAIL', email, input, 'SKIPPED_NOT_CONFIGURED', null));
      else {
        try { await transport.sendEmail(email, input.subject ?? 'Tax Referee — thông báo', input.text); out.push(record('EMAIL', email, input, transport.simulated ? 'SIMULATED' : 'SENT', null)); }
        catch (error) { out.push(record('EMAIL', email, input, 'FAILED', safeError(error))); }
      }
    }
    if (!input.to || input.to.zaloChatId !== undefined) {
      if (!transport.zaloReady || !zalo) out.push(record('ZALO', zalo, input, 'SKIPPED_NOT_CONFIGURED', null));
      else {
        try { await transport.sendZalo(zalo, input.text); out.push(record('ZALO', zalo, input, transport.simulated ? 'SIMULATED' : 'SENT', null)); }
        catch (error) { out.push(record('ZALO', zalo, input, 'FAILED', safeError(error))); }
      }
    }
  } catch { /* không bao giờ ném lỗi vào quy trình */ }
  return out;
}

export function listNotifications(limit = 50, conceal = false): Array<{ id: string; channel: string; recipient: string | null; kind: string; body: string; status: string; createdAt: string }> {
  const hide = (value: string | null) => !conceal || !value ? value : value.lastIndexOf('@') > 0 ? `***${value.slice(value.lastIndexOf('@'))}` : `${value.slice(0, 3)}***`;
  return (getDatabase().prepare('SELECT id,channel,recipient,kind,body,status,created_at FROM outbound_notifications ORDER BY created_at DESC LIMIT ?').all(Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>)
    .map(r => ({ id: String(r.id), channel: String(r.channel), recipient: hide((r.recipient as string | null) ?? null), kind: String(r.kind), body: String(r.body), status: String(r.status), createdAt: String(r.created_at) }));
}
