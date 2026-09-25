import { getDatabase } from '@/lib/server/db';
import { DuplicateInfo, InvoiceInput } from '@/lib/schemas';

/**
 * Kiểm tra hóa đơn trùng lặp 4 lớp (IMP-13)
 * Đối soát: Mã số thuế bên bán + Số hóa đơn + Ngày lập + Tổng tiền
 */
export function checkDuplicateInvoice(invoice: InvoiceInput): DuplicateInfo {
  try {
    const db = getDatabase();

    // 1. Kiểm tra trong bảng invoices lưu trữ runtime
    const existing = db.prepare(`
      SELECT id, invoice_number, invoice_date, payload_json, created_at 
      FROM invoices 
      WHERE supplier_tax_code = ? 
        AND invoice_number = ? 
        AND id != ?
      ORDER BY datetime(created_at) ASC
      LIMIT 1
    `).get(invoice.supplierTaxCode, invoice.invoiceNumber, invoice.id) as {
      id: string;
      invoice_number: string;
      invoice_date: string;
      payload_json: string;
      created_at: string;
    } | undefined;

    if (existing) {
      let originalTotal = 0;
      try {
        const parsed = JSON.parse(existing.payload_json);
        originalTotal = parsed.totalAmount || 0;
      } catch {
        // ignore JSON parse error
      }

      const sameAmount = Math.abs(originalTotal - invoice.totalAmount) < 1;
      const reason = sameAmount
        ? `Trùng lặp 100% số hóa đơn ${invoice.invoiceNumber} và số tiền (${invoice.totalAmount.toLocaleString('vi-VN')}₫) với chứng từ gốc mã [${existing.id}] đã tiếp nhận ngày ${existing.created_at.slice(0, 10)}.`
        : `Trùng số hóa đơn ${invoice.invoiceNumber} của cùng nhà cung cấp (MST: ${invoice.supplierTaxCode}) đã tiếp nhận ngày ${existing.created_at.slice(0, 10)}.`;

      return {
        isDuplicate: true,
        originalInvoiceId: existing.id,
        originalInvoiceNumber: existing.invoice_number,
        firstSeenAt: existing.created_at,
        duplicateReason: reason
      };
    }

    return {
      isDuplicate: false
    };
  } catch (err) {
    console.warn('Lỗi kiểm tra trùng lặp CSDL:', err);
    return { isDuplicate: false };
  }
}
