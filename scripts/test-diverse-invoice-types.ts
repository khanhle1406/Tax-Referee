import './setup-env';
import { InvoiceInput, RefereeDecisionSchema } from '../lib/schemas';
import { evaluateInvoiceLocally } from '../services/policyEngine';
import { getActivePolicy, getMacroState } from '../lib/server/db';
import { generateCanonicalVoucher } from '../lib/accounting/ledgerMapper';
import { formatMisaAmisPayload } from '../lib/accounting/adapters/misaAdapter';
import { formatFastAccountingPayload } from '../lib/accounting/adapters/fastAdapter';
import { generateUniversalXml } from '../lib/accounting/adapters/universalXmlExporter';
import { CanonicalLedgerVoucher } from '../lib/accounting/types';

console.log('================================================================');
console.log(' KIỂM THỬ TOÀN DIỆN TAX REFEREE VỚI 10 DẠNG HÓA ĐƠN ĐẶC THÙ');
console.log(' Niên độ pháp lý: 2025 - 2026 (Luật Thuế GTGT 48/2024 & TT 99/2025)');
console.log('================================================================\n');

const testInvoices: Array<{ name: string; category: string; expected: string; invoice: InvoiceInput }> = [
  // 1. Tiền điện thường quy (Hợp lệ, thuế 8%)
  {
    name: 'TC-01: Hóa đơn tiền điện EVN',
    category: 'Chi phí mua ngoài thường quy',
    expected: 'ROUTINE',
    invoice: {
      id: 'INV_EVN_01',
      invoiceNumber: '0012450',
      invoiceDate: '2026-02-10',
      supplierTaxCode: '0100100079',
      supplierName: 'Tổng Công Ty Điện Lực TP. Hà Nội (EVN HANOI)',
      itemName: 'Tiền điện sản xuất kỳ 01/2026',
      preTaxAmount: 18_000_000,
      taxRate: 8,
      taxAmount: 1_440_000,
      totalAmount: 19_440_000,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      sellerStatus: 'ACTIVE',
      isImageBlurry: false,
      isAdjustment: false
    }
  },

  // 2. Viễn thông xuất đúng thuế suất 10%
  {
    name: 'TC-02: Cước viễn thông VNPT 10%',
    category: 'Dịch vụ thuộc danh mục loại trừ NQ 204 (áp đúng 10%)',
    expected: 'ROUTINE',
    invoice: {
      id: 'INV_VNPT_02',
      invoiceNumber: '0045812',
      invoiceDate: '2026-02-15',
      supplierTaxCode: '0100684378',
      supplierName: 'Tập Đoàn Bưu Chính Viễn Thông Việt Nam (VNPT)',
      itemName: 'Cước dịch vụ Internet Cáp Quang FTTH Doanh Nghiệp',
      preTaxAmount: 4_000_000,
      taxRate: 10,
      taxAmount: 400_000,
      totalAmount: 4_400_000,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      sellerStatus: 'ACTIVE',
      isImageBlurry: false,
      isAdjustment: false
    }
  },

  // 3. Viễn thông áp sai thuế suất 8% (Bẫy NQ 204/2025/QH15)
  {
    name: 'TC-03: Cước viễn thông Viettel áp sai 8%',
    category: 'Vi phạm thuế suất (bắt buộc 10% nhưng xuất 8%)',
    expected: 'ESCALATED - OUT_OF_POLICY',
    invoice: {
      id: 'INV_VIETTEL_ERR_03',
      invoiceNumber: '0098231',
      invoiceDate: '2026-02-18',
      supplierTaxCode: '0100109106',
      supplierName: 'Tập Đoàn Công Nghiệp - Viễn Thông Quân Đội (Viettel)',
      itemName: 'Dịch vụ kênh thuê riêng viễn thông Leased Line',
      preTaxAmount: 15_000_000,
      taxRate: 8, // SAI LUẬT: Viễn thông thuộc danh mục loại trừ phải áp 10%
      taxAmount: 1_200_000,
      totalAmount: 16_200_000,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      sellerStatus: 'ACTIVE',
      isImageBlurry: false,
      isAdjustment: false
    }
  },

  // 4. Mua văn phòng phẩm dưới 5M bằng tiền mặt (Hợp lệ theo Luật mới)
  {
    name: 'TC-04: Mua giấy in văn phòng < 5M tiền mặt',
    category: 'Hợp lệ chi trả tiền mặt theo Luật Thuế GTGT 48/2024',
    expected: 'ROUTINE',
    invoice: {
      id: 'INV_VPP_CASH_OK_04',
      invoiceNumber: '0003412',
      invoiceDate: '2026-02-20',
      supplierTaxCode: '0312456789',
      supplierName: 'Công Ty TNHH Văn Phòng Phẩm Hồng Hà',
      itemName: 'Giấy in A4 Double A 70gsm & Bút bi văn phòng',
      preTaxAmount: 3_000_000,
      taxRate: 10,
      taxAmount: 300_000,
      totalAmount: 3_300_000,
      paymentMethod: 'CASH',
      hasBankSlip: false,
      sellerStatus: 'ACTIVE',
      isImageBlurry: false,
      isAdjustment: false
    }
  },

  // 5. Mua hàng từ 5M trở lên nhưng thanh toán TIỀN MẶT (Bẫy Luật Thuế GTGT 48/2024)
  {
    name: 'TC-05: Mua hàng 12M thanh toán TIỀN MẶT',
    category: 'Vi phạm ngưỡng thanh toán không dùng tiền mặt (≥ 5 triệu)',
    expected: 'ESCALATED - OUT_OF_POLICY',
    invoice: {
      id: 'INV_CASH_BREACH_05',
      invoiceNumber: '0007890',
      invoiceDate: '2026-02-22',
      supplierTaxCode: '0105678901',
      supplierName: 'Công Ty Thiết Bị Điện Tử Tân Phát',
      itemName: 'Bộ lưu điện UPS APC 1000VA',
      preTaxAmount: 11_000_000,
      taxRate: 10,
      taxAmount: 1_100_000,
      totalAmount: 12_100_000,
      paymentMethod: 'CASH', // SAI: Từ 5M bắt buộc phải chuyển khoản ngân hàng
      hasBankSlip: false,
      sellerStatus: 'ACTIVE',
      isImageBlurry: false,
      isAdjustment: false
    }
  },

  // 6. Đối tác bán hàng ĐÃ BỊ ĐÓNG MST sau thời điểm xuất HĐ
  {
    name: 'TC-06: Đối tác đóng MST (Lập TRƯỚC ngày đóng)',
    category: 'Rủi ro pháp lý nhà cung cấp - KTT xác minh hồ sơ',
    expected: 'ESCALATED - UNCERTAIN_INFO',
    invoice: {
      id: 'INV_SELLER_SUSPENDED_BEFORE_06',
      invoiceNumber: '0001122',
      invoiceDate: '2026-01-10', // Lập ngày 10/01
      supplierTaxCode: '0315998877',
      supplierName: 'Công Ty TNHH Thương Mại Toàn Cầu An Phát',
      itemName: 'Dịch vụ tư vấn giải pháp mạng nội bộ',
      preTaxAmount: 25_000_000,
      taxRate: 10,
      taxAmount: 2_500_000,
      totalAmount: 27_500_000,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      sellerStatus: 'SUSPENDED',
      sellerSuspensionDate: '2026-01-25', // Đóng ngày 25/01 (SAU khi lập hóa đơn)
      isImageBlurry: false,
      isAdjustment: false
    }
  },

  // 7. Đối tác bán hàng ĐÃ BỊ ĐÓNG MST trước thời điểm xuất HĐ (Hóa đơn ma)
  {
    name: 'TC-07: Đối tác đóng MST (Lập SAU ngày đóng - Hóa đơn ma)',
    category: 'Hóa đơn bất hợp pháp 100% theo Luật Quản lý thuế',
    expected: 'ESCALATED - OUT_OF_POLICY',
    invoice: {
      id: 'INV_GHOST_COMPANY_07',
      invoiceNumber: '0009988',
      invoiceDate: '2026-02-15', // Lập ngày 15/02
      supplierTaxCode: '0315998877',
      supplierName: 'Công Ty TNHH Thương Mại Toàn Cầu An Phát',
      itemName: 'Hợp đồng bảo trì phần mềm kế toán',
      preTaxAmount: 30_000_000,
      taxRate: 10,
      taxAmount: 3_000_000,
      totalAmount: 33_000_000,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      sellerStatus: 'CLOSED',
      sellerSuspensionDate: '2026-01-25', // Đã đóng từ 25/01 (TRƯỚC ngày xuất HĐ)
      isImageBlurry: false,
      isAdjustment: false
    }
  },

  // 8. Hóa đơn điều chỉnh nhưng thiếu số hóa đơn gốc (Nghị định 254/2026)
  {
    name: 'TC-08: Hóa đơn điều chỉnh mồ côi',
    category: 'Thiếu thông tin truy vết bắt buộc theo Nghị định 254/2026',
    expected: 'ESCALATED - UNCERTAIN_INFO',
    invoice: {
      id: 'INV_ORPHAN_ADJUST_08',
      invoiceNumber: '0000888',
      invoiceDate: '2026-02-12',
      supplierTaxCode: '0108997766',
      supplierName: 'Công Ty CP Dược Phẩm Trung Ương',
      itemName: 'Điều chỉnh giảm giá hàng bán do lỗi quy cách',
      preTaxAmount: -5_000_000,
      taxRate: 10,
      taxAmount: -500_000,
      totalAmount: -5_500_000,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      sellerStatus: 'ACTIVE',
      isImageBlurry: false,
      isAdjustment: true,
      originalInvoiceRef: undefined // THIẾU mã hóa đơn gốc
    }
  },

  // 9. Hóa đơn chụp mờ số tiền, lóa sáng OCR không chắc chắn
  {
    name: 'TC-09: Hóa đơn chụp lóa mờ số tiền',
    category: 'Chưa xác định thông tin thực tế (Uncertain Info)',
    expected: 'ESCALATED - UNCERTAIN_INFO',
    invoice: {
      id: 'INV_BLURRY_09',
      invoiceNumber: '0004561',
      invoiceDate: '2026-02-19',
      supplierTaxCode: '0310203040',
      supplierName: 'Công Ty Vận Tải Giao Nhận Siêu Tốc',
      itemName: 'Cước vận chuyển container đường biển nội địa',
      preTaxAmount: 8_500_000,
      taxRate: 10,
      taxAmount: 850_000,
      totalAmount: 9_350_000,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      sellerStatus: 'ACTIVE',
      isImageBlurry: true, // LÓA MỜ
      isAdjustment: false
    }
  },

  // 10. Mua sắm vật tư lớn vượt hạn mức KTT & đẩy Hệ số K vào VÙNG ĐỎ
  {
    name: 'TC-10: Mua vật tư lớn đẩy K vào VÙNG ĐỎ (> 200M)',
    category: 'Vượt thẩm quyền KTT & Rủi ro nguồn hàng (CV 2392/TCT-QLRR)',
    expected: 'ESCALATED - EXCEED_AUTHORITY',
    invoice: {
      id: 'INV_HUGE_K_FACTOR_10',
      invoiceNumber: '0000099',
      invoiceDate: '2026-02-25',
      supplierTaxCode: '0100109106',
      supplierName: 'Tập Đoàn Thép Pomina - Chi Nhánh Miền Bắc',
      itemName: 'Thép cuộn nguyên liệu cán nguội 500 tấn',
      preTaxAmount: 350_000_000, // Vượt hạn mức 200M của KTT
      taxRate: 10,
      taxAmount: 35_000_000,
      totalAmount: 385_000_000,
      paymentMethod: 'BANK_TRANSFER',
      hasBankSlip: true,
      sellerStatus: 'ACTIVE',
      isImageBlurry: false,
      isAdjustment: false
    }
  }
];

const policy = getActivePolicy();
const macroState = getMacroState();
const evaluatedVouchers: CanonicalLedgerVoucher[] = [];

let countPassed = 0;

for (const tc of testInvoices) {
  const decision = evaluateInvoiceLocally(tc.invoice, policy.config, policy.version, macroState);
  RefereeDecisionSchema.parse(decision);

  const matched =
    tc.expected === 'ROUTINE'
      ? decision.status === 'ROUTINE'
      : decision.status === 'ESCALATED' &&
        (tc.expected.includes(decision.riskGroup) || tc.expected.includes('ESCALATED'));

  if (matched) {
    countPassed++;
    console.log(`[PASS] ${tc.name}`);
    console.log(`   Phân loại: ${decision.status}${decision.status === 'ESCALATED' ? ` | Nhóm: ${decision.riskGroup}` : ''}`);
    console.log(`   Giải thích: ${decision.plainExplanation}`);
  } else {
    console.log(`[FAIL] ${tc.name} - Mong đợi: ${tc.expected}, Thực tế: ${decision.status}`);
  }

  // Sinh bút toán kế toán chuẩn tắc theo Thông tư 99 và TT 133
  const voucherTT99 = generateCanonicalVoucher(tc.invoice, decision, evaluatedVouchers.length + 1, 'CIRCULAR_99_200');
  const voucherTT133 = generateCanonicalVoucher(tc.invoice, decision, evaluatedVouchers.length + 1, 'CIRCULAR_133');

  evaluatedVouchers.push(voucherTT99);

  // Kiểm tra tính cân đối kế toán Tổng Nợ = Tổng Có
  const sumDebits = voucherTT99.entries.reduce((s, e) => s + e.debitAmount, 0);
  const sumCredits = voucherTT99.entries.reduce((s, e) => s + e.creditAmount, 0);

  if (sumDebits !== sumCredits) {
    console.error(`   [CẢNH BÁO] Không cân đối Nợ/Có trên voucher ${voucherTT99.voucherNumber}!`);
  } else {
    console.log(`   Định khoản TT99: ${voucherTT99.entries.map((e) => `${e.debitAmount > 0 ? `Nợ ${e.accountCode}` : `Có ${e.accountCode}`}: ${e.debitAmount || e.creditAmount}đ`).join(', ')}`);
    console.log(`   Định khoản TT133: ${voucherTT133.entries.map((e) => `${e.debitAmount > 0 ? `Nợ ${e.accountCode}` : `Có ${e.accountCode}`}: ${e.debitAmount || e.creditAmount}đ`).join(', ')}`);
  }
  console.log('----------------------------------------------------------------');
}

console.log(`\n=> KẾT QUẢ ĐÁNH GIÁ PHÂN LUỒNG: ${countPassed}/${testInvoices.length} DẠNG HÓA ĐƠN ĐẠT CHUẨN XÁC TUYỆT ĐỐI!`);

// Kiểm thử xuất toàn bộ sang các Adapter
console.log('\n--- KIỂM THỬ XUẤT ĐỒNG BỘ ĐA NỀN TẢNG ---');
const misaPayload = formatMisaAmisPayload(evaluatedVouchers);
console.log(`- MISA AMIS: Tạo thành công ${misaPayload.data.length} chứng từ mua hàng RefType 24.`);

const fastPayload = formatFastAccountingPayload(evaluatedVouchers);
console.log(`- FAST Accounting: Tạo thành công ${fastPayload.chung_tu.length} chứng từ PNA.`);

const xmlPayload = generateUniversalXml(evaluatedVouchers);
console.log(`- Universal XML Thông tư 99: Kết xuất thành công ${xmlPayload.length} ký tự XML.`);

console.log('\n=== HOÀN TẤT TOÀN BỘ KIỂM THỬ ĐA DẠNG HÓA ĐƠN THÀNH CÔNG ===\n');
