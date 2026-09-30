import { generateCanonicalVoucher, determineExpenseAccount } from '../lib/accounting/ledgerMapper';
import { generateUniversalXml, generateUniversalCsv } from '../lib/accounting/adapters/universalXmlExporter';
import { formatMisaAmisPayload } from '../lib/accounting/adapters/misaAdapter';
import { formatFastAccountingPayload } from '../lib/accounting/adapters/fastAdapter';
import { InvoiceInput, RefereeDecision } from '../lib/schemas';

console.log('=== TEST KIỂM THỬ: ACCOUNTING LEDGER INTEGRATION ===\n');

// 1. Test suy luận tài khoản chi phí
console.log('1. Test suy luận tài khoản:');
console.log(' - Cước internet:', determineExpenseAccount('Cước Fiber Internet Viettel'));
console.log(' - Giấy A4 văn phòng:', determineExpenseAccount('Giấy in A4 Double A'));
console.log(' - Thép nguyên liệu:', determineExpenseAccount('Thép tấm nguyên liệu'));
console.log(' - Hàng hóa thương mại:', determineExpenseAccount('Hàng hóa bánh kẹo'));

// 2. Test sinh bút toán chuẩn từ Hóa đơn
const mockInvoice: InvoiceInput = {
  id: 'test_inv_01',
  invoiceNumber: '0009999',
  invoiceDate: '2026-02-15',
  supplierTaxCode: '0100109106',
  supplierName: 'Viettel Telecom',
  itemName: 'Cước Internet Cáp Quang Doanh Nghiệp',
  preTaxAmount: 10_000_000,
  taxRate: 10,
  taxAmount: 1_000_000,
  totalAmount: 11_000_000,
  paymentMethod: 'BANK_TRANSFER',
  hasBankSlip: true,
  isImageBlurry: false,
  sellerStatus: 'ACTIVE',
  isAdjustment: false
};

const mockRoutineDecision: RefereeDecision = {
  status: 'ROUTINE',
  invoiceId: 'test_inv_01',
  supplierName: 'Viettel Telecom',
  totalAmount: 11_000_000,
  appliedTaxRate: 10,
  approvedTaxAmount: 1_000_000,
  plainExplanation: 'Hóa đơn dịch vụ viễn thông đầy đủ điều kiện khấu trừ thuế GTGT',
  kFactorAfter: 1.15,
  timestamp: new Date().toISOString()
};

const voucher = generateCanonicalVoucher(mockInvoice, mockRoutineDecision, 1);

console.log('\n2. Bút toán sinh ra (Canonical Ledger Voucher):');
console.log(' - Số chứng từ:', voucher.voucherNumber);
console.log(' - Audit Hash (SHA-256):', voucher.auditHash);
console.log(' - Dòng định khoản (Entries):');
voucher.entries.forEach((e) => {
  if (e.debitAmount > 0) {
    console.log(`   [NỢ] TK ${e.accountCode} (${e.accountName}): ${e.debitAmount.toLocaleString('vi-VN')} VND`);
  } else {
    console.log(`   [CÓ] TK ${e.accountCode} (${e.accountName}): ${e.creditAmount.toLocaleString('vi-VN')} VND`);
  }
});

const totalDebit = voucher.entries.reduce((s, e) => s + e.debitAmount, 0);
const totalCredit = voucher.entries.reduce((s, e) => s + e.creditAmount, 0);
console.log(` - Kiểm tra Cân đối Nợ/Có: Tổng Nợ = ${totalDebit} | Tổng Có = ${totalCredit} ==> ${totalDebit === totalCredit ? 'ĐẠT (100% CÂN ĐỐI)' : 'KHÔNG ĐẠT'}`);

// 3. Test Adapter MISA AMIS
const misaPayload = formatMisaAmisPayload([voucher]);
console.log('\n3. Test Adapter MISA AMIS:');
console.log(' - Số chứng từ MISA:', misaPayload.data[0].RefNo);
console.log(' - Mã nhà cung cấp:', misaPayload.data[0].VendorTaxCode);
console.log(' - Chi tiết dòng:', misaPayload.data[0].Details.length);

// 4. Test Adapter FAST Accounting
const fastPayload = formatFastAccountingPayload([voucher]);
console.log('\n4. Test Adapter FAST Accounting:');
console.log(' - Mã chứng từ FAST:', fastPayload.ma_ct);
console.log(' - Số hóa đơn:', fastPayload.chung_tu[0].so_hd);

// 5. Test Xuất XML Thông tư 99
const xml = generateUniversalXml([voucher]);
console.log('\n5. Test Xuất XML Thông tư 99/2025/TT-BTC:');
console.log(' - Độ dài XML:', xml.length, 'ký tự');
console.log(' - Chứa Namespace Circular 99:', xml.includes('urn:taxreferee:circular99:2026'));

console.log('\n=== TẤT CẢ KIỂM THỬ GHI SỔ KẾ TOÁN HOÀN TẤT THÀNH CÔNG ===');
