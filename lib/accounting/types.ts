import { z } from 'zod';

export const StandardAccountCodeEnum = z.enum([
  '1111', // Tiền mặt VND
  '1121', // Tiền gửi ngân hàng VND
  '1331', // Thuế GTGT đầu vào được khấu trừ
  '152',  // Nguyên liệu, vật liệu
  '153',  // Công cụ, dụng cụ
  '1561', // Hàng hóa
  '242',  // Chi phí trả trước
  '331',  // Phải trả cho người bán
  '641',  // Chi phí bán hàng
  '6422', // Chi phí vật liệu, đồ dùng văn phòng
  '6427', // Chi phí dịch vụ mua ngoài (điện, nước, viễn thông...)
  '6428', // Chi phí bằng tiền khác
  '811'   // Chi phí khác (không được trừ nếu vi phạm thuế)
]);
export type StandardAccountCode = z.infer<typeof StandardAccountCodeEnum>;

export interface AccountEntry {
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  memo: string;
}

export interface CanonicalLedgerVoucher {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  invoiceRef: string;
  invoiceDate: string;
  supplierTaxCode: string;
  supplierName: string;
  itemName: string;
  preTaxAmount: number;
  taxRate: number;
  taxAmount: number;
  approvedTaxAmount: number;
  totalAmount: number;
  paymentMethod: 'BANK_TRANSFER' | 'CASH';
  entries: AccountEntry[];
  auditHash: string;
  status: 'DRAFT' | 'READY_TO_POST' | 'POSTED_TO_GL';
  targetSystem?: string;
  postedAt?: string;
  referenceNotes: string;
}

export type TargetAccountingSystem =
  | 'MISA_AMIS'
  | 'FAST_ACCOUNTING'
  | 'SAP_ERP'
  | 'UNIVERSAL_XML'
  | 'UNIVERSAL_EXCEL';

export interface LedgerSyncRequest {
  voucherIds?: string[];
  targetSystem: TargetAccountingSystem;
  regime?: 'CIRCULAR_99_200' | 'CIRCULAR_133';
  autoCommit?: boolean;
}

export interface LedgerSyncResult {
  success: boolean;
  targetSystem: TargetAccountingSystem;
  syncedCount: number;
  totalDebit: number;
  totalCredit: number;
  batchReference: string;
  timestamp: string;
  vouchers: CanonicalLedgerVoucher[];
  exportedData?: string; // XML or Base64 or JSON
  downloadUrl?: string;
  errors?: string[];
}
