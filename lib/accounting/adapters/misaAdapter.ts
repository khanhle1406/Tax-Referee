import { CanonicalLedgerVoucher } from '../types';

/**
 * Adapter chuyển đổi sang chuẩn MISA AMIS Open API (Purchase Voucher API)
 */
export function formatMisaAmisPayload(vouchers: CanonicalLedgerVoucher[]) {
  return {
    appId: 'TAX_REFEREE_CONNECTOR',
    version: '2026.1',
    data: vouchers.map((v) => ({
      RefType: 24, // 24 = Chứng từ mua hàng dịch vụ/vật tư
      RefNo: v.voucherNumber,
      RefDate: v.voucherDate,
      PostedDate: v.voucherDate,
      InvNo: v.invoiceRef,
      InvDate: v.invoiceDate,
      VendorTaxCode: v.supplierTaxCode,
      VendorName: v.supplierName,
      Reason: `Hạch toán hóa đơn ${v.invoiceRef} - ${v.supplierName}`,
      TotalAmount: v.totalAmount,
      TotalTaxAmount: v.approvedTaxAmount,
      AuditHash: v.auditHash,
      Details: v.entries
        .filter((e) => e.debitAmount > 0)
        .map((e, idx) => ({
          LineNumber: idx + 1,
          DebitAccount: e.accountCode,
          CreditAccount: v.entries.find((c) => c.creditAmount > 0)?.accountCode || '331',
          Amount: e.debitAmount,
          Description: e.memo
        }))
    }))
  };
}
