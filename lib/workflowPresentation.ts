import type { InvoiceInput, RiskGroup } from './schemas';

export const riskGroupLabels: Record<RiskGroup, string> = {
  UNCERTAIN_INFO: 'Chưa rõ thông tin',
  OUT_OF_POLICY: 'Ngoài quy định',
  EXCEED_AUTHORITY: 'Vượt thẩm quyền'
};
export const roleLabels: Record<string, string> = {
  ACCOUNTANT: 'Kế toán viên', CHIEF_ACCOUNTANT: 'Kế toán trưởng', CFO: 'CFO', SYSTEM_REFEREE: 'Hệ thống'
};
export const workflowStatusLabels: Record<string, string> = {
  RECEIVED: 'Mới nhận', EVALUATING: 'Đang đánh giá', APPROVED: 'Đã hoàn tất',
  WAITING_CHIEF_ACCOUNTANT: 'Chờ Kế toán trưởng', WAITING_CFO: 'Chờ CFO',
  FORWARDED: 'Đã chuyển CFO', PAUSED: 'Đã dừng xử lý', ON_HOLD: 'Chờ bổ sung / đánh giá lại',
  REJECTED: 'Đã từ chối', NEEDS_CONFIRMATION: 'Cần xác minh', ROUTINE_PROPOSED: 'Đề xuất thường quy'
};
export const eventLabels: Record<string, string> = {
  BATCH_CREATED: 'Tạo lô hóa đơn', BATCH_SIGNED_OFF: 'Chốt lô (ký trước khi ghi sổ)', INVOICE_POSTED_BY_BATCH: 'Ghi sổ theo lô đã chốt',
  BATCH_GROUP_ANSWERED: 'Trả lời chung một nhóm hóa đơn', CHANNEL_PULLED: 'Lấy hóa đơn từ Gmail/Zalo', CHANNEL_SENDER_ASSIGNED: 'Xác nhận người gửi',
  BATCH_ITEM_ATTACHED: 'Gắn hóa đơn vào lô', BATCH_SUPPLEMENT_SIGNED_OFF: 'Chốt bổ sung lô (ghi sổ hóa đơn duyệt sau)', CHANNEL_FILE_INGESTED: 'Nhận file qua Gmail/Zalo',
  STAFF_ADDED: 'Thêm người vào danh bạ người gửi',
  EVALUATION_STARTED: 'Bắt đầu đánh giá', INVOICE_EVALUATED: 'Chuyển tiếp để con người xử lý',
  ROUTINE_AUTO_APPROVED: 'Tự xử lý thường quy', EVALUATION_FAILED: 'Đánh giá chưa hoàn tất',
  EVALUATION_RECOVERED: 'Phục hồi tác vụ bị gián đoạn', HUMAN_RESOLUTION_RECORDED: 'Ghi nhận quyết định con người',
  OVERRIDE: 'Ghi đè có thẩm quyền', INVOICE_HUMAN_OVERRIDE: 'Ghi đè có thẩm quyền',
  PAUSE: 'Dừng xử lý', RESUME: 'Tiếp tục và chờ đánh giá lại', TAX_HOLD: 'Tạm giữ thuế',
  RELEASE_TAX_HOLD: 'Giải phóng giữ thuế', REQUEST_INFORMATION: 'Yêu cầu bổ sung',
  INVOICE_ACTION_REVERTED: 'Hoàn tác', BANK_EVIDENCE_RECORDED: 'Bổ sung bằng chứng ngân hàng',
  THRESHOLD_ADAPTED: 'Điều chỉnh ngưỡng nội bộ', THRESHOLD_ROLLED_BACK: 'Phục hồi ngưỡng trước',
  POLICY_PUBLISHED: 'Ban hành phiên bản quy chế', POLICY_ROLLED_BACK: 'Phục hồi quy chế',
  HANDOFF_ANSWERED: 'Trả lời câu hỏi chuyển tiếp', POST_AUDIT_SAMPLED: 'Được chọn hậu kiểm ngẫu nhiên', LINKED_CASH_HOLD: 'Giữ thuế do cụm tiền mặt cùng ngày vượt ngưỡng', POST_AUDIT_REVIEWED: 'Kết quả hậu kiểm', AUTOMATION_PAUSED: 'Dừng tự động hóa toàn hệ thống', AUTOMATION_RESUMED: 'Bật lại tự động hóa',
  ROUTINE_HELD_AUTOMATION_PAUSED: 'Giữ ca thường quy chờ duyệt tay (tự động hóa đang dừng)', ROUTINE_HELD_AUTHORITY_FLOOR: 'Giữ chờ CFO: thẩm quyền không hạ theo số tiền mới', ROUTINE_RECHECK_FAILED_AFTER_RESUME: 'Bật lại tự động hóa: kiểm lại không còn thường quy, giữ chờ KTT', ROUTINE_RELEASED_AFTER_RESUME: 'Hoàn tất ca thường quy sau khi bật lại tự động hóa',
  SANDBOX_RESET: 'Xóa dữ liệu demo', THRESHOLD_CANDIDATE_REJECTED: 'Bác ngưỡng đề xuất (không đạt kiểm chứng)', INTERNAL_LOGIN: 'Đăng nhập nội bộ', ROLE_SWITCHED: 'Đổi vai trò mô phỏng'
};

export type ReviewField = {
  key: keyof InvoiceInput; label: string; type: 'text' | 'date' | 'number' | 'select';
  options?: Array<{ value: string; label: string }>; required?: boolean;
};
export const reviewFields: ReviewField[] = [
  { key: 'invoiceNumber', label: 'Số hóa đơn', type: 'text', required: true },
  { key: 'invoiceDate', label: 'Ngày lập', type: 'date', required: true },
  { key: 'supplierTaxCode', label: 'MST bên bán', type: 'text', required: true },
  { key: 'supplierName', label: 'Tên bên bán', type: 'text', required: true },
  { key: 'buyerTaxCode', label: 'MST người mua', type: 'text' },
  { key: 'itemName', label: 'Nội dung hàng hóa / dịch vụ', type: 'text', required: true },
  { key: 'preTaxAmount', label: 'Tiền trước thuế', type: 'number', required: true },
  { key: 'taxRate', label: 'Thuế suất (%)', type: 'select', required: true, options: [0,5,8,10].map(n => ({ value: String(n), label: `${n}%` })) },
  { key: 'taxAmount', label: 'Tiền thuế', type: 'number', required: true },
  { key: 'totalAmount', label: 'Tổng thanh toán', type: 'number', required: true },
  { key: 'paymentMethod', label: 'Hình thức thanh toán', type: 'select', options: [{ value: 'CASH', label: 'Tiền mặt' }, { value: 'BANK_TRANSFER', label: 'Chuyển khoản' }] },
  { key: 'hasBankSlip', label: 'Có chứng từ ngân hàng', type: 'select', options: [{ value: 'true', label: 'Có' }, { value: 'false', label: 'Chưa có' }] },
  { key: 'hasItemManifest', label: 'Có bảng kê hàng hóa', type: 'select', options: [{ value: 'true', label: 'Có' }, { value: 'false', label: 'Chưa có' }] },
  { key: 'sellerStatus', label: 'Trạng thái bên bán', type: 'select', options: [{ value: 'ACTIVE', label: 'Đang hoạt động' }, { value: 'SUSPENDED', label: 'Tạm ngừng' }, { value: 'CLOSED', label: 'Đã đóng MST' }, { value: 'UNKNOWN', label: 'Chưa xác minh' }] },
  { key: 'sellerSuspensionDate', label: 'Ngày ngừng / đóng MST', type: 'date' },
  { key: 'invoiceSeries', label: 'Ký hiệu hóa đơn', type: 'text' },
  { key: 'taxAuthorityCode', label: 'Mã cơ quan thuế', type: 'text' },
  { key: 'signingDate', label: 'Ngày ký', type: 'date' },
  { key: 'originalInvoiceRef', label: 'Tham chiếu hóa đơn gốc', type: 'text' },
  { key: 'isImageBlurry', label: 'Nguồn ảnh bị mờ', type: 'select', options: [{ value: 'true', label: 'Còn mờ / chưa xác minh' }, { value: 'false', label: 'Đã có nguồn rõ' }] }
];
export const fieldLabels: Record<string, string> = Object.fromEntries(reviewFields.map(f => [f.key, f.label]));

export function displayFieldValue(field: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Chưa xác định';
  const option = reviewFields.find(f => f.key === field)?.options?.find(o => o.value === String(value));
  if (option) return option.label;
  if (typeof value === 'number') return new Intl.NumberFormat('vi-VN').format(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** One fixed deadline; an overdue case never starts a new 24-hour cycle. */
export function caseDeadline(startedAt: string, now = Date.now(), hours = 24) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return null;
  const deadline = start + hours * 3_600_000;
  return { deadline, overdue: now >= deadline, hours: Math.ceil(Math.abs(deadline - now) / 3_600_000) };
}
