/**
 * Kênh Zalo Bot Platform (token), kiểu long polling.
 * Đã đối chiếu tài liệu chính thức bot.zaloplatforms.com (17/10/2026):
 *  - POST https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/getUpdates  (tham số `timeout` dạng chuỗi giây; không dùng được khi đang đặt webhook)
 *  - POST https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/sendMessage {chat_id, text 1–2000 ký tự} → {ok, result:{message_id,date}}
 *  - Sự kiện: result.event_name = 'message.image.received' có result.message.photo (đường dẫn ảnh), caption; from.id, chat.id.
 * Bot Zalo KHÔNG nhận file XML/PDF (tài liệu chỉ có text/ảnh/sticker/voice) ⇒ kênh Zalo chỉ nhận ẢNH hóa đơn.
 */
export const ZALO_API_BASE = 'https://bot-api.zaloplatforms.com';
/**
 * Máy chủ ảnh được phép tải (chống SSRF). // UNVERIFIED: tài liệu không nêu tên miền chứa ảnh; danh sách này là
 * các tên miền CDN của Zalo đã biết — nếu ảnh thật nằm ở miền khác, file bị từ chối (an toàn) và cần bổ sung sau khi xem payload thật.
 */
export const ZALO_FILE_HOST_SUFFIXES = ['zdn.vn', 'zadn.vn', 'zalo.me', 'zaloapp.com', 'zaloplatforms.com'];

export interface ZaloUpdate { messageId: string; eventName: string; fromId: string; fromName?: string; chatId: string; text?: string; photoUrl?: string; caption?: string; date?: string }
export interface ZaloClient {
  getUpdates(): Promise<ZaloUpdate[]>;
  download(url: string): Promise<{ content: Buffer; mime: string }>;
}

export const zaloConfigured = (): boolean => Boolean(process.env.ZALO_BOT_TOKEN);

/** Chỉ https, không cổng lạ, không user:pass, máy chủ đúng hoặc là miền con của danh sách cho phép. */
export function isAllowedZaloFileUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    const host = url.hostname.toLowerCase();
    return ZALO_FILE_HOST_SUFFIXES.some(s => host === s || host.endsWith(`.${s}`));
  } catch { return false; }
}

/** Đọc phản hồi getUpdates: `result` có thể là một cập nhật (theo mẫu webhook) hoặc một mảng. */
export function parseZaloUpdates(body: unknown): ZaloUpdate[] {
  const result = (body as { result?: unknown })?.result;
  const list = Array.isArray(result) ? result : result ? [result] : [];
  const out: ZaloUpdate[] = [];
  for (const item of list as Array<Record<string, unknown>>) {
    const message = item?.message as Record<string, unknown> | undefined;
    const from = message?.from as Record<string, unknown> | undefined;
    const chat = message?.chat as Record<string, unknown> | undefined;
    if (!message || !from?.id || !message.message_id) continue;
    out.push({
      messageId: String(message.message_id), eventName: String(item.event_name ?? ''), fromId: String(from.id), fromName: from.display_name ? String(from.display_name) : undefined,
      chatId: String(chat?.id ?? from.id), text: typeof message.text === 'string' ? message.text : undefined,
      photoUrl: typeof message.photo === 'string' ? message.photo : undefined, caption: typeof message.caption === 'string' ? message.caption : undefined,
      date: message.date ? new Date(Number(message.date)).toISOString() : undefined,
    });
  }
  return out;
}

const MAX_BYTES = 15 * 1024 * 1024;

/** Client HTTP thật. Không theo chuyển hướng (redirect) khi tải ảnh để không bị dẫn sang máy nội bộ. */
export function createHttpZaloClient(): ZaloClient {
  const token = process.env.ZALO_BOT_TOKEN ?? '';
  return {
    async getUpdates() {
      const response = await fetch(`${ZALO_API_BASE}/bot${token}/getUpdates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeout: '3' }), signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Zalo getUpdates lỗi ${response.status}`);
      return parseZaloUpdates(await response.json());
    },
    async download(url) {
      if (!isAllowedZaloFileUrl(url)) throw new Error('Liên kết file không thuộc máy chủ Zalo — từ chối tải.');
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Không tải được ảnh (${response.status})`);
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^image\/(png|jpe?g|webp)$/.test(mime)) throw new Error('File tải về không phải ảnh PNG/JPG/WEBP.');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > MAX_BYTES) throw new Error('Ảnh lớn hơn 15 MB.');
      const content = Buffer.from(await response.arrayBuffer());
      if (content.byteLength > MAX_BYTES) throw new Error('Ảnh lớn hơn 15 MB.');
      return { content, mime };
    },
  };
}
