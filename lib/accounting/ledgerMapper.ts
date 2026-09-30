import crypto from 'node:crypto';
import { InvoiceInput, RefereeDecision } from '../schemas';
import { CanonicalLedgerVoucher, AccountEntry } from './types';

export type AccountingRegime = 'CIRCULAR_99_200' | 'CIRCULAR_133';

/**
 * Suy luận mã tài khoản chi phí / tài sản theo chuẩn Thông tư 99/2025 (TT 200) hoặc Thông tư 133
 */
export function determineExpenseAccount(
  itemName: string,
  regime: AccountingRegime = 'CIRCULAR_99_200'
): { code: string; name: string } {
  const normalized = itemName.toLowerCase();

  // Đối với Doanh nghiệp SME áp dụng Thông tư 133/2016/TT-BTC:
  // Không có TK 6427, 6428 -> tất cả chi phí quản lý đưa vào TK 6422
  if (regime === 'CIRCULAR_133') {
    if (
      normalized.includes('nguyên liệu') ||
      normalized.includes('vật tư') ||
      normalized.includes('vải') ||
      normalized.includes('thép')
    ) {
      return { code: '152', name: 'Nguyên liệu, vật liệu' };
    }
    if (normalized.includes('hàng hóa') || normalized.includes('sản phẩm')) {
      return { code: '156', name: 'Hàng hóa' };
    }
    if (normalized.includes('bán hàng') || normalized.includes('vận chuyển hàng bán')) {
      return { code: '6421', name: 'Chi phí bán hàng (TT 133)' };
    }
    return { code: '6422', name: 'Chi phí quản lý doanh nghiệp (TT 133)' };
  }

  // Đối với Doanh nghiệp lớn áp dụng Thông tư 99/2025/TT-BTC & Thông tư 200/2014/TT-BTC
  if (
    normalized.includes('điện') ||
    normalized.includes('nước') ||
    normalized.includes('internet') ||
    normalized.includes('viễn thông') ||
    normalized.includes('cước') ||
    normalized.includes('phần mềm') ||
    normalized.includes('hosting') ||
    normalized.includes('thuê')
  ) {
    return { code: '6427', name: 'Chi phí dịch vụ mua ngoài' };
  }

  if (
    normalized.includes('văn phòng phẩm') ||
    normalized.includes('giấy') ||
    normalized.includes('mực') ||
    normalized.includes('bút') ||
    normalized.includes('vpp')
  ) {
    return { code: '6422', name: 'Chi phí vật liệu, đồ dùng văn phòng' };
  }

  if (
    normalized.includes('nguyên liệu') ||
    normalized.includes('vật tư') ||
    normalized.includes('linh kiện') ||
    normalized.includes('vải') ||
    normalized.includes('thép') ||
    normalized.includes('hạt nhựa')
  ) {
    return { code: '152', name: 'Nguyên liệu, vật liệu' };
  }

  if (
    normalized.includes('công cụ') ||
    normalized.includes('dụng cụ') ||
    normalized.includes('máy in') ||
    normalized.includes('bàn ghế')
  ) {
    return { code: '153', name: 'Công cụ, dụng cụ' };
  }

  if (
    normalized.includes('hàng hóa') ||
    normalized.includes('sản phẩm') ||
    normalized.includes('thực phẩm') ||
    normalized.includes('thiết bị')
  ) {
    return { code: '1561', name: 'Hàng hóa kho' };
  }

  return { code: '6428', name: 'Chi phí bằng tiền khác' };
}

/**
 * Chuyển đổi Hóa đơn và Phán quyết Tax Referee thành Bút toán Kế toán chuẩn tắc (Canonical Ledger Voucher)
 */
export function generateCanonicalVoucher(
  invoice: InvoiceInput,
  decision?: RefereeDecision | null,
  voucherIndex = 1,
  regime: AccountingRegime = 'CIRCULAR_99_200'
): CanonicalLedgerVoucher {
  const padIndex = String(voucherIndex).padStart(5, '0');
  const voucherNumber = `PKT-${invoice.invoiceDate.slice(0, 4)}${invoice.invoiceDate.slice(5, 7)}-${padIndex}`;

  const approvedTax =
    decision && decision.status === 'ROUTINE'
      ? decision.approvedTaxAmount
      : invoice.taxAmount !== 0 && invoice.paymentMethod !== 'CASH' && invoice.hasBankSlip !== false
      ? invoice.taxAmount
      : 0;

  const expenseAccount = determineExpenseAccount(invoice.itemName, regime);
  const entries: AccountEntry[] = [];

  // Bảo đảm cân đối số học tuyệt đối: Tổng Nợ = Tổng Có = totalAmount
  const roundingDiff = invoice.totalAmount - (invoice.preTaxAmount + invoice.taxAmount);
  const adjustedPreTax = invoice.preTaxAmount + roundingDiff;

  // Dòng 1: Ghi Nợ Tài khoản Chi phí / Hàng hóa (Pre-tax)
  entries.push({
    accountCode: expenseAccount.code,
    accountName: expenseAccount.name,
    debitAmount: adjustedPreTax,
    creditAmount: 0,
    memo: `Chi phí mua ${invoice.itemName} theo HĐ số ${invoice.invoiceNumber}`
  });

  // Dòng 2: Ghi Nợ Thuế GTGT được khấu trừ (TK 1331) nếu đủ điều kiện
  if (approvedTax !== 0) {
    entries.push({
      accountCode: '1331',
      accountName: 'Thuế GTGT đầu vào được khấu trừ',
      debitAmount: approvedTax,
      creditAmount: 0,
      memo: `Thuế GTGT đầu vào (${invoice.taxRate}%) theo HĐ số ${invoice.invoiceNumber}`
    });
  }

  // Dòng 2.1: Nếu có thuế GTGT nhưng bị loại khỏi khấu trừ (do vi phạm thanh toán tiền mặt hoặc thuế sai)
  const rejectedTax = invoice.taxAmount - approvedTax;
  if (rejectedTax !== 0) {
    entries.push({
      accountCode: '811',
      accountName: 'Chi phí khác (Thuế GTGT không được khấu trừ)',
      debitAmount: rejectedTax,
      creditAmount: 0,
      memo: `Thuế GTGT không đủ điều kiện khấu trừ theo Luật Thuế GTGT 48/2024/QH15`
    });
  }

  // Dòng 3: Ghi Có Tài khoản Thanh toán (TK 331 - Phải trả người bán hoặc TK 1121 / 1111)
  const creditAccountCode = invoice.paymentMethod === 'CASH' ? '1111' : '331';
  const creditAccountName =
    creditAccountCode === '1111' ? 'Tiền mặt tại quỹ' : `Phải trả ${invoice.supplierName}`;

  entries.push({
    accountCode: creditAccountCode,
    accountName: creditAccountName,
    debitAmount: 0,
    creditAmount: invoice.totalAmount,
    memo: `Phải trả bên bán theo HĐ số ${invoice.invoiceNumber}`
  });

  // Tạo mã băm kiểm toán SHA-256 bất biến
  const auditString = `${voucherNumber}|${invoice.id}|${invoice.invoiceNumber}|${invoice.totalAmount}|${approvedTax}|${invoice.invoiceDate}`;
  const auditHash = crypto.createHash('sha256').update(auditString).digest('hex');

  return {
    id: `vch_${invoice.id}`,
    voucherNumber,
    voucherDate: invoice.invoiceDate,
    invoiceRef: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    supplierTaxCode: invoice.supplierTaxCode,
    supplierName: invoice.supplierName,
    itemName: invoice.itemName,
    preTaxAmount: invoice.preTaxAmount,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    approvedTaxAmount: approvedTax,
    totalAmount: invoice.totalAmount,
    paymentMethod: invoice.paymentMethod || 'BANK_TRANSFER',
    entries,
    auditHash,
    status: 'READY_TO_POST',
    referenceNotes: `TaxReferee-Verified [SHA256:${auditHash.slice(0, 12)}...]`
  };
}
