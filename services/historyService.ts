/**
 * "Lịch sử của tôi": chỉ đọc bản ghi của CHÍNH người gọi — (a) thao tác người đó đã làm (audit_events.actor_id = user.id),
 * (b) hóa đơn người đó đã gửi (invoices.created_by_user_id = user.id). Không có tham số chọn người khác.
 */
import { getDatabase } from '@/lib/server/db';
import type { AppUser } from '@/lib/server/auth';
import { eventLabels, workflowStatusLabels } from '@/lib/workflowPresentation';

export interface HistoryAction {
  eventId: string; eventType: string; label: string; at: string; reason: string | null; resultingStatus: string | null; resultingStatusLabel: string | null;
  invoiceId: string | null; invoiceNumber: string | null; supplierName: string | null; totalAmount: number | null; taxAmount: number | null;
}
export interface HistorySubmission {
  invoiceId: string; invoiceNumber: string; supplierName: string; invoiceDate: string; totalAmount: number; taxAmount: number; approvedTax: number;
  status: string; statusLabel: string; taxHold: boolean; createdAt: string; updatedAt: string;
}
export interface MyHistory { actions: HistoryAction[]; submissions: HistorySubmission[]; totals: { actions: number; submissions: number }; limit: number }

/** Sự kiện phiên đăng nhập / kiểm thử bảo mật không phải thao tác nghiệp vụ. */
const NOISE = ['INTERNAL_LOGIN', 'ROLE_SWITCHED', 'PROBE_EVENT'];
/** Nhãn bổ sung cho sự kiện ngoài hồ sơ hóa đơn chưa có trong eventLabels. */
const EXTRA_LABELS: Record<string, string> = {
  POLICY_DRAFT_CREATED: 'Soạn bản nháp quy chế', SUPPLIER_MASTER_UPDATED: 'Cập nhật danh bạ nhà cung cấp',
  CAPTURE_SESSION_CREATED: 'Tạo phiên chụp chứng từ', CAPTURE_SESSION_UPLOADED: 'Tải ảnh chứng từ', CAPTURE_SESSION_CANCELLED: 'Hủy phiên chụp chứng từ',
};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown, max = 400): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function getMyHistory(user: AppUser, options: { limit?: number } = {}): MyHistory {
  const limit = Math.min(200, Math.max(1, Math.floor(Number(options.limit) || 50)));
  const db = getDatabase();
  const placeholders = NOISE.map(() => '?').join(',');

  const actionRows = db.prepare(`SELECT a.id, a.event_type, a.entity_id, a.created_at,
      json_extract(a.payload_json,'$.reason') reason, json_extract(a.payload_json,'$.rationale') rationale,
      COALESCE(json_extract(a.payload_json,'$.targetStatus'), json_extract(a.payload_json,'$.resultingStatus')) resulting_status,
      i.id invoice_id, i.invoice_number, json_extract(i.payload_json,'$.supplierName') supplier_name,
      json_extract(i.payload_json,'$.totalAmount') total_amount, json_extract(i.payload_json,'$.taxAmount') tax_amount
    FROM audit_events a LEFT JOIN invoices i ON i.id = a.entity_id
    WHERE a.actor_id = ? AND a.event_type NOT IN (${placeholders})
    ORDER BY a.rowid DESC LIMIT ?`).all(user.id, ...NOISE, limit) as Array<Record<string, unknown>>;
  const actions: HistoryAction[] = actionRows.map(r => {
    const type = String(r.event_type), status = text(r.resulting_status, 40);
    return {
      eventId: String(r.id), eventType: type, label: eventLabels[type] ?? EXTRA_LABELS[type] ?? type, at: String(r.created_at),
      reason: text(r.reason) ?? text(r.rationale), resultingStatus: status, resultingStatusLabel: status ? workflowStatusLabels[status] ?? status : null,
      invoiceId: r.invoice_id ? String(r.invoice_id) : null, invoiceNumber: r.invoice_number ? String(r.invoice_number) : null,
      supplierName: text(r.supplier_name, 200), totalAmount: num(r.total_amount), taxAmount: num(r.tax_amount),
    };
  });

  const submissionRows = db.prepare(`SELECT id, invoice_number, invoice_date, status, approved_deductible_tax, tax_hold, created_at, updated_at,
      json_extract(payload_json,'$.supplierName') supplier_name, json_extract(payload_json,'$.totalAmount') total_amount, json_extract(payload_json,'$.taxAmount') tax_amount
    FROM invoices WHERE created_by_user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(user.id, limit) as Array<Record<string, unknown>>;
  const submissions: HistorySubmission[] = submissionRows.map(r => ({
    invoiceId: String(r.id), invoiceNumber: String(r.invoice_number ?? ''), supplierName: String(r.supplier_name ?? ''), invoiceDate: String(r.invoice_date ?? ''),
    totalAmount: num(r.total_amount) ?? 0, taxAmount: num(r.tax_amount) ?? 0, approvedTax: num(r.approved_deductible_tax) ?? 0,
    status: String(r.status), statusLabel: workflowStatusLabels[String(r.status)] ?? String(r.status), taxHold: Number(r.tax_hold) === 1,
    createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  }));

  const totals = {
    actions: (db.prepare(`SELECT COUNT(*) n FROM audit_events WHERE actor_id = ? AND event_type NOT IN (${placeholders})`).get(user.id, ...NOISE) as { n: number }).n,
    submissions: (db.prepare('SELECT COUNT(*) n FROM invoices WHERE created_by_user_id = ?').get(user.id) as { n: number }).n,
  };
  return { actions, submissions, totals, limit };
}
