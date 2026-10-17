/**
 * Kiểm tra kết nối Gmail/Zalo THẬT trước khi demo — không in token, mật khẩu hay nội dung thư.
 *
 *   npx tsx --env-file=<file biến môi trường của bạn> scripts/ops/channels-check.ts            # kiểm kết nối
 *   npx tsx --env-file=<file biến môi trường của bạn> scripts/ops/channels-check.ts --send-test # gửi thử 1 email + 1 tin Zalo
 *
 * Biến dùng (chỉ tên): GMAIL_IMAP_USER, GMAIL_APP_PASSWORD, GMAIL_NOTIFY_TO, ZALO_BOT_TOKEN, ZALO_NOTIFY_CHAT_ID.
 * Zalo: nhắn một tin bất kỳ cho bot trước, rồi chạy script để thấy chat id của mình (điền vào ZALO_NOTIFY_CHAT_ID).
 */
const mask = (text: string): string => {
  let out = text;
  for (const secret of [process.env.ZALO_BOT_TOKEN, process.env.GMAIL_APP_PASSWORD]) if (secret) out = out.split(secret).join('***');
  return out.replace(/bot[0-9A-Za-z:_-]{10,}/g, 'bot***');
};
const line = (ok: boolean | null, label: string, detail = '') => console.log(`${ok === null ? '—  ' : ok ? 'ĐẠT' : 'LỖI'}  ${label}${detail ? ` · ${mask(detail)}` : ''}`);
const ZALO = 'https://bot-api.zaloplatforms.com';

async function checkGmail(sendTest: boolean): Promise<void> {
  const user = process.env.GMAIL_IMAP_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) { line(null, 'Gmail', 'chưa đặt GMAIL_IMAP_USER / GMAIL_APP_PASSWORD'); return; }
  try {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, logger: false, auth: { user, pass } });
    await client.connect();
    const status = await client.status('INBOX', { messages: true, unseen: true });
    await client.logout();
    line(true, 'Gmail IMAP (đọc hộp thư)', `${user} · ${status.messages ?? 0} thư, ${status.unseen ?? 0} chưa đọc`);
  } catch (error) { line(false, 'Gmail IMAP', `${(error as Error).message} — cần bật xác minh 2 bước và dùng App Password 16 ký tự, bật IMAP trong cài đặt Gmail`); }
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
    await transport.verify();
    line(true, 'Gmail SMTP (gửi thư báo)');
    const to = process.env.GMAIL_NOTIFY_TO;
    if (sendTest && to) {
      await transport.sendMail({ from: user, to, subject: 'Tax Referee — thư thử kết nối', text: 'Kết nối Gmail của Tax Referee hoạt động. Đây là thư thử, không cần trả lời.' });
      line(true, 'Gửi thư thử', `tới ${to}`);
    } else if (sendTest) line(null, 'Gửi thư thử', 'chưa đặt GMAIL_NOTIFY_TO');
  } catch (error) { line(false, 'Gmail SMTP', (error as Error).message); }
}

async function zaloCall(method: string, body: Record<string, unknown> = {}): Promise<{ ok?: boolean; result?: unknown; description?: string }> {
  const response = await fetch(`${ZALO}/bot${process.env.ZALO_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  return response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` }));
}

async function checkZalo(sendTest: boolean): Promise<void> {
  if (!process.env.ZALO_BOT_TOKEN) { line(null, 'Zalo Bot', 'chưa đặt ZALO_BOT_TOKEN'); return; }
  try {
    const me = await zaloCall('getMe');
    const info = (me.result ?? {}) as { account_name?: string; display_name?: string; id?: string };
    line(Boolean(me.ok), 'Zalo Bot (token)', me.ok ? `bot ${info.display_name ?? info.account_name ?? info.id ?? ''}` : me.description ?? 'token không hợp lệ');
    const updates = await zaloCall('getUpdates', { timeout: '2' });
    const list = Array.isArray(updates.result) ? updates.result : updates.result ? [updates.result] : [];
    const chats = new Map<string, string>();
    for (const u of list as Array<{ message?: { chat?: { id?: string }; from?: { id?: string; display_name?: string } } }>) {
      const id = u.message?.chat?.id ?? u.message?.from?.id;
      if (id) chats.set(String(id), u.message?.from?.display_name ?? '');
    }
    line(updates.ok !== false, 'Zalo getUpdates', chats.size ? `chat id gần đây: ${[...chats].map(([id, name]) => `${id}${name ? ` (${name})` : ''}`).join(', ')}` : 'chưa có tin mới — hãy nhắn bot một tin rồi chạy lại để thấy chat id');
    const chat = process.env.ZALO_NOTIFY_CHAT_ID;
    if (sendTest && chat) {
      const sent = await zaloCall('sendMessage', { chat_id: chat, text: 'Tax Referee: kết nối Zalo hoạt động. Đây là tin thử.' });
      line(Boolean(sent.ok), 'Gửi tin Zalo thử', sent.ok ? `tới chat ${chat}` : sent.description ?? 'không gửi được (người nhận phải nhắn bot trước)');
    } else if (sendTest) line(null, 'Gửi tin Zalo thử', 'chưa đặt ZALO_NOTIFY_CHAT_ID');
  } catch (error) { line(false, 'Zalo Bot', (error as Error).message); }
}

async function main(): Promise<void> {
  const sendTest = process.argv.includes('--send-test');
  console.log('Tax Referee · kiểm tra kênh Gmail/Zalo thật\n');
  await checkGmail(sendTest);
  await checkZalo(sendTest);
  console.log('\nDemo trên máy của đội trong phiên demo: đặt thêm TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO=1.');
}
void main();
