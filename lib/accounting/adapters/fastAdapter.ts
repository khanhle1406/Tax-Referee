import { CanonicalLedgerVoucher } from '../types';

/**
 * Adapter chuyển đổi sang định dạng bảng kê nhập khẩu FAST Accounting (FAST Online Web API)
 */
export function formatFastAccountingPayload(vouchers: CanonicalLedgerVoucher[]) {
  return {
    system: 'FAST_ONLINE_2026',
    ma_ct: 'PNA', // Phiếu nhập mua / Chứng từ dịch vụ
    ngay_ct: new Date().toISOString().slice(0, 10),
    chung_tu: vouchers.map((v) => ({
      so_ct: v.voucherNumber,
      ngay_lct: v.voucherDate,
      so_hd: v.invoiceRef,
      ngay_hd: v.invoiceDate,
      ma_so_thue: v.supplierTaxCode,
      ten_kh: v.supplierName,
      dien_giai: `TaxReferee ghi sổ HĐ ${v.invoiceRef}`,
      t_tien: v.preTaxAmount,
      t_thue: v.approvedTaxAmount,
      t_tt: v.totalAmount,
      ma_hash: v.auditHash,
      hach_toan: v.entries
        .filter((e) => e.debitAmount > 0)
        .map((e) => ({
          tk_no: e.accountCode,
          tk_co: v.entries.find((c) => c.creditAmount > 0)?.accountCode || '331',
          tien: e.debitAmount,
          dien_giai_ct: e.memo
        }))
    }))
  };
}
