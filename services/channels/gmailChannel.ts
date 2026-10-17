/**
 * Kênh Gmail thật: đọc thư CHƯA ĐỌC qua IMAP (imap.gmail.com:993, TLS) bằng App Password.
 * Client được tiêm vào (interface GmailClient) để test dùng client giả — không gọi mạng trong test.
 * Không bao giờ ghi log mật khẩu; chỉ trả về trạng thái "đã cấu hình / chưa cấu hình".
 */
export interface MailAttachment { fileName: string; mime: string; content: Buffer }
export interface InboundMail {
  uid: number; messageId: string; from: string; fromName?: string; subject?: string; receivedAt?: string;
  /** Header Authentication-Results trên cùng do máy chủ nhận (mx.google.com) thêm vào — nguồn duy nhất để tin SPF/DKIM. */
  authenticationResults?: string;
  attachments: MailAttachment[];
}
export interface GmailClient {
  fetchUnseen(limit: number): Promise<InboundMail[]>;
  markSeen(uids: number[]): Promise<void>;
  close(): Promise<void>;
}

export const gmailConfigured = (): boolean => Boolean(process.env.GMAIL_IMAP_USER && process.env.GMAIL_APP_PASSWORD);

/**
 * Lấy header Authentication-Results TRÊN CÙNG trong phần đầu thư gốc, và chỉ khi do mx.google.com ghi.
 * Người gửi có thể tự chèn header giả bên dưới; Gmail luôn thêm header của mình lên đầu khi nhận thư.
 */
export function topAuthenticationResults(source: Buffer | string): string | undefined {
  const text = typeof source === 'string' ? source : source.toString('utf8');
  const end = text.search(/\r?\n\r?\n/);
  const head = (end >= 0 ? text.slice(0, end) : text).replace(/\r?\n[ \t]+/g, ' ');
  const line = head.split(/\r?\n/).find(l => /^authentication-results:/i.test(l));
  if (!line) return undefined;
  const value = line.slice(line.indexOf(':') + 1).trim();
  return /^mx\.google\.com\s*;/i.test(value) ? value : undefined;
}

/** Client IMAP thật (imapflow + mailparser), nạp động để test và trang khác không phải tải thư viện. */
export async function createImapGmailClient(): Promise<GmailClient> {
  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, logger: false,
    auth: { user: process.env.GMAIL_IMAP_USER ?? '', pass: process.env.GMAIL_APP_PASSWORD ?? '' },
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  return {
    async fetchUnseen(limit) {
      const found = await client.search({ seen: false }, { uid: true });
      const uids = (Array.isArray(found) ? found : []).slice(-limit);
      const mails: InboundMail[] = [];
      for (const uid of uids) {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) continue;
        const parsed = await simpleParser(message.source);
        const sender = parsed.from?.value?.[0];
        mails.push({
          uid, messageId: parsed.messageId || `uid-${uid}`, from: sender?.address ?? '', fromName: sender?.name || undefined,
          subject: parsed.subject, receivedAt: parsed.date?.toISOString(),
          authenticationResults: topAuthenticationResults(message.source),
          attachments: parsed.attachments.map(a => ({ fileName: a.filename || 'tep-dinh-kem', mime: a.contentType || 'application/octet-stream', content: a.content })),
        });
      }
      return mails;
    },
    async markSeen(uids) { if (uids.length) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); },
    async close() { lock.release(); await client.logout().catch(() => undefined); },
  };
}
