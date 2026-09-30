import { CanonicalLedgerVoucher } from '../types';

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
    lines.push(`    <Voucher id="${v.id}">`);
    lines.push(`      <VoucherNo>${v.voucherNumber}</VoucherNo>`);
    lines.push(`      <VoucherDate>${v.voucherDate}</VoucherDate>`);
    lines.push(`      <InvoiceNo>${v.invoiceRef}</InvoiceNo>`);
    lines.push(`      <InvoiceDate>${v.invoiceDate}</InvoiceDate>`);
    lines.push(`      <VendorTaxCode>${v.supplierTaxCode}</VendorTaxCode>`);
    lines.push(`      <VendorName><![CDATA[${v.supplierName}]]></VendorName>`);
    lines.push(`      <TotalAmount>${v.totalAmount}</TotalAmount>`);
    lines.push(`      <ApprovedTaxAmount>${v.approvedTaxAmount}</ApprovedTaxAmount>`);
    lines.push(`      <AuditHash>${v.auditHash}</AuditHash>`);
    lines.push(`      <Entries>`);
    for (const e of v.entries) {
      lines.push(`        <Entry>`);
      lines.push(`          <AccountCode>${e.accountCode}</AccountCode>`);
      lines.push(`          <AccountName><![CDATA[${e.accountName}]]></AccountName>`);
      lines.push(`          <Debit>${e.debitAmount}</Debit>`);
      lines.push(`          <Credit>${e.creditAmount}</Credit>`);
      lines.push(`          <Memo><![CDATA[${e.memo}]]></Memo>`);
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
        `"${v.voucherNumber}"`,
        `"${v.voucherDate}"`,
        `"${v.invoiceRef}"`,
        `"${v.invoiceDate}"`,
        `"${v.supplierTaxCode}"`,
        `"${v.supplierName.replace(/"/g, '""')}"`,
        `"${d.memo.replace(/"/g, '""')}"`,
        `"${d.accountCode}"`,
        `"${creditAccount}"`,
        d.debitAmount,
        `"${v.auditHash}"`
      ];
      rows.push(row.join(','));
    }
  }

  return '\uFEFF' + rows.join('\r\n'); // Add BOM for Excel UTF-8 display
}
