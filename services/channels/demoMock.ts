/**
 * Kênh Gmail/Zalo MÔ PHỎNG cho phiên demo: hộp thư và bot giả, dữ liệu mẫu cố định, không gọi mạng, không gửi tin thật.
 * Chạy đúng đường xử lý của kênh thật (nhận diện người gửi qua SPF/DKIM, chống mạo danh, lưu file, máy kiểm, vào lô, báo tin),
 * chỉ thay nguồn thư/ảnh và bộ gửi tin. Bật khi: phiên demo (sandbox) và chủ máy KHÔNG đặt TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO=1.
 */
import { getDatabase, isSandbox } from '@/lib/server/db';
import type { GmailClient, InboundMail } from './gmailChannel';
import type { ZaloClient, ZaloUpdate } from './zaloChannel';
import type { NotifyTransport } from './notifier';
import { DEMO_MAIL_XML, DEMO_ZALO_IMAGE_BASE64 } from './demoMockData';

export const DEMO_ZALO_STAFF_ID = 'zalo-demo-minhanh';
const RECEIVED = '2026-10-15T08:30:00.000Z';
const passFor = (address: string) => `mx.google.com; dkim=pass header.i=@example.com header.s=s1; spf=pass (google.com: domain of ${address} designates 203.0.113.10 as permitted sender) smtp.mailfrom=${address}`;
const xml = (fileName: string, key: string) => ({ fileName, mime: 'application/xml', content: Buffer.from(DEMO_MAIL_XML[key], 'utf8') });

const DEMO_MAILS: InboundMail[] = [
  { uid: 1, messageId: '<demo-201@example.com>', from: 'minhanh.kd@example.com', fromName: 'Nguyễn Minh Anh', subject: 'Hóa đơn mực in tháng 10', receivedAt: RECEIVED,
    authenticationResults: passFor('minhanh.kd@example.com'), attachments: [xml('muc-in-thang-10.xml', 'kd')] },
  { uid: 2, messageId: '<demo-202@example.com>', from: 'quocbao.hc@example.com', fromName: 'Trần Quốc Bảo', subject: 'Gửi kế toán 2 hóa đơn tuần này', receivedAt: RECEIVED,
    authenticationResults: passFor('quocbao.hc@example.com'), attachments: [xml('bao-tri-photocopy.xml', 'hc1'), xml('tiep-khach-doi-tac.xml', 'hc2')] },
  // Giả danh nhân viên kinh doanh: địa chỉ "From" đúng nhưng SPF/DKIM trượt ⇒ nghi mạo danh, không xử lý.
  { uid: 3, messageId: '<demo-204@evil.example.net>', from: 'minhanh.kd@example.com', fromName: 'Nguyễn Minh Anh', subject: 'GẤP: thanh toán phí tư vấn hôm nay', receivedAt: RECEIVED,
    authenticationResults: 'mx.google.com; dkim=none; spf=fail (google.com: domain of minhanh.kd@example.com does not designate 198.51.100.7 as permitted sender) smtp.mailfrom=minhanh.kd@example.com',
    attachments: [xml('phi-tu-van-gap.xml', 'spoof')] },
  // Nhà cung cấp mới, chưa có trong danh bạ ⇒ chờ Kế toán trưởng xác nhận người gửi.
  { uid: 4, messageId: '<demo-205@baobimoi.example.org>', from: 'sales@baobimoi.example.org', fromName: 'Bao Bì Mới', subject: 'Hóa đơn thùng carton', receivedAt: RECEIVED,
    authenticationResults: 'mx.google.com; dkim=pass header.i=@baobimoi.example.org header.s=s1; spf=pass smtp.mailfrom=sales@baobimoi.example.org',
    attachments: [xml('bao-gia-carton.xml', 'unknown')] },
];

const DEMO_ZALO: ZaloUpdate[] = [
  { messageId: 'demo-zalo-318', eventName: 'message.image.received', fromId: DEMO_ZALO_STAFF_ID, fromName: 'Nguyễn Minh Anh', chatId: DEMO_ZALO_STAFF_ID,
    photoUrl: 'https://f1.zdn.vn/demo/hoa-don-com-trua.jpg', caption: 'Hóa đơn cơm trưa tiếp khách', date: RECEIVED },
  { messageId: 'demo-zalo-319', eventName: 'message.image.received', fromId: 'zalo-demo-nguoi-la', fromName: 'Người lạ', chatId: 'zalo-demo-nguoi-la',
    photoUrl: 'https://f1.zdn.vn/demo/hoa-don-la.jpg', caption: 'Thanh toán giúp em hóa đơn này', date: RECEIVED },
];

/** Phiên demo không bật kênh thật ⇒ dùng kênh mô phỏng. */
export const demoChannelsActive = (): boolean => isSandbox() && process.env.TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO !== '1';

/** Gắn Zalo id mẫu cho nhân viên kinh doanh trong DB của phiên demo (nếu chưa có), để tin Zalo mẫu nhận diện được. */
export function prepareDemoDirectory(): void {
  getDatabase().prepare('UPDATE staff_directory SET zalo_user_id=? WHERE id=? AND zalo_user_id IS NULL').run(DEMO_ZALO_STAFF_ID, 'STAFF-KD');
}

export function demoGmailClient(): GmailClient {
  return { fetchUnseen: async (limit) => DEMO_MAILS.slice(0, limit), markSeen: async () => undefined, close: async () => undefined };
}

export function demoZaloClient(): ZaloClient {
  return { getUpdates: async () => DEMO_ZALO, download: async () => ({ mime: 'image/jpeg', content: Buffer.from(DEMO_ZALO_IMAGE_BASE64, 'base64') }) };
}

/** Bộ gửi tin mô phỏng: không gửi ra ngoài; mỗi tin được ghi lại với trạng thái SIMULATED để xem trên màn hình. */
export function demoNotifier(): NotifyTransport {
  return { emailReady: true, zaloReady: true, simulated: true, defaultEmail: 'duclong.ktt@example.com', defaultZaloChatId: 'zalo-demo-ktt',
    sendEmail: async () => undefined, sendZalo: async () => undefined };
}
