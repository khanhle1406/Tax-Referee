import { InvoiceInput, RefereeDecision } from '@/lib/schemas';
import { MACRO_DEFAULTS } from '@/lib/constants';
import { getApplicableRegulations } from '@/data/regulatoryRegistry';

// Tính toán Hệ số K thời gian thực (Công văn 2392/TCT-QLRR)
export function calculateKFactor(additionalPurchase: number = 0): { kFactor: number; zone: 'SAFE_GREEN' | 'WARNING_YELLOW' | 'DANGER_RED' } {
  const totalSales = MACRO_DEFAULTS.TOTAL_SALES;
  const denominator = MACRO_DEFAULTS.OPENING_INVENTORY + MACRO_DEFAULTS.INITIAL_PURCHASES + additionalPurchase;
  if (denominator <= 0) return { kFactor: 9.99, zone: 'DANGER_RED' };
  const k = Number((totalSales / denominator).toFixed(2));
  
  let zone: 'SAFE_GREEN' | 'WARNING_YELLOW' | 'DANGER_RED' = 'SAFE_GREEN';
  if (k > 1.35 || k < 0.95) zone = 'DANGER_RED';
  else if (k > 1.25 || k < 1.05) zone = 'WARNING_YELLOW';

  return { kFactor: k, zone };
}

// Hàm đối soát hóa đơn nội bộ theo Tax-SOP-2026
function evaluateInvoiceLocallyInternal(inv: InvoiceInput): RefereeDecision {
  const timestamp = new Date().toISOString();

  // 1. Kiểm tra Nhóm 3: Tác động làm Hệ số K rơi vào Vùng Đỏ (Hệ số K > 1.35 hoặc K < 0.95)
  const { kFactor, zone } = calculateKFactor(inv.preTaxAmount);
  if (zone === 'DANGER_RED' && inv.preTaxAmount >= 1_000_000_000 && !inv.isAdjustment) {
    return {
      status: 'ESCALATED',
      riskGroup: 'EXCEED_AUTHORITY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: `Hóa đơn mua vào lớn đẩy Hệ số K kỳ này sang mức ${kFactor} (Vùng Đỏ nguy hiểm theo Công văn 2392/TCT-QLRR)`,
      plainExplanation: `Việc đưa hóa đơn quy mô lớn này vào làm tỷ lệ Hệ số K lệch chuẩn an toàn (${kFactor}), rất dễ bị AI Tổng cục Thuế gắn cờ thanh tra rủi ro.`,
      sopClause: 'Điều 4.2 Quy chế Tax-SOP-2026 (Công văn 2392/TCT-QLRR)',
      actionableQuestion: `Hóa đơn vật tư ${inv.invoiceNumber} đẩy Hệ số K sang mức ${kFactor} (Vùng Đỏ). CFO có duyệt đưa vào kỳ kê khai này không?`,
      options: [
        { id: 'A', label: 'Duyệt đưa vào kỳ này', actionDescription: 'Chấp nhận rủi ro giải trình với cơ quan thuế', resultingAction: 'ACCEPT_WITH_DOCS' },
        { id: 'B', label: 'Tạm chuyển sang kỳ sau', actionDescription: 'Điều chuyển chứng từ sang quý tiếp theo để giữ Hệ số K an toàn', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: true,
      timestamp
    };
  }

  // 2. Kiểm tra Nhóm 3: Vượt thẩm quyền Kế toán trưởng (>= 200.000.000 VNĐ)
  if (Math.abs(inv.totalAmount) >= 200_000_000) {
    if (inv.isAdjustment) {
      return {
        status: 'ESCALATED',
        riskGroup: 'EXCEED_AUTHORITY',
        invoiceId: inv.id,
        supplierName: inv.supplierName,
        totalAmount: inv.totalAmount,
        taxRate: inv.taxRate,
        flaggedReason: 'Hóa đơn điều chỉnh/giảm doanh thu vượt hạn mức 200.000.000 VNĐ của KTT',
        plainExplanation: 'Số tiền điều chỉnh giảm quá lớn (trên 200 triệu), quy chế công ty yêu cầu đích thân Giám đốc Tài chính (CFO) phê duyệt.',
        sopClause: 'Điều 3.3 Quy chế Tax-SOP-2026',
        actionableQuestion: `Hóa đơn điều chỉnh giảm doanh thu ${inv.invoiceNumber} từ ${inv.supplierName} có giá trị ${inv.totalAmount.toLocaleString('vi-VN')}₫ (vượt hạn mức KTT). CFO có phê duyệt ghi nhận giảm thuế tương ứng không?`,
        options: [
          { id: 'A', label: 'CFO Phê duyệt ghi nhận', actionDescription: 'Ghi nhận giảm thuế đầu vào theo hóa đơn', resultingAction: 'ACCEPT_ADJUSTMENT' },
          { id: 'B', label: 'Từ chối, yêu cầu kiểm toán lại', actionDescription: 'Chặn ghi nhận, chuyển phòng pháp chế kiểm tra hợp đồng', resultingAction: 'REJECT_TAX_DEDUCTION' }
        ],
        requiresCFO: true,
        timestamp
      };
    }

    return {
      status: 'ESCALATED',
      riskGroup: 'EXCEED_AUTHORITY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Khoản chi đặc thù vượt hạn mức tự duyệt của KTT (>= 200 triệu)',
      plainExplanation: 'Khoản chi lớn vượt thẩm quyền tự duyệt của Kế toán trưởng, cần chữ ký phê duyệt chi của CFO.',
      sopClause: 'Điều 3.3 Quy chế Tax-SOP-2026',
      actionableQuestion: `Khoản chi ${inv.itemName} trị giá ${inv.totalAmount.toLocaleString('vi-VN')}₫ vượt trần thẩm quyền 200 triệu. CFO có chấp thuận phê duyệt chi và khấu trừ thuế không?`,
      options: [
        { id: 'A', label: 'CFO Phê duyệt chi', actionDescription: 'Chấp thuận chi phí và đưa vào khấu trừ', resultingAction: 'FORWARD_TO_CFO' },
        { id: 'B', label: 'Yêu cầu họp HĐQT xem xét', actionDescription: 'Tạm dừng hạch toán', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: true,
      timestamp
    };
  }



  // 3. Kiểm tra Nhóm 2: Nằm ngoài phạm vi quy định (Out of Policy)
  // 3a. Hóa đơn >= 20 triệu nhưng thanh toán TIỀN MẶT
  if (inv.totalAmount >= 20_000_000 && (inv.paymentMethod === 'CASH' || !inv.hasBankSlip)) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hóa đơn từ 20 triệu VNĐ thanh toán tiền mặt (thiếu Ủy nhiệm chi ngân hàng)',
      plainExplanation: 'Luật thuế quy định hóa đơn trên 20 triệu bắt buộc phải chuyển khoản qua ngân hàng thì mới được khấu trừ thuế.',
      sopClause: 'Điều 1.2 Quy chế Tax-SOP-2026 & Điều 15 Thông tư 219/2013/TT-BTC',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} trị giá ${inv.totalAmount.toLocaleString('vi-VN')}₫ ghi hình thức Tiền mặt. Kế toán trưởng xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Yêu cầu bổ sung Ủy nhiệm chi', actionDescription: 'Tạm treo hóa đơn, chờ kế toán thanh toán nộp UNC ngân hàng', resultingAction: 'REQUEST_SUPPLIER_REISSUE' },
        { id: 'B', label: 'Loại bỏ phần thuế khỏi khấu trừ', actionDescription: 'Chỉ ghi nhận chi phí nội bộ, không đưa tiền thuế vào Tờ khai 01', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 3b. Hàng hóa cấm khấu trừ (Rượu, bia, giải trí cá nhân)
  const isAlcohol = /rượu|bia|whisky|wine|karaoke|massage/i.test(inv.itemName);
  if (isAlcohol) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Chi phí mua đồ uống có cồn/giải trí không phục vụ hoạt động sản xuất kinh doanh',
      plainExplanation: 'Tiền mua rượu bia liên hoan không được nhà nước cho khấu trừ thuế GTGT và không được tính vào chi phí hợp lý khi tính thuế TNDN.',
      sopClause: 'Điều 2.1 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn tiệc ${inv.invoiceNumber} có mục đồ uống có cồn (${inv.totalAmount.toLocaleString('vi-VN')}₫). Kế toán trưởng xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Loại bỏ toàn bộ hóa đơn', actionDescription: 'Không đưa vào sổ sách thuế công ty', resultingAction: 'REJECT_TAX_DEDUCTION' },
        { id: 'B', label: 'Khấu trừ phần ăn, loại phần rượu', actionDescription: 'Bóc tách chi phí ăn uống hợp lệ, tự loại phần thuế rượu', resultingAction: 'ACCEPT_WITH_DOCS' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 3c. Dịch vụ viễn thông, CNTT áp nhầm thuế suất 8% (Luật bắt buộc 10%)
  const isTelecomOrIT = /viễn thông|internet|cước|cntt|hóa chất/i.test(inv.itemName);
  if (isTelecomOrIT && inv.taxRate === 8) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Dịch vụ viễn thông/CNTT áp sai thuế suất 8% (thuộc danh mục loại trừ bắt buộc 10%)',
      plainExplanation: 'Nhà cung cấp viễn thông xuất nhầm thuế 8%. Nghị định giảm thuế loại trừ ngành này, bắt buộc phải là 10%. Kê khai 8% sẽ bị phạt khai sai.',
      sopClause: 'Điều 1.3c Quy chế Tax-SOP-2026 & Nghị định 72/2024/NĐ-CP',
      actionableQuestion: `Hóa đơn viễn thông ${inv.invoiceNumber} từ ${inv.supplierName} áp sai thuế 8% (phải là 10%). Kế toán trưởng xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Yêu cầu nhà cung cấp xuất lại HĐ 10%', actionDescription: 'Gửi công văn trả lại hóa đơn, yêu cầu bên bán hủy và xuất lại', resultingAction: 'REQUEST_SUPPLIER_REISSUE' },
        { id: 'B', label: 'Loại phần thuế khỏi khấu trừ', actionDescription: 'Vẫn hạch toán chi phí nhưng không kê khai số thuế đầu vào này', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 3d. Nhà cung cấp lập hóa đơn SAU ngày bị cơ quan thuế đóng MST
  if (inv.sellerStatus === 'CLOSED' && inv.sellerSuspensionDate && inv.invoiceDate > inv.sellerSuspensionDate) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: `Hóa đơn lập ngày ${inv.invoiceDate}, SAU ngày người bán bị đóng MST (${inv.sellerSuspensionDate})`,
      plainExplanation: 'Nhà cung cấp đã bị cơ quan thuế khóa mã số thuế trước khi xuất hóa đơn này. Hóa đơn hoàn toàn bất hợp pháp.',
      sopClause: 'Điều 2.2 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} xuất sau ngày nhà cung cấp bị đóng MST (${inv.sellerSuspensionDate}). Hệ thống khuyến nghị loại bỏ ngay. KTT xác nhận?`,
      options: [
        { id: 'A', label: 'Loại bỏ ngay lập tức (Khuyến nghị)', actionDescription: 'Cấm hạch toán để tránh rủi ro hình sự', resultingAction: 'REJECT_TAX_DEDUCTION' },
        { id: 'B', label: 'Chuyển phòng Pháp chế điều tra', actionDescription: 'Tạm giữ chứng từ để làm việc với đối tác', resultingAction: 'FORWARD_TO_CFO' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4. Kiểm tra Nhóm 1: Chưa xác định được thông tin thực tế (Uncertain Info)
  // 4a. Ảnh hóa đơn bị mờ số tiền
  if (inv.isImageBlurry) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hình ảnh hóa đơn bị mờ/lóa dòng tổng tiền, OCR không nhận diện chắc chắn',
      plainExplanation: 'Chứng từ ảnh chụp bị mờ nét chữ số tiền cuối cùng. Cần người có thẩm quyền nhìn mắt thường để xác nhận con số chuẩn.',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn taxi ${inv.invoiceNumber} bị mờ số tiền cuối, hệ thống dự đoán là 140.000₫ hoặc 190.000₫. KTT chọn con số nào?`,
      options: [
        { id: 'A', label: 'Xác nhận số tiền là 140.000₫', actionDescription: 'Ghi nhận số tiền nhỏ hơn để an toàn chi phí', resultingAction: 'ACCEPT_WITH_DOCS' },
        { id: 'B', label: 'Xác nhận số tiền là 190.000₫', actionDescription: 'Ghi nhận số tiền đúng theo thực tế cuốc xe', resultingAction: 'ACCEPT_WITH_DOCS' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4b. Thiếu bảng kê chi tiết mặt hàng
  if (!inv.hasItemManifest) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hóa đơn tổng hợp thiếu tệp bảng kê chi tiết quy cách hàng hóa đính kèm',
      plainExplanation: 'Hóa đơn ghi tên mặt hàng chung chung và thiếu bảng kê chi tiết từng món. Nếu không có bảng kê, thuế sẽ loại chi phí khi kiểm tra.',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn vật tư ${inv.invoiceNumber} (${inv.totalAmount.toLocaleString('vi-VN')}₫) thiếu bảng kê chi tiết. KTT xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Tạm treo, yêu cầu bổ sung bảng kê', actionDescription: 'Gửi thông báo cho nhân viên mua hàng nộp bảng kê', resultingAction: 'REQUEST_SUPPLIER_REISSUE' },
        { id: 'B', label: 'Loại khỏi đợt kê khai thuế quý này', actionDescription: 'Tạm thời chưa kê khai khấu trừ', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4c. Hóa đơn điều chỉnh nhưng không tìm thấy số hóa đơn gốc (Nghị định 123)
  if (inv.isAdjustment && !inv.originalInvoiceRef) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hóa đơn điều chỉnh nhưng không tìm thấy số hóa đơn gốc trong CSDL nội bộ',
      plainExplanation: 'Hóa đơn ghi là điều chỉnh giảm tiền nhưng hệ thống không tìm thấy hóa đơn ban đầu đã mua. Có thể nhà cung cấp xuất nhầm số cho công ty khác.',
      sopClause: 'Điều 1.4 Quy chế Tax-SOP-2026 & Nghị định 123/2020/NĐ-CP',
      actionableQuestion: `Hóa đơn điều chỉnh ${inv.invoiceNumber} không khớp với bất kỳ hóa đơn gốc nào. KTT xử lý thế nào?`,
      options: [
        { id: 'A', label: 'Tạm treo chờ tra soát hóa đơn gốc', actionDescription: 'Liên hệ kế toán đối tác để kiểm tra số bill gốc', resultingAction: 'REQUEST_SUPPLIER_REISSUE' },
        { id: 'B', label: 'Từ chối tiếp nhận hóa đơn này', actionDescription: 'Bác bỏ hóa đơn điều chỉnh', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4d. Nhà cung cấp đóng MST: Hóa đơn lập TRƯỚC ngày cơ quan thuế công bố
  if (inv.sellerStatus === 'CLOSED' && inv.sellerSuspensionDate && inv.invoiceDate <= inv.sellerSuspensionDate) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: `Nhà cung cấp đã đóng MST ngày ${inv.sellerSuspensionDate}, nhưng hóa đơn lập ngày ${inv.invoiceDate} (Trước ngày đóng)`,
      plainExplanation: 'Đối tác hiện đã giải thể/bỏ trốn nhưng tại thời điểm mua hàng thì họ vẫn đang hoạt động. Giao dịch có thể hợp lệ nếu chứng minh được hàng đã nhận thật.',
      sopClause: 'Điều 2.2 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} lập trước ngày người bán đóng MST. Giao dịch hợp lệ nếu có biên bản giao hàng. KTT quyết định?`,
      options: [
        { id: 'A', label: 'Xác nhận đủ hồ sơ, tiếp tục kê khai', actionDescription: 'Lưu bộ hồ sơ chứng minh giao dịch có thật và đưa vào khấu trừ', resultingAction: 'ACCEPT_WITH_DOCS' },
        { id: 'B', label: 'Loại bỏ để an toàn tuyệt đối', actionDescription: 'Chấp nhận bỏ chi phí để không phải giải trình với thanh tra thuế', resultingAction: 'REJECT_TAX_DEDUCTION' }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 5. Nếu không vướng bất kỳ điều kiện nào ở trên -> DUYỆT THƯỜNG QUY 100% (ROUTINE)
  const approvedTax = Number((inv.preTaxAmount * (inv.taxRate / 100)).toFixed(0));
  const newK = calculateKFactor(inv.preTaxAmount).kFactor;

  return {
    status: 'ROUTINE',
    invoiceId: inv.id,
    supplierName: inv.supplierName,
    totalAmount: inv.totalAmount,
    appliedTaxRate: inv.taxRate,
    approvedTaxAmount: approvedTax,
    plainExplanation: 'Hóa đơn đầy đủ tính pháp lý, đúng thuế suất theo quy định, có chứng từ thanh toán hợp lệ và nằm trong hạn mức kế toán viên.',
    kFactorAfter: newK,
    timestamp
  };
}

// Hàm đối soát hóa đơn công khai đính kèm context văn bản pháp quy theo ngày lập và phiên bản SOP
export function evaluateInvoiceLocally(
  inv: InvoiceInput,
  customSopVersion: string = 'TAX-SOP-2026 v2.1'
): RefereeDecision {
  const regInfo = getApplicableRegulations(inv.invoiceDate);
  const applicableDecreeCodes = regInfo.applicableRegulations.map((d) => d.code);
  const decision = evaluateInvoiceLocallyInternal(inv);

  return {
    ...decision,
    applicableRegulations: applicableDecreeCodes,
    sopVersion: customSopVersion
  } as RefereeDecision;
}

