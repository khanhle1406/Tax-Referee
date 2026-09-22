import { InvoiceInput } from '@/lib/schemas';

export const MOCK_INVOICES: InvoiceInput[] = [
  // --- 6 CA THƯỜNG QUY (ROUTINE) ---
  {
    id: 'TC-01',
    invoiceNumber: 'HD-001829',
    invoiceDate: '2026-08-12',
    supplierTaxCode: '0301482910',
    supplierName: 'Công ty Cổ phần Fahasa',
    itemName: 'Giấy in văn phòng và văn phòng phẩm',
    preTaxAmount: 4_166_667,
    taxRate: 8,
    taxAmount: 333_333,
    totalAmount: 4_500_000,
    paymentMethod: 'CASH', // Dưới 20M được phép tiền mặt
    hasBankSlip: false,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-02',
    invoiceNumber: 'EVN-994812',
    invoiceDate: '2026-08-15',
    supplierTaxCode: '0300948211',
    supplierName: 'Tổng Công ty Điện lực TP.HCM (EVN)',
    itemName: 'Tiền điện chiếu sáng văn phòng tháng 07/2026',
    preTaxAmount: 11_111_111,
    taxRate: 8,
    taxAmount: 888_889,
    totalAmount: 12_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-03',
    invoiceNumber: 'SEN-004912',
    invoiceDate: '2026-08-18',
    supplierTaxCode: '0104829102',
    supplierName: 'Nhà hàng Sen Tây Hồ',
    itemName: 'Dịch vụ ăn uống tiếp khách kèm bảng kê món chi tiết',
    preTaxAmount: 8_148_148,
    taxRate: 8,
    taxAmount: 651_852,
    totalAmount: 8_800_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true, // Có bảng kê món hợp lệ
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-04',
    invoiceNumber: 'PV-884912',
    invoiceDate: '2026-08-20',
    supplierTaxCode: '0304928104',
    supplierName: 'Công ty Máy tính Phong Vũ',
    itemName: 'Máy vi tính xách tay Dell Vostro cho nhân viên',
    preTaxAmount: 16_818_182,
    taxRate: 10,
    taxAmount: 1_681_818,
    totalAmount: 18_500_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-05',
    invoiceNumber: 'MISA-774912',
    invoiceDate: '2026-08-22',
    supplierTaxCode: '0101243150',
    supplierName: 'Công ty Cổ phần MISA',
    itemName: 'Thuê bao phần mềm kế toán MISA AMIS (Dịch vụ phần mềm)',
    preTaxAmount: 15_000_000,
    taxRate: 0, // Không chịu thuế GTGT
    taxAmount: 0,
    totalAmount: 15_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-06',
    invoiceNumber: 'VT-338291',
    invoiceDate: '2026-08-25',
    supplierTaxCode: '0100109106',
    supplierName: 'Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel)',
    itemName: 'Cước dịch vụ Internet cáp quang FTTH văn phòng',
    preTaxAmount: 1_500_000,
    taxRate: 10, // Đúng thuế suất 10%
    taxAmount: 150_000,
    totalAmount: 1_650_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },

  // --- 3 CA NHÓM 1: UNCERTAIN_INFO ---
  {
    id: 'TC-07',
    invoiceNumber: 'TAXI-00981',
    invoiceDate: '2026-08-26',
    supplierTaxCode: '0302018291',
    supplierName: 'Công ty Cổ phần Ánh Dương (Taxi Vinasun)',
    itemName: 'Cước taxi công tác nội thành',
    preTaxAmount: 145_455,
    taxRate: 10,
    taxAmount: 14_545,
    totalAmount: 160_000,
    paymentMethod: 'CASH',
    hasBankSlip: false,
    hasItemManifest: true,
    isImageBlurry: true, // Lóa mờ số tiền
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-08',
    invoiceNumber: 'DC-00109',
    invoiceDate: '2026-08-27',
    supplierTaxCode: '0309981244',
    supplierName: 'Công ty Thiết bị Công nghiệp Tân Thành',
    itemName: 'Hóa đơn điều chỉnh giảm đơn giá máy công cụ',
    preTaxAmount: -13_888_889,
    taxRate: 8,
    taxAmount: -1_111_111,
    totalAmount: -15_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: true,
    originalInvoiceRef: undefined // Lỗi: Thiếu mã HĐ gốc theo NĐ 123
  },
  {
    id: 'TC-09',
    invoiceNumber: 'SM-004812',
    invoiceDate: '2026-08-10', // Lập ngày 10/08 (TRƯỚC ngày đóng MST 15/08)
    supplierTaxCode: '0315994821',
    supplierName: 'Công ty TNHH Thương mại Sao Mai',
    itemName: 'Dịch vụ tổ chức hội thảo khách hàng',
    preTaxAmount: 13_888_889,
    taxRate: 8,
    taxAmount: 1_111_111,
    totalAmount: 15_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'CLOSED',
    sellerSuspensionDate: '2026-08-15', // Ngày đóng MST
    isAdjustment: false
  },

  // --- 3 CA NHÓM 2: OUT_OF_POLICY ---
  {
    id: 'TC-10',
    invoiceNumber: 'VNPT-5501',
    invoiceDate: '2026-08-28',
    supplierTaxCode: '0100684378',
    supplierName: 'Tập đoàn Bưu chính Viễn thông Việt Nam (VNPT)',
    itemName: 'Cước dịch vụ viễn thông truyền số liệu',
    preTaxAmount: 5_092_593,
    taxRate: 8, // Vi phạm: Viễn thông bắt buộc 10%
    taxAmount: 407_407,
    totalAmount: 5_500_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-11',
    invoiceNumber: 'PARTY-8812',
    invoiceDate: '2026-08-29',
    supplierTaxCode: '0314882910',
    supplierName: 'Công ty Ẩm thực Hoàng Gia',
    itemName: 'Tiệc liên hoan tiếp khách có phục vụ Rượu vang Bordeaux và bia ngoại',
    preTaxAmount: 8_363_636,
    taxRate: 10,
    taxAmount: 836_364,
    totalAmount: 9_200_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-12',
    invoiceNumber: 'NK-091244',
    invoiceDate: '2026-08-30',
    supplierTaxCode: '0302881920',
    supplierName: 'Điện máy Nguyễn Kim',
    itemName: 'Mua hệ thống máy lạnh Daikin Inverter cho văn phòng',
    preTaxAmount: 22_727_273,
    taxRate: 10,
    taxAmount: 2_272_727,
    totalAmount: 25_000_000,
    paymentMethod: 'CASH', // Vi phạm: Trên 20 triệu thanh toán Tiền mặt
    hasBankSlip: false,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },

  // --- 3 CA NHÓM 3: EXCEED_AUTHORITY ---
  {
    id: 'TC-13',
    invoiceNumber: 'HP-990124',
    invoiceDate: '2026-08-31',
    supplierTaxCode: '0900189211',
    supplierName: 'Tập đoàn Thép Hòa Phát',
    itemName: 'Hóa đơn điều chỉnh chiết khấu thương mại sản lượng thép cuối năm',
    preTaxAmount: -231_481_481,
    taxRate: 8,
    taxAmount: -18_518_519,
    totalAmount: -250_000_000, // Vượt trần 200M của KTT
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: true,
    originalInvoiceRef: 'HP-ORIG-0012'
  },
  {
    id: 'TC-14',
    invoiceNumber: 'VT-992014',
    invoiceDate: '2026-09-01',
    supplierTaxCode: '0301994821',
    supplierName: 'Công ty Cổ phần Vật liệu Xây dựng Miền Nam',
    itemName: 'Lô xi măng và sắt thép xây dựng công trình mở rộng xưởng',
    preTaxAmount: 4_500_000_000, // Đẩy Hệ số K vọt lên 1.58 (Vùng Đỏ)
    taxRate: 8,
    taxAmount: 360_000_000,
    totalAmount: 4_860_000_000,
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  },
  {
    id: 'TC-15',
    invoiceNumber: 'TP-449120',
    invoiceDate: '2026-09-02',
    supplierTaxCode: '0308819201',
    supplierName: 'Công ty Cổ phần Xây lắp Tân Phát',
    itemName: 'Chi phí bồi thường vi phạm hợp đồng tiến độ thi công',
    preTaxAmount: 210_000_000,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 210_000_000, // Vượt thẩm quyền 200M
    paymentMethod: 'BANK_TRANSFER',
    hasBankSlip: true,
    hasItemManifest: true,
    isImageBlurry: false,
    sellerStatus: 'ACTIVE',
    isAdjustment: false
  }
];

// 5 Ca chuẩn chạy trong nút "Verify 90s"
export const VERIFY_90S_CASES: InvoiceInput[] = [
  MOCK_INVOICES[0], // TC-01: Fahasa 4.5M (Kỳ vọng: ROUTINE)
  MOCK_INVOICES[1], // TC-02: EVN 12M (Kỳ vọng: ROUTINE)
  MOCK_INVOICES[5], // TC-06: Viettel 1.65M (Kỳ vọng: ROUTINE)
  MOCK_INVOICES[6], // TC-07: Taxi mờ tiền (Kỳ vọng: ESCALATED - UNCERTAIN_INFO)
  MOCK_INVOICES[12] // TC-13: Hòa Phát -250M (Kỳ vọng: ESCALATED - EXCEED_AUTHORITY)
];
