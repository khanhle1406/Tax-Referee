import { CanonicalLedgerVoucher } from '../types';

/** Escape giá trị trước khi chèn vào XML: số hóa đơn hay tên NCC chứa `</InvoiceNo>` hoặc `]]>` không chèn được phần tử giả vào tệp nạp phần mềm kế toán. */
export function xmlEscape(value: unknown): string {
  return String(value ?? '')
    // Ký tự cấm trong XML 1.0 (điều khiển, U+FFFE/FFFF, surrogate lẻ) làm phần mềm kế toán từ chối cả tệp.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string);
}

/** Một ô CSV an toàn: luôn bọc nháy kép, nhân đôi nháy kép bên trong (chống chèn cột), thêm ' trước công thức (= + - @). */
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
}

/**
 * Kết xuất tệp XML theo cấu trúc Thông tư 99/2025/TT-BTC chuẩn nạp vào phần mềm kế toán
 */
export function generateUniversalXml(vouchers: CanonicalLedgerVoucher[]): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<AccountingLedgerBatch xmlns="urn:taxreferee:circular99:2026" version="1.0">');
  lines.push(`  <Header>`);
  lines.push(`    <BatchDate>${new Date().toISOString()}</BatchDate>`);
  lines.push(`    <TotalVouchers>${vouchers.length}</TotalVouchers>`);
  lines.push(`    <SourceApp>Tax Referee - The Escalation Referee</SourceApp>`);
  lines.push(`    <Standard>ThongTu99/2025/TT-BTC</Standard>`);
  lines.push(`  </Header>`);
  lines.push('  <Vouchers>');

  for (const v of vouchers) {
    lines.push(`    <Voucher id="${xmlEscape(v.id)}">`);
    lines.push(`      <VoucherNo>${xmlEscape(v.voucherNumber)}</VoucherNo>`);
    lines.push(`      <VoucherDate>${xmlEscape(v.voucherDate)}</VoucherDate>`);
    lines.push(`      <InvoiceNo>${xmlEscape(v.invoiceRef)}</InvoiceNo>`);
    lines.push(`      <InvoiceDate>${xmlEscape(v.invoiceDate)}</InvoiceDate>`);
    lines.push(`      <VendorTaxCode>${xmlEscape(v.supplierTaxCode)}</VendorTaxCode>`);
    lines.push(`      <VendorName>${xmlEscape(v.supplierName)}</VendorName>`);
    lines.push(`      <TotalAmount>${xmlEscape(v.totalAmount)}</TotalAmount>`);
    lines.push(`      <ApprovedTaxAmount>${xmlEscape(v.approvedTaxAmount)}</ApprovedTaxAmount>`);
    lines.push(`      <AuditHash>${xmlEscape(v.auditHash)}</AuditHash>`);
    lines.push(`      <Entries>`);
    for (const e of v.entries) {
      lines.push(`        <Entry>`);
      lines.push(`          <AccountCode>${xmlEscape(e.accountCode)}</AccountCode>`);
      lines.push(`          <AccountName>${xmlEscape(e.accountName)}</AccountName>`);
      lines.push(`          <Debit>${xmlEscape(e.debitAmount)}</Debit>`);
      lines.push(`          <Credit>${xmlEscape(e.creditAmount)}</Credit>`);
      lines.push(`          <Memo>${xmlEscape(e.memo)}</Memo>`);
      lines.push(`        </Entry>`);
    }
    lines.push(`      </Entries>`);
    lines.push(`    </Voucher>`);
  }

  lines.push('  </Vouchers>');
  lines.push('</AccountingLedgerBatch>');

  return lines.join('\n');
}

/**
 * Kết xuất tệp CSV/Excel-compatible theo mẫu Bảng kê chứng từ ghi sổ
 */
export function generateUniversalCsv(vouchers: CanonicalLedgerVoucher[]): string {
  const headers = [
    'Số chứng từ',
    'Ngày chứng từ',
    'Số hóa đơn',
    'Ngày hóa đơn',
    'Mã số thuế',
    'Tên nhà cung cấp',
    'Diễn giải',
    'Tài khoản Nợ',
    'Tài khoản Có',
    'Số tiền (VND)',
    'Mã băm kiểm toán (SHA-256)'
  ];

  const rows: string[] = [headers.join(',')];

  for (const v of vouchers) {
    const debitEntries = v.entries.filter((e) => e.debitAmount > 0);
    const creditAccount = v.entries.find((e) => e.creditAmount > 0)?.accountCode || '331';

    for (const d of debitEntries) {
      const row = [
        csvCell(v.voucherNumber),
        csvCell(v.voucherDate),
        csvCell(v.invoiceRef),
        csvCell(v.invoiceDate),
        csvCell(v.supplierTaxCode),
        csvCell(v.supplierName),
        csvCell(d.memo),
        csvCell(d.accountCode),
        csvCell(creditAccount),
        Number(d.debitAmount) || 0,
        csvCell(v.auditHash)
      ];
      rows.push(row.join(','));
    }
  }

  return '\uFEFF' + rows.join('\r\n'); // Add BOM for Excel UTF-8 display
}
