import { seedStaffDirectory } from './staffDirectory';
import { getDatabase } from '@/lib/server/db';
import type { AppUser, AppRole } from '@/lib/server/auth';
import type { RefereeDecision } from '@/lib/schemas';
import { evaluateWorkflow, readRecord } from './workflowService';
import { samplePostAudit } from './postAuditService';

// MST riêng cho dữ liệu nạp sẵn (số kiểm tra hợp lệ): ca giám khảo chép từ /verify (MST 0312345678) không bị gộp nhầm vào cụm cùng ngày với dữ liệu mẫu.
const SAMPLE_SUPPLIER = { supplierTaxCode: '0319876546', supplierName: 'Công ty TNHH Dịch vụ Minh An (dữ liệu mẫu)' };
const sample = (invoiceNumber: string, fields: Record<string, unknown>) => ({
  id: `MAU-${invoiceNumber}`, invoiceNumber, invoiceDate: '2026-10-05', ...SAMPLE_SUPPLIER, ...fields
});

/** Bốn ca mẫu tổng hợp: một ca tự xử lý và một ca cho mỗi kiểu dừng (ca vượt quyền có 2 ý để thấy cách trả lời "1A, 2A"). */
export const DEMO_SAMPLE_CASES = [
  sample('0009001', { itemName: 'Phí chuyển phát tài liệu tháng 9', preTaxAmount: 2_000_000, taxRate: 10, taxAmount: 200_000, totalAmount: 2_200_000, paymentMethod: 'BANK_TRANSFER' }),
  sample('0009002', { itemName: 'Bộ lưu điện UPS 3kVA', preTaxAmount: 11_000_000, taxRate: 10, taxAmount: 1_100_000, totalAmount: 12_100_000 }),
  sample('0009003', { itemName: 'Tiếp khách đối tác - rượu vang', preTaxAmount: 3_000_000, taxRate: 10, taxAmount: 300_000, totalAmount: 3_300_000, paymentMethod: 'BANK_TRANSFER', hasBankSlip: true }),
  sample('0009004', { itemName: '10 laptop Dell Latitude', preTaxAmount: 300_000_000, taxRate: 10, taxAmount: 30_000_000, totalAmount: 330_000_000, paymentMethod: 'BANK_TRANSFER', hasBankSlip: true })
];

/**
 * Phiên demo mới có sẵn ca mẫu để giám khảo mở ngay thay vì hộp trống. Ca do tài khoản Kế toán viên của phiên nhập,
 * nên KTT/CFO (tài khoản khác) trả lời được mà không vướng luật "không tự duyệt". Chỉ chạy khi database chưa có hóa đơn.
 */
export async function seedDemoCases(): Promise<RefereeDecision[]> {
  const db = getDatabase();
  seedStaffDirectory();
  if ((db.prepare('SELECT COUNT(*) n FROM invoices').get() as { n: number }).n > 0) return [];
  const row = db.prepare("SELECT id, email, display_name, role FROM users WHERE role = 'ACCOUNTANT' LIMIT 1").get() as { id: string; email: string; display_name: string; role: AppRole } | undefined;
  if (!row) return [];
  const accountant: AppUser = { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
  const decisions: RefereeDecision[] = [];
  for (const invoice of DEMO_SAMPLE_CASES) decisions.push((await evaluateWorkflow(invoice, accountant, { forceLocalOnly: true })).decision as RefereeDecision);
  // Ca thường quy mẫu luôn được đưa vào hậu kiểm để thấy luồng "máy tự duyệt → người xem lại".
  const routine = readRecord('MAU-0009001');
  if (routine.status === 'APPROVED') samplePostAudit({ id: routine.id, content_hash: routine.content_hash, evaluation_id: routine.evaluation_id }, 0.1, true);
  return decisions;
}
