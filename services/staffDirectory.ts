/**
 * Danh bạ người gửi hóa đơn: ai gửi (email / Zalo) là nhân viên nào, phòng nào, ai là quản lý trực tiếp.
 * Dùng chung cho lô hóa đơn, kênh Gmail/Zalo, lịch sử duyệt và dashboard. Người gửi lạ hoặc email không qua
 * xác thực (SPF/DKIM) không bao giờ được coi là nhân viên — hồ sơ phải chờ kế toán xác nhận người gửi.
 */
import crypto from 'crypto';
import { getDatabase, isSandbox } from '@/lib/server/db';

export interface StaffMember {
  id: string; fullName: string; department: string | null; title: string | null; email: string | null;
  zaloUserId: string | null; appUserId: string | null; managerStaffId: string | null; active: boolean;
}
export interface SenderIdentity {
  staff: StaffMember | null;
  /** Kênh xác thực được người gửi (email có SPF/DKIM khớp tên miền, Zalo có user id từ nền tảng). */
  verified: boolean;
  label: string;
  reason: string;
}

/** Danh bạ mẫu cho phiên demo — dữ liệu tổng hợp, tên miền dự phòng example.com (RFC 2606), không trùng người thật. */
const DEMO_STAFF: Array<Omit<StaffMember, 'id' | 'active' | 'appUserId' | 'managerStaffId'> & { key: string; manager?: string; appEmail?: string }> = [
  { key: 'cfo', fullName: 'Võ Hải Yến', department: 'Tài chính', title: 'Giám đốc tài chính', email: 'haiyen.cfo@example.com', zaloUserId: null, appEmail: 'cfo@local' },
  { key: 'ktt', fullName: 'Phạm Đức Long', department: 'Kế toán', title: 'Kế toán trưởng', email: 'duclong.ktt@example.com', zaloUserId: null, manager: 'cfo', appEmail: 'ktt@local' },
  { key: 'kt', fullName: 'Lê Thu Hà', department: 'Kế toán', title: 'Kế toán viên', email: 'thuha.ketoan@example.com', zaloUserId: null, manager: 'ktt', appEmail: 'ke-toan@local' },
  { key: 'kd', fullName: 'Nguyễn Minh Anh', department: 'Kinh doanh', title: 'Nhân viên kinh doanh', email: 'minhanh.kd@example.com', zaloUserId: null, manager: 'ktt' },
  { key: 'hc', fullName: 'Trần Quốc Bảo', department: 'Hành chính', title: 'Nhân viên hành chính', email: 'quocbao.hc@example.com', zaloUserId: null, manager: 'ktt' },
];

const row = (r: Record<string, unknown>): StaffMember => ({
  id: String(r.id), fullName: String(r.full_name), department: (r.department as string) ?? null, title: (r.title as string) ?? null,
  email: (r.email as string) ?? null, zaloUserId: (r.zalo_user_id as string) ?? null, appUserId: (r.app_user_id as string) ?? null,
  managerStaffId: (r.manager_staff_id as string) ?? null, active: Number(r.active) === 1,
});

/**
 * Nạp danh bạ (idempotent). Danh bạ thật của đội đặt qua biến môi trường TAX_REFEREE_STAFF_SEED (JSON mảng
 * {fullName, department, title, email, zaloUserId}) — chỉ tên biến nằm trong repo, giá trị đặt ở máy chạy.
 */
export function seedStaffDirectory(): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const userId = (email?: string) => email ? (db.prepare('SELECT id FROM users WHERE email=?').get(email) as { id: string } | undefined)?.id ?? null : null;
  const ids: Record<string, string> = {};
  const insert = db.prepare(`INSERT OR IGNORE INTO staff_directory (id,full_name,department,title,email,zalo_user_id,app_user_id,manager_staff_id,active,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)`);
  for (const s of DEMO_STAFF) {
    ids[s.key] = `STAFF-${s.key.toUpperCase()}`;
    insert.run(ids[s.key], s.fullName, s.department, s.title, s.email, s.zaloUserId, userId(s.appEmail), s.manager ? `STAFF-${s.manager.toUpperCase()}` : null, now);
  }
  const extra = process.env.TAX_REFEREE_STAFF_SEED;
  // Danh bạ thật của đội không được nạp vào phiên demo của người lạ (trừ khi chủ máy bật chế độ demo kênh thật).
  if (!extra || (isSandbox() && process.env.TAX_REFEREE_ALLOW_REAL_CHANNELS_IN_DEMO !== '1')) return;
  try {
    const list = JSON.parse(extra) as Array<Partial<StaffMember>>;
    for (const s of Array.isArray(list) ? list.slice(0, 200) : []) {
      if (!s.fullName || (!s.email && !s.zaloUserId)) continue;
      const id = `STAFF-${crypto.createHash('sha256').update(`${s.email ?? ''}|${s.zaloUserId ?? ''}`).digest('hex').slice(0, 12)}`;
      insert.run(id, s.fullName, s.department ?? null, s.title ?? null, s.email?.toLowerCase() ?? null, s.zaloUserId ?? null, null, ids.ktt ?? null, now);
    }
  } catch { /* cấu hình sai thì bỏ qua danh bạ bổ sung, không chặn khởi động */ }
}

export function listStaff(): StaffMember[] {
  return (getDatabase().prepare('SELECT * FROM staff_directory WHERE active=1 ORDER BY department, full_name').all() as Array<Record<string, unknown>>).map(row);
}

export function getStaff(id: string | null | undefined): StaffMember | null {
  if (!id) return null;
  const r = getDatabase().prepare('SELECT * FROM staff_directory WHERE id=?').get(id) as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}

/** Tên miền của địa chỉ email (chữ thường), hoặc '' nếu không hợp lệ. */
export const emailDomain = (address: string): string => (/^[^@\s]+@([^@\s]+)$/.exec(address.trim().toLowerCase())?.[1] ?? '');

/**
 * Email có qua xác thực của máy chủ nhận không: header Authentication-Results phải có dkim=pass hoặc spf=pass
 * cho đúng tên miền người gửi. Không có header (VD tệp .eml tự soạn) thì coi là CHƯA xác thực.
 */
export function emailAuthenticated(fromAddress: string, authenticationResults: string | undefined): boolean {
  const domain = emailDomain(fromAddress);
  if (!domain || !authenticationResults) return false;
  // Tách từng mệnh đề; tên miền lấy SAU dấu '@' CUỐI CÙNG rồi so khớp chính xác hoặc là miền con — chặn
  // "example.com.evil.net", "evilexample.com" và local-part giả "example.com@evil.net".
  const owns = (value: string | undefined): boolean => {
    if (!value) return false;
    const host = value.replace(/[<>"']/g, '').split('@').pop()!.trim().replace(/\.$/, '');
    return host === domain || host.endsWith(`.${domain}`);
  };
  // RFC 8601: bỏ quoted-string (local-part có ngoặc kép do người gửi đặt, có thể chứa "smtp.mailfrom=…" hay ';' giả) rồi bỏ
  // comment "(…)" lồng nhau TRƯỚC khi tách mệnh đề — chỉ đọc thuộc tính nằm ngoài comment. Địa chỉ có quoted-string thành "q"@miền-thật.
  let header = authenticationResults.toLowerCase().replace(/"(?:[^"\\]|\\.)*"/g, '"q"');
  for (let previous = ''; previous !== header;) { previous = header; header = header.replace(/\((?:[^()\\]|\\.)*\)/g, ' '); }
  for (const clause of header.split(';').map(c => c.trim())) {
    const prop = (name: string) => new RegExp(`(?:^|\\s)${name.replace('.', '\\.')}=([^\\s;]+)`).exec(clause)?.[1];
    if (/^dkim=pass\b/.test(clause) && owns(prop('header.d') ?? prop('header.i'))) return true;
    if (/^spf=pass\b/.test(clause) && owns(prop('smtp.mailfrom'))) return true;
  }
  return false;
}

/** Xác định người gửi: email (kèm kết quả xác thực) hoặc Zalo user id. */
export function identifySender(input: { email?: string; zaloUserId?: string; authenticationResults?: string }): SenderIdentity {
  const db = getDatabase();
  if (input.zaloUserId) {
    const r = db.prepare('SELECT * FROM staff_directory WHERE zalo_user_id=? AND active=1').get(input.zaloUserId) as Record<string, unknown> | undefined;
    const staff = r ? row(r) : null;
    return staff
      ? { staff, verified: true, label: `${staff.fullName} · ${staff.department ?? ''}`.trim(), reason: 'Zalo user id khớp danh bạ.' }
      : { staff: null, verified: false, label: 'Người gửi Zalo chưa có trong danh bạ', reason: 'Cần kế toán xác nhận người gửi trước khi xử lý.' };
  }
  const email = (input.email ?? '').trim().toLowerCase();
  if (!email) return { staff: null, verified: false, label: 'Không rõ người gửi', reason: 'Thiếu địa chỉ người gửi.' };
  const r = db.prepare('SELECT * FROM staff_directory WHERE lower(email)=? AND active=1').get(email) as Record<string, unknown> | undefined;
  const staff = r ? row(r) : null;
  const verified = emailAuthenticated(email, input.authenticationResults);
  if (staff && verified) return { staff, verified, label: `${staff.fullName} · ${staff.department ?? ''}`.trim(), reason: 'Email khớp danh bạ, qua xác thực SPF/DKIM.' };
  if (staff) return { staff: null, verified: false, label: `Mạo danh? ${email}`, reason: `Địa chỉ trùng nhân viên ${staff.fullName} nhưng email không qua xác thực SPF/DKIM — không gắn cho nhân viên.` };
  return { staff: null, verified, label: `Người gửi ngoài danh bạ: ${email}`, reason: 'Cần kế toán xác nhận người gửi trước khi xử lý.' };
}
