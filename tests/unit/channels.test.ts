/**
 * Kênh Gmail: client IMAP giả (không gọi mạng). Nhân viên đã xác thực gửi XML ⇒ máy kiểm và gắn vào lô GMAIL;
 * cùng địa chỉ nhưng không qua SPF/DKIM ⇒ chờ xác nhận người gửi; kéo lại cùng thư không tạo bản trùng.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDatabase, runIsolated } from '../../lib/server/db';
import { switchRole } from '../../lib/server/auth';
import { assignSender, listChannelMessages, MAX_ATTACHMENTS_PER_MAIL, MAX_PENDING_UNVERIFIED, MAX_UNVERIFIED_FILES_PER_PULL, pullChannel } from '../../services/channels/channelService';
import { signOffBatch } from '../../services/batchService';
import { answerHandoff, readRecord } from '../../services/workflowService';
import { topAuthenticationResults, type GmailClient, type InboundMail } from '../../services/channels/gmailChannel';
import { listNotifications, notify } from '../../services/channels/notifier';
import { isAllowedZaloFileUrl, parseZaloUpdates, type ZaloClient } from '../../services/channels/zaloChannel';
import { emailAuthenticated, seedStaffDirectory } from '../../services/staffDirectory';

const fakeGmail = (mails: InboundMail[], seen: number[] = []): GmailClient => ({
  fetchUnseen: async () => mails, markSeen: async (uids) => { seen.push(...uids); }, close: async () => undefined,
});
const AUTH_OK = 'mx.google.com; dkim=pass header.i=@example.com header.s=s1; spf=pass (google.com: domain of minhanh.kd@example.com designates 1.2.3.4) smtp.mailfrom=minhanh.kd@example.com';
const XML = `<?xml version="1.0" encoding="UTF-8"?><HDon><DLHDon><TTChung><KHHDon>C26TAA</KHHDon><SHDon>4521</SHDon><NLap>2026-10-05</NLap><HTTToan>Chuyển khoản</HTTToan></TTChung>
<NDHDon><NBan><Ten>Công ty TNHH Văn phòng phẩm Thử</Ten><MST>0312345678</MST><DChi>Quận 1, TP.HCM</DChi></NBan><NMua><Ten>Công ty Mua</Ten><MST>0102030405</MST></NMua>
<DSHHDVu><HHDVu><THHDVu>Giấy in A4</THHDVu><ThTien>2000000</ThTien><TSuat>10%</TSuat></HHDVu></DSHHDVu>
<TToan><TgTCThue>2000000</TgTCThue><TgTThue>200000</TgTThue><TgTTTBSo>2200000</TgTTTBSo></TToan></NDHDon></DLHDon></HDon>`;
const mail = (over: Partial<InboundMail> = {}): InboundMail => ({
  uid: 7, messageId: '<hd-4521@example.com>', from: 'minhanh.kd@example.com', fromName: 'Nguyễn Minh Anh', subject: 'Hóa đơn giấy in',
  authenticationResults: AUTH_OK, attachments: [{ fileName: 'hd-4521.xml', mime: 'application/xml', content: Buffer.from(XML) }], ...over,
});

test('Gmail: nhân viên đã xác thực gửi XML ⇒ máy kiểm, gắn vào một lô GMAIL kèm người nộp; đánh dấu đã đọc', async () => {
  await runIsolated(async () => {
    const user = switchRole('ACCOUNTANT')!.user; const seen: number[] = [];
    const result = await pullChannel(user, 'GMAIL', { gmail: fakeGmail([mail()], seen) });
    assert.equal(result.counts.PROCESSED, 1, JSON.stringify(listChannelMessages()));
    assert.ok(result.batchId, 'tạo lô');
    const db = getDatabase();
    const batch = db.prepare('SELECT source FROM batches WHERE id=?').get(result.batchId) as { source: string };
    assert.equal(batch.source, 'GMAIL');
    const item = db.prepare('SELECT invoice_id, submitter_staff_id FROM batch_items WHERE batch_id=?').get(result.batchId) as { invoice_id: string; submitter_staff_id: string };
    assert.equal(item.submitter_staff_id, 'STAFF-KD');
    assert.ok(db.prepare('SELECT 1 FROM invoices WHERE id=?').get(item.invoice_id), 'hóa đơn đã được máy kiểm');
    assert.deepEqual(seen, [7]);
    const [message] = listChannelMessages();
    assert.equal(message.senderKind, 'VERIFIED');
    assert.ok(message.size && message.size > 0);
  });
});

test('Gmail: cùng địa chỉ nhân viên nhưng không qua SPF/DKIM ⇒ nghi mạo danh, chờ xác nhận, không xử lý', async () => {
  await runIsolated(async () => {
    const user = switchRole('ACCOUNTANT')!.user;
    const result = await pullChannel(user, 'GMAIL', { gmail: fakeGmail([mail({ authenticationResults: undefined })]) });
    assert.equal(result.counts.NEEDS_SENDER_REVIEW, 1);
    assert.equal(result.counts.PROCESSED, 0);
    assert.equal(result.batchId, null, 'không tạo lô');
    const [message] = listChannelMessages();
    assert.equal(message.senderKind, 'SPOOF_SUSPECT');
    assert.equal(message.invoiceId, null);
    assert.equal((getDatabase().prepare('SELECT COUNT(*) n FROM invoices').get() as { n: number }).n, 0);
  });
});

test('Gmail: kéo lại cùng thư không tạo bản trùng; file sai đuôi bị bỏ qua', async () => {
  await runIsolated(async () => {
    const user = switchRole('ACCOUNTANT')!.user;
    const m = mail({ attachments: [...mail().attachments, { fileName: 'virus.exe', mime: 'application/octet-stream', content: Buffer.from('MZ') }] });
    await pullChannel(user, 'GMAIL', { gmail: fakeGmail([m]) });
    const second = await pullChannel(user, 'GMAIL', { gmail: fakeGmail([m]) });
    assert.equal(second.duplicates, 1);
    assert.equal(second.files, 0);
    assert.equal(listChannelMessages().length, 1);
  });
});

test('Thông báo: thiếu cấu hình ⇒ ghi SKIPPED_NOT_CONFIGURED, kênh gửi lỗi ⇒ FAILED, không bao giờ ném lỗi', async () => {
  await runIsolated(async () => {
    const saved = { to: process.env.GMAIL_NOTIFY_TO, chat: process.env.ZALO_NOTIFY_CHAT_ID };
    delete process.env.GMAIL_NOTIFY_TO; delete process.env.ZALO_NOTIFY_CHAT_ID;
    try {
      const skipped = await notify({ kind: 'TEST', text: 'Lô thử' }, { emailReady: false, zaloReady: false, sendEmail: async () => { throw new Error('không được gọi'); }, sendZalo: async () => { throw new Error('không được gọi'); } });
      assert.deepEqual(skipped.map(r => r.status), ['SKIPPED_NOT_CONFIGURED', 'SKIPPED_NOT_CONFIGURED']);
      const failed = await notify({ kind: 'TEST', text: 'x', to: { zaloChatId: 'chat-1' } }, { emailReady: true, zaloReady: true, sendEmail: async () => undefined, sendZalo: async () => { throw new Error('POST https://bot-api.zaloplatforms.com/botSECRET123/sendMessage 500'); } });
      assert.equal(failed[0].status, 'FAILED');
      assert.ok(!failed[0].error?.includes('SECRET123'), 'lỗi lưu lại không chứa token');
      assert.equal(listNotifications().length, 3);
      // Lượt kéo Gmail có lô: tóm tắt cho KTT + báo người gửi, chạy được khi chưa cấu hình kênh gửi.
      const sent: string[] = [];
      const user = switchRole('ACCOUNTANT')!.user;
      await pullChannel(user, 'GMAIL', { gmail: fakeGmail([mail()]), notifier: { emailReady: true, zaloReady: false, sendEmail: async (to, _s, text) => { sent.push(`${to}|${text}`); }, sendZalo: async () => undefined } });
      assert.ok(sent.some(s => s.startsWith('minhanh.kd@example.com|Hóa đơn hd-4521.xml')), sent.join('\n'));
    } finally {
      if (saved.to !== undefined) process.env.GMAIL_NOTIFY_TO = saved.to;
      if (saved.chat !== undefined) process.env.ZALO_NOTIFY_CHAT_ID = saved.chat;
    }
  });
});

test('Zalo: ảnh từ máy chủ ngoài danh sách cho phép bị từ chối, không tải; ảnh của nhân viên đã đăng ký vào hàng chờ', async () => {
  await runIsolated(async () => {
    const user = switchRole('ACCOUNTANT')!.user;
    seedStaffDirectory(); getDatabase().prepare("UPDATE staff_directory SET zalo_user_id='zalo-kd-1' WHERE id='STAFF-KD'").run();
    const downloaded: string[] = [];
    const zalo: ZaloClient = {
      getUpdates: async () => parseZaloUpdates({ ok: true, result: [
        { event_name: 'message.image.received', message: { message_id: 'm1', from: { id: 'zalo-kd-1', display_name: 'Minh Anh' }, chat: { id: 'c1' }, photo: 'http://169.254.169.254/latest/meta-data' } },
        { event_name: 'message.image.received', message: { message_id: 'm2', from: { id: 'zalo-kd-1' }, chat: { id: 'c1' }, photo: 'https://photo-stal-1.zdn.vn/hd.jpg' } },
        { event_name: 'message.text.received', message: { message_id: 'm3', from: { id: 'zalo-kd-1' }, chat: { id: 'c1' }, text: 'chào' } },
      ] }),
      download: async (url) => { downloaded.push(url); return { content: Buffer.from('fake-jpeg'), mime: 'image/jpeg' }; },
    };
    const result = await pullChannel(user, 'ZALO', { zalo, notifier: { emailReady: false, zaloReady: false, sendEmail: async () => undefined, sendZalo: async () => undefined } });
    assert.equal(result.counts.REJECTED, 1);
    assert.equal(result.counts.QUEUED, 1);
    assert.deepEqual(downloaded, ['https://photo-stal-1.zdn.vn/hd.jpg']);
    assert.equal(isAllowedZaloFileUrl('https://zdn.vn.evil.com/a.jpg'), false);
    assert.equal(isAllowedZaloFileUrl('https://user:pw@photo.zdn.vn/a.jpg'), false);
    assert.equal(isAllowedZaloFileUrl('https://photo.zdn.vn:8443/a.jpg'), false);
  });
});

test('Chống mạo danh: tên miền DKIM/SPF phải khớp trọn vẹn, không nhận miền giả có chứa tên miền nhân viên', () => {
  const from = 'minhanh.kd@example.com';
  assert.equal(emailAuthenticated(from, AUTH_OK), true);
  assert.equal(emailAuthenticated(from, 'mx.google.com; dkim=pass header.i=@mail.example.com'), true, 'miền con hợp lệ');
  assert.equal(emailAuthenticated(from, 'mx.google.com; dkim=pass header.d=example.com.evil.net header.s=x'), false);
  assert.equal(emailAuthenticated(from, 'mx.google.com; spf=pass (evil) smtp.mailfrom=attacker@evilexample.com'), false);
  assert.equal(emailAuthenticated(from, 'mx.google.com; dkim=fail header.i=@example.com; spf=softfail smtp.mailfrom=x@example.com'), false);
});

test('Gmail: chỉ tin header Authentication-Results trên cùng do mx.google.com ghi', () => {
  const forged = 'From: a@example.com\r\nAuthentication-Results: evil.example; dkim=pass header.i=@example.com\r\nSubject: x\r\n\r\nbody';
  assert.equal(topAuthenticationResults(forged), undefined);
  const real = `Authentication-Results: mx.google.com;\r\n       dkim=pass header.i=@example.com\r\nAuthentication-Results: evil.example; spf=pass\r\n\r\nbody`;
  assert.match(topAuthenticationResults(real) ?? '', /^mx\.google\.com; dkim=pass/);
});

test('chống mạo danh bằng local-part (example.com@evil.net) và kênh thật không chạy trong phiên demo của người lạ', async () => {
  assert.equal(emailAuthenticated('duclong.ktt@example.com', 'mx.google.com; spf=pass (google.com: domain of example.com@evil.net designates 1.2.3.4 as permitted sender) smtp.mailfrom=example.com@evil.net; dmarc=fail header.from=example.com'), false);
  assert.equal(emailAuthenticated('duclong.ktt@example.com', 'mx.google.com; dkim=pass header.i=example.com@evil.net header.s=s1 header.b=abc'), false);
  assert.equal(emailAuthenticated('duclong.ktt@example.com', 'mx.google.com; dkim=pass header.i=@example.com header.s=s1; spf=pass smtp.mailfrom=bounce@example.com'), true);
  assert.equal(emailAuthenticated('duclong.ktt@example.com', 'mx.google.com; spf=pass smtp.mailfrom=noreply@mail.example.com'), true);
  await runIsolated(async () => {
    const user = switchRole('ACCOUNTANT')!.user;
    // Phiên demo không bật kênh thật ⇒ kênh MÔ PHỎNG: không gọi Gmail thật, vẫn chạy đúng nhận diện người gửi và chống mạo danh.
    const gmail = await pullChannel(user, 'GMAIL');
    assert.equal(gmail.simulated, true);
    assert.ok(gmail.counts.PROCESSED >= 2 && gmail.counts.NEEDS_SENDER_REVIEW === 2, JSON.stringify(gmail.counts));
    const kinds = listChannelMessages().filter(m => m.channel === 'GMAIL').map(m => m.senderKind).sort();
    assert.ok(kinds.includes('SPOOF_SUSPECT') && kinds.includes('UNKNOWN'), kinds.join());
    assert.ok(listNotifications().length > 0 && listNotifications().every(n => n.status === 'SIMULATED' || n.status === 'SKIPPED_NOT_CONFIGURED'));
    const zalo = await pullChannel(user, 'ZALO');
    assert.deepEqual([zalo.simulated, zalo.counts.QUEUED, zalo.counts.NEEDS_SENDER_REVIEW], [true, 1, 1]);
    assert.equal((await pullChannel(user, 'GMAIL')).files, 0, 'kéo lại hộp thư mô phỏng không tạo bản trùng');
  });
});

test('chống mạo danh: local-part trong ngoặc kép chứa "smtp.mailfrom=…" hoặc ";dkim=pass…" không qua được — chỉ đọc thuộc tính ngoài comment', () => {
  assert.equal(emailAuthenticated('duclong.ktt@example.com', 'mx.google.com; spf=pass (google.com: domain of "x smtp.mailfrom=duclong.ktt@example.com y"@evil.net designates 203.0.113.5 as permitted sender) smtp.mailfrom="x smtp.mailfrom=duclong.ktt@example.com y"@evil.net'), false);
  assert.equal(emailAuthenticated('duclong.ktt@example.com', 'mx.google.com; spf=pass smtp.mailfrom="a;dkim=pass header.d=example.com b"@evil.net'), false);
  assert.equal(emailAuthenticated('duclong.ktt@example.com', 'mx.google.com; dkim=pass (good (nested) comment) header.i=@example.com header.s=s1'), true);
});

test('kênh: chỉ Kế toán viên lấy thư; giới hạn file mỗi thư và file của người lạ mỗi lượt; file trùng trong cùng lượt tính một lần; nhật ký ghi người gửi', async () => {
  await runIsolated(async () => {
    const ktt = switchRole('CHIEF_ACCOUNTANT')!.user;
    await assert.rejects(pullChannel(ktt, 'GMAIL', { gmail: fakeGmail([]) }), /Chỉ Kế toán viên/);
    const user = switchRole('ACCOUNTANT')!.user;
    const stranger = (uid: number, files: number): InboundMail => ({ uid, messageId: `<la-${uid}@evil.example.net>`, from: 'la@evil.example.net', authenticationResults: 'mx.google.com; spf=pass smtp.mailfrom=la@evil.example.net',
      attachments: Array.from({ length: files }, (_, k) => ({ fileName: `la-${uid}-${k}.xml`, mime: 'application/xml', content: Buffer.from(`<x>${uid}-${k}</x>`) })) });
    const flood = await pullChannel(user, 'GMAIL', { gmail: fakeGmail([stranger(1, 8), stranger(2, 5), stranger(3, 5)]) });
    assert.equal(flood.counts.NEEDS_SENDER_REVIEW, MAX_UNVERIFIED_FILES_PER_PULL);
    assert.equal(flood.counts.REJECTED, (8 - MAX_ATTACHMENTS_PER_MAIL) + (MAX_ATTACHMENTS_PER_MAIL * 3 - MAX_UNVERIFIED_FILES_PER_PULL));
    assert.ok((getDatabase().prepare('SELECT COUNT(*) n FROM document_artifacts').get() as { n: number }).n <= MAX_UNVERIFIED_FILES_PER_PULL, 'phần vượt trần không được lưu nội dung');
    const twice = await pullChannel(user, 'GMAIL', { gmail: fakeGmail([mail({ uid: 21, messageId: '<a@example.com>' }), mail({ uid: 22, messageId: '<b@example.com>' })]) });
    assert.equal(twice.outcomes.length, 1, 'hai thư cùng file chỉ báo một hóa đơn');
    assert.equal(twice.duplicates, 1);
    assert.equal((getDatabase().prepare('SELECT COUNT(*) n FROM batch_items WHERE batch_id=?').get(twice.batchId) as { n: number }).n, 1);
    const ingested = getDatabase().prepare("SELECT payload_json FROM audit_events WHERE event_type='CHANNEL_FILE_INGESTED' AND payload_json LIKE '%STAFF-KD%'").all();
    assert.ok(ingested.length >= 1, 'nhật ký chống sửa ghi mã nhân viên gửi');
    // Kế toán viên chỉ thấy địa chỉ đã che; KTT thấy đủ.
    assert.ok(listChannelMessages(100, user).every(m => !m.senderAddress || !/^[^*].*@/.test(m.senderAddress)));
    assert.ok(listChannelMessages(100, ktt).some(m => m.senderAddress === 'minhanh.kd@example.com'));
  });
});

test('xác nhận người gửi: file được xử lý dưới tên Kế toán viên đã lấy thư — người xác nhận (CFO) vẫn giữ quyền duyệt, không tự khóa mình', async () => {
  await runIsolated(async () => {
    const acc = switchRole('ACCOUNTANT')!.user;
    await pullChannel(acc, 'GMAIL', { gmail: fakeGmail([mail({ from: 'ncc-moi@example.org', authenticationResults: 'mx.google.com; spf=pass smtp.mailfrom=ncc-moi@example.org' })]) });
    const waiting = listChannelMessages(100).find(m => m.status === 'NEEDS_SENDER_REVIEW')!;
    const cfo = switchRole('CFO')!.user;
    const done = await assignSender(cfo, waiting.id, 'STAFF-KD');
    assert.equal(done.status, 'PROCESSED');
    const row = getDatabase().prepare('SELECT created_by_user_id FROM invoices WHERE id=?').get(done.invoiceId) as { created_by_user_id: string };
    assert.equal(row.created_by_user_id, acc.id, 'người nhập là Kế toán viên đã lấy thư');
    assert.equal((getDatabase().prepare('SELECT created_by_user_id c FROM batches WHERE id=?').get(done.batchId) as { c: string }).c, acc.id);
    // Người xác nhận người gửi là người đưa hóa đơn vào quy trình: không tự chốt hóa đơn đó; người khác (KTT) chốt được.
    const rec = readRecord(done.invoiceId!);
    if (rec.status === 'APPROVED') {
      assert.throws(() => signOffBatch(done.batchId!, cfo, 'CFO tự chốt hóa đơn mình xác nhận người gửi'), /xác nhận người gửi/);
      assert.equal(signOffBatch(done.batchId!, switchRole('CHIEF_ACCOUNTANT')!.user, 'KTT chốt, khác người xác nhận').postedInvoices, 1);
    } else {
      const spec = JSON.parse(rec.decision_json!).handoff.questionSpec as { items: unknown[] };
      const answers = Object.fromEntries(spec.items.map((_, i) => [String(i + 1), 'A']));
      await assert.rejects(answerHandoff(done.invoiceId!, cfo, { answers, reason: 'CFO tự trả lời hóa đơn mình xác nhận người gửi', revision: rec.revision, evaluationId: rec.evaluation_id }), /xác nhận người gửi/);
    }
  });
});

test('mô phỏng: bộ gửi tin của phiên demo không bao giờ ghi người nhận thật trong biến môi trường', async () => {
  const saved = process.env.GMAIL_NOTIFY_TO;
  process.env.GMAIL_NOTIFY_TO = 'that-cua-doi@congty.vn';
  try {
    await runIsolated(async () => {
      const user = switchRole('ACCOUNTANT')!.user;
      await pullChannel(user, 'GMAIL');
      assert.ok(listNotifications().length > 0);
      assert.ok(listNotifications().every(n => n.recipient !== 'that-cua-doi@congty.vn'), JSON.stringify(listNotifications().map(n => n.recipient)));
    });
  } finally { if (saved === undefined) delete process.env.GMAIL_NOTIFY_TO; else process.env.GMAIL_NOTIFY_TO = saved; }
});

test('kênh: hàng chờ xác nhận người gửi có trần chung giữa các lượt; phần vượt trần không tạo dòng, không lưu nội dung', async () => {
  await runIsolated(async () => {
    const user = switchRole('ACCOUNTANT')!.user;
    const insert = getDatabase().prepare("INSERT INTO channel_messages (id, channel, external_id, sender_address, received_at, status, created_at) VALUES (?, 'GMAIL', ?, 'la@x.example', '2026-10-15T00:00:00Z', 'NEEDS_SENDER_REVIEW', '2026-10-15T00:00:00Z')");
    for (let i = 0; i < MAX_PENDING_UNVERIFIED - 2; i++) insert.run(`cho-${i}`, `<cho-${i}@x.example>`);
    const before = (getDatabase().prepare('SELECT COUNT(*) n FROM channel_messages').get() as { n: number }).n;
    const r = await pullChannel(user, 'GMAIL', { gmail: fakeGmail([{ uid: 9, messageId: '<la-9@evil.example.net>', from: 'la@evil.example.net', authenticationResults: 'mx.google.com; spf=pass smtp.mailfrom=la@evil.example.net',
      attachments: Array.from({ length: 5 }, (_, k) => ({ fileName: `la-9-${k}.xml`, mime: 'application/xml', content: Buffer.from(`<x>9-${k}</x>`) })) }]) });
    assert.deepEqual([r.counts.NEEDS_SENDER_REVIEW, r.counts.REJECTED], [2, 3]);
    assert.equal((getDatabase().prepare('SELECT COUNT(*) n FROM channel_messages').get() as { n: number }).n, before + 2, 'phần vượt trần không tạo dòng');
  });
});
