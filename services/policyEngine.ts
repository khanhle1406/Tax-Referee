import { InvoiceInput, InvoiceLineItem, LineItemAnalysis, MacroState, RefereeDecision, SystemPolicyConfig } from '@/lib/schemas';
import { MACRO_DEFAULTS } from '@/lib/constants';
import { getApplicableRegulations } from '@/data/regulatoryRegistry';
import { checkDuplicateInvoice } from '@/services/duplicateDetector';
import { findPrecedentForInvoice } from '@/services/precedentService';

// 0. IMP-08: Hàm Đối soát Chi tiết Dòng hàng & Đa Thuế suất (Line-item Validation Engine)
export interface LineItemValidationResult {
  isValid: boolean;
  totalItems: number;
  flaggedItemsCount: number;
  warnings: string[];
  totalItemAmount: number;
  totalItemTax: number;
  mismatchHeader: boolean;
  hasExcludedVat8Item: boolean;
  hasSensitiveItem: boolean;
}

export function validateLineItems(
  items: InvoiceLineItem[] | undefined,
  inv: InvoiceInput,
  config?: Partial<SystemPolicyConfig>
): LineItemValidationResult {
  if (!items || items.length === 0) {
    return {
      isValid: true,
      totalItems: 0,
      flaggedItemsCount: 0,
      warnings: [],
      totalItemAmount: inv.preTaxAmount,
      totalItemTax: inv.taxAmount,
      mismatchHeader: false,
      hasExcludedVat8Item: false,
      hasSensitiveItem: false
    };
  }

  const excluded = (config?.excludedVat8Categories || [
    'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
    'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
  ]).map(c => c.trim().toLocaleUpperCase('vi-VN'));

  const sensitiveKeywords = ['RƯỢU', 'BIA', 'WHISKY', 'WINE', 'THUỐC LÁ', 'CIGAR', 'KARAOKE', 'MASSAGE'];

  const warnings: string[] = [];
  let flaggedCount = 0;
  let sumAmount = 0;
  let sumTax = 0;
  let hasExcludedVat8Item = false;
  let hasSensitiveItem = false;

  for (const item of items) {
    sumAmount += item.amount;
    sumTax += item.taxAmount;
    const nameUpper = item.itemName.toLocaleUpperCase('vi-VN');

    // 1. Kiểm tra tính toán số học từng dòng (dung sai làm tròn 1.000đ)
    const expectedAmount = item.quantity * item.unitPrice - (item.discountAmount || 0);
    if (Math.abs(item.amount - expectedAmount) > 1000) {
      warnings.push(`Dòng ${item.lineNumber} [${item.itemName}]: Thành tiền (${item.amount.toLocaleString('vi-VN')}₫) lệch so với số lượng x đơn giá (${expectedAmount.toLocaleString('vi-VN')}₫).`);
      flaggedCount++;
      item.flaggedReason = 'Lệch số học thành tiền';
    }

    // 2. Rà soát danh mục loại trừ thuế suất 8% (Nghị quyết 204/2025/QH15)
    if (item.taxRate === 8) {
      const isExcluded = excluded.some(cat => nameUpper.includes(cat)) || /CƯỚC INTERNET|INTERNET|CƯỚC DI ĐỘNG/i.test(nameUpper);
      if (isExcluded) {
        warnings.push(`Dòng ${item.lineNumber} [${item.itemName}]: Mặt hàng thuộc danh mục loại trừ nhưng đang áp thuế suất ưu đãi 8% thay vì 10% (NQ 204/2025/QH15).`);
        flaggedCount++;
        hasExcludedVat8Item = true;
        item.isExcludedCategory = true;
        item.flaggedReason = 'Sai thuế suất 8% theo NQ 204/2025/QH15';
      }
    }

    // 3. Phát hiện chi phí nhạy cảm không phục vụ SXKD
    const isSensitive = sensitiveKeywords.some(kw => nameUpper.includes(kw));
    if (isSensitive) {
      warnings.push(`Dòng ${item.lineNumber} [${item.itemName}]: Chi phí nhạy cảm (rượu/bia/thuốc lá/giải trí) - cần kèm quy chế tiếp khách.`);
      flaggedCount++;
      hasSensitiveItem = true;
      item.flaggedReason = 'Chi phí nhạy cảm cần hồ sơ chứng minh';
    }
  }

  // 4. Đối chiếu tổng dòng với Header (dung sai làm tròn 2.000đ)
  const amountDiff = Math.abs(sumAmount - inv.preTaxAmount);
  const taxDiff = Math.abs(sumTax - inv.taxAmount);
  let mismatchHeader = false;
  if (amountDiff > 2000 || taxDiff > 2000) {
    warnings.push(`Tổng chi tiết dòng hàng (${sumAmount.toLocaleString('vi-VN')}₫) không khớp với số tiền trên hóa đơn (${inv.preTaxAmount.toLocaleString('vi-VN')}₫).`);
    mismatchHeader = true;
    flaggedCount++;
  }

  return {
    isValid: flaggedCount === 0,
    totalItems: items.length,
    flaggedItemsCount: flaggedCount,
    warnings,
    totalItemAmount: sumAmount,
    totalItemTax: sumTax,
    mismatchHeader,
    hasExcludedVat8Item,
    hasSensitiveItem
  };
}

// Tính toán Tham số nguồn hàng K thời gian thực (Công văn 2392/TCT-QLRR & TT 94/2026/TT-BTC)
export function calculateKFactor(
  additionalPurchase: number = 0,
  safeMin: number = 1.05,
  safeMax: number = 1.25,
  currentState?: Pick<MacroState, 'totalSales' | 'openingInventory' | 'totalPurchases'>
): { kFactor: number; zone: 'SAFE_GREEN' | 'WARNING_YELLOW' | 'DANGER_RED' } {
  const totalSales = currentState?.totalSales ?? MACRO_DEFAULTS.TOTAL_SALES;
  const openingInventory = currentState?.openingInventory ?? MACRO_DEFAULTS.OPENING_INVENTORY;
  const totalPurchases = currentState?.totalPurchases ?? MACRO_DEFAULTS.INITIAL_PURCHASES;
  const denominator = openingInventory + totalPurchases + additionalPurchase;
  if (denominator <= 0) return { kFactor: 9.99, zone: 'DANGER_RED' };
  const k = Number((totalSales / denominator).toFixed(2));
  
  let zone: 'SAFE_GREEN' | 'WARNING_YELLOW' | 'DANGER_RED' = 'SAFE_GREEN';
  if (k > 1.35 || k < 0.95) {
    zone = 'DANGER_RED';
  } else if (k > safeMax || k < safeMin) {
    zone = 'WARNING_YELLOW';
  }

  return { kFactor: k, zone };
}

// Hàm đối soát hóa đơn nội bộ theo Tax-SOP-2026 và Khung Pháp lý Hiện hành
function evaluateInvoiceLocallyInternal(
  inv: InvoiceInput,
  config?: Partial<SystemPolicyConfig>,
  macroState?: Pick<MacroState, 'totalSales' | 'openingInventory' | 'totalPurchases'>
): RefereeDecision {
  const timestamp = new Date().toISOString();
  const regInfo = getApplicableRegulations(inv.invoiceDate);

  // 0. IMP-13: Kiểm tra hóa đơn trùng lặp tiền hạch toán
  const duplicate = checkDuplicateInvoice(inv);
  if (duplicate.isDuplicate) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: duplicate.duplicateReason || 'Phát hiện hóa đơn trùng lặp số chứng từ trong hệ thống',
      plainExplanation: 'Hóa đơn này có số hiệu trùng với chứng từ đã tiếp nhận trước đó. Cần KTT xác minh để tránh rủi ro kê khai trùng thuế GTGT.',
      sopClause: 'Điều 1.1 & Điều 3.4 Quy chế Tax-SOP-2026 (Chống trùng lặp HĐĐT)',
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' bị phát hiện trùng lặp với hồ sơ gốc [' + (duplicate.originalInvoiceId || '') + ']. KTT xử lý thế nào?',
      options: [
        {
          id: 'A',
          label: 'Từ chối & Hủy bỏ hóa đơn trùng',
          actionDescription: 'Hủy tiếp nhận hóa đơn này để ngăn chặn hành vi kê khai khống/trùng thuế GTGT',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        },
        {
          id: 'B',
          label: 'Xác nhận là HĐ thay thế hợp lệ',
          actionDescription: 'Kèm biên bản hủy hóa đơn cũ và tiếp tục thẩm định hóa đơn thay thế',
          resultingAction: 'ACCEPT_ADJUSTMENT'
        }
      ],
      requiresCFO: false,
      applicableRegulations: regInfo.applicableRegulations.map(r => r.code),
      sopVersion: 'TAX-SOP-2026-v2.5',
      duplicateInfo: duplicate,
      timestamp
    };
  }

  // 0b. IMP-08: Thẩm định chi tiết dòng hàng & đa thuế suất
  const lineItemResult = validateLineItems(inv.items, inv, config);
  const lineItemAnalysis: LineItemAnalysis | undefined = inv.items && inv.items.length > 0 ? {
    isValid: lineItemResult.isValid,
    totalItems: lineItemResult.totalItems,
    flaggedItemsCount: lineItemResult.flaggedItemsCount,
    warnings: lineItemResult.warnings,
    totalItemAmount: lineItemResult.totalItemAmount,
    totalItemTax: lineItemResult.totalItemTax,
    mismatchHeader: lineItemResult.mismatchHeader
  } : undefined;

  // Nếu tổng chi tiết dòng hàng không khớp với tiền trước thuế của hóa đơn
  if (lineItemResult.mismatchHeader) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: `Tổng cộng các dòng hàng (${lineItemResult.totalItemAmount.toLocaleString('vi-VN')}₫) không khớp với số tiền trước thuế trên hóa đơn (${inv.preTaxAmount.toLocaleString('vi-VN')}₫)`,
      plainExplanation: 'Tổng tiền các dòng chi tiết không bằng tiền trước thuế trên tiêu đề hóa đơn (chênh lệch vượt dung sai làm tròn 2.000₫). Cần KTT xác nhận lại chứng từ gốc để tránh rủi ro giải trình cơ quan thuế.',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026 (Tính toàn vẹn số liệu dòng hàng)',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} có tổng dòng hàng (${lineItemResult.totalItemAmount.toLocaleString('vi-VN')}₫) lệch so với Header (${inv.preTaxAmount.toLocaleString('vi-VN')}₫). KTT xử lý thế nào?`,
      options: [
        {
          id: 'A',
          label: 'Yêu cầu nhà cung cấp lập biên bản điều chỉnh',
          actionDescription: 'Tạm treo hóa đơn, yêu cầu NCC kiểm tra lại phần mềm xuất hóa đơn và điều chỉnh',
          resultingAction: 'REQUEST_SUPPLIER_REISSUE'
        },
        {
          id: 'B',
          label: 'Từ chối tiếp nhận hóa đơn',
          actionDescription: 'Hủy tiếp nhận hóa đơn có sai lệch số liệu nội tại',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false,
      lineItemAnalysis,
      timestamp
    };
  }

  // Thiết lập các ngưỡng theo cấu hình động hoặc mặc định pháp luật 2026
  const nonCashThreshold = config?.nonCashThreshold ?? regInfo.nonCashThreshold;
  const kttApprovalLimit = config?.kttApprovalLimit ?? 200_000_000;
  const kSafeMin = config?.kFactorSafeMin ?? 1.05;
  const kSafeMax = config?.kFactorSafeMax ?? 1.25;
  const allowStaffReimbursement = config?.allowStaffReimbursement ?? true;

  const issue = getDataQualityIssue(inv);
  if (issue) {
    return uncertainDecision(inv, issue, timestamp);
  }

  // Người bán đang bị tạm ngừng là dữ liệu cần xác minh, không được Routine.
  if (inv.sellerStatus === 'SUSPENDED') {
    return uncertainDecision(inv, 'Mã số thuế nhà cung cấp đang ở trạng thái tạm ngừng; cần xác nhận thời điểm giao dịch và hồ sơ hàng hóa.', timestamp);
  }

  // 1. Kiểm tra Nhóm 3: Biến động Tham số nguồn hàng K vào Vùng Đỏ (K > 1.35 hoặc K < 0.95)
  const { kFactor, zone } = calculateKFactor(inv.preTaxAmount, kSafeMin, kSafeMax, macroState);
  if (zone === 'DANGER_RED' && Math.abs(inv.preTaxAmount) >= 1_000_000_000 && !inv.isAdjustment) {
    return {
      status: 'ESCALATED',
      riskGroup: 'EXCEED_AUTHORITY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Lô hàng mua sắm lớn đẩy Tham số nguồn hàng K kỳ này sang mức ' + kFactor + ' (Vùng Đỏ theo Công văn 2392/TCT-QLRR)',
      plainExplanation: 'Mua sắm vật tư lớn làm mẫu số tăng mạnh khiến chỉ số K chạm Vùng Đỏ (' + kFactor + '), có nguy cơ bị hệ thống quản lý rủi ro của Cục Thuế gửi văn bản tra soát.',
      sopClause: 'Điều 4.2 & Điều 4.3 Quy chế Tax-SOP-2026 (CV 2392/TCT-QLRR & TT 94/2026/TT-BTC)',
      actionableQuestion: 'Hóa đơn vật tư ' + inv.invoiceNumber + ' (' + inv.totalAmount.toLocaleString('vi-VN') + '₫) làm Hệ số K chạm Vùng Đỏ (' + kFactor + '). CFO phê duyệt chiến lược xử lý?',
      options: [
        {
          id: 'A',
          label: 'Duyệt kê khai & Chuẩn bị Hồ sơ Phòng vệ',
          actionDescription: 'Kê khai đúng kỳ, chỉ đạo KTT lập sẵn Bộ chứng cứ 4 lớp (HĐ, phiếu kho, tiến độ) để sẵn sàng giải trình với Thuế',
          resultingAction: 'ACCEPT_WITH_DEFENSE_DOSSIER'
        },
        {
          id: 'B',
          label: 'Rà soát lại tiến độ nhận hàng thực tế',
          actionDescription: 'Chuyển bộ phận Thu mua kiểm tra đối soát biên bản nghiệm thu trước khi hạch toán',
          resultingAction: 'FORWARD_TO_CFO'
        }
      ],
      requiresCFO: true,
      timestamp
    };
  }

  // 2. Kiểm tra Nhóm 3: Vượt thẩm quyền Kế toán trưởng (>= hạn mức KTT, mặc định 200M)
  if (Math.abs(inv.totalAmount) >= kttApprovalLimit) {
    if (inv.isAdjustment) {
      return {
        status: 'ESCALATED',
        riskGroup: 'EXCEED_AUTHORITY',
        invoiceId: inv.id,
        supplierName: inv.supplierName,
        totalAmount: inv.totalAmount,
        taxRate: inv.taxRate,
        flaggedReason: 'Hóa đơn điều chỉnh/giảm giá thương mại đạt ' + Math.abs(inv.totalAmount).toLocaleString('vi-VN') + '₫, vượt hạn mức ' + (kttApprovalLimit / 1_000_000) + 'M của KTT',
        plainExplanation: 'Số tiền điều chỉnh giảm doanh thu/chiết khấu vượt quá thẩm quyền tự duyệt của Kế toán trưởng, quy chế yêu cầu Giám đốc Tài chính (CFO) phê duyệt.',
        sopClause: 'Điều 3.3 Quy chế Tax-SOP-2026',
        actionableQuestion: 'Hóa đơn điều chỉnh ' + inv.invoiceNumber + ' từ ' + inv.supplierName + ' trị giá ' + inv.totalAmount.toLocaleString('vi-VN') + '₫ vượt hạn mức KTT. CFO phê duyệt ghi nhận?',
        options: [
          {
            id: 'A',
            label: 'CFO Phê duyệt ghi nhận',
            actionDescription: 'Chấp thuận điều chỉnh giảm doanh thu/thuế đầu vào theo quy chế',
            resultingAction: 'ACCEPT_ADJUSTMENT'
          },
          {
            id: 'B',
            label: 'Từ chối, yêu cầu kiểm toán lại',
            actionDescription: 'Tạm chặn ghi nhận, chuyển Ban Kiểm soát đối soát hợp đồng thương mại',
            resultingAction: 'REJECT_TAX_DEDUCTION'
          }
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
      flaggedReason: 'Khoản chi đặc thù vượt hạn mức tự duyệt của KTT (>= ' + (kttApprovalLimit / 1_000_000) + ' triệu)',
      plainExplanation: 'Khoản chi lớn vượt thẩm quyền tự duyệt của Kế toán trưởng, cần chữ ký phê duyệt chi của Giám đốc Tài chính (CFO) hoặc Tổng Giám đốc.',
      sopClause: 'Điều 3.3 Quy chế Tax-SOP-2026',
      actionableQuestion: 'Khoản chi ' + inv.itemName + ' trị giá ' + inv.totalAmount.toLocaleString('vi-VN') + '₫ vượt trần KTT. CFO có chấp thuận phê duyệt chi và khấu trừ thuế?',
      options: [
        {
          id: 'A',
          label: 'CFO Phê duyệt chi',
          actionDescription: 'Chấp thuận chi phí và đưa vào khấu trừ thuế hợp lệ',
          resultingAction: 'FORWARD_TO_CFO'
        },
        {
          id: 'B',
          label: 'Yêu cầu thẩm tra hợp đồng',
          actionDescription: 'Tạm dừng hạch toán để thẩm tra điều khoản thanh toán',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: true,
      timestamp
    };
  }

  // 3. Kiểm tra Nhóm 2: Nằm ngoài phạm vi quy định (Out of Policy)
  // IMP-12: Kiểm tra Tiền lệ được phê duyệt bởi CFO (AI Feedback Loop)
  const activePrecedent = findPrecedentForInvoice(inv, 'OUT_OF_POLICY');

  // 3a. Hóa đơn từ ngưỡng không tiền mặt trở lên (mặc định 5M) nhưng thanh toán TIỀN MẶT
  const isCashPayment = inv.paymentMethod === 'CASH' || !inv.hasBankSlip;
  if (inv.totalAmount >= nonCashThreshold && isCashPayment) {
    if (activePrecedent) {
      return {
        status: 'ROUTINE',
        invoiceId: inv.id,
        supplierName: inv.supplierName,
        totalAmount: inv.totalAmount,
        appliedTaxRate: inv.taxRate,
        approvedTaxAmount: inv.taxAmount,
        plainExplanation: 'Duyệt theo Tiền lệ Ngoại lệ của CFO (#' + activePrecedent.id + '): ' + activePrecedent.rationale,
        kFactorAfter: calculateKFactor(inv.preTaxAmount, kSafeMin, kSafeMax, macroState).kFactor,
        applicableRegulations: regInfo.applicableRegulations.map(r => r.code),
        sopVersion: 'TAX-SOP-2026-v2.5',
        precedentApplied: {
          precedentId: activePrecedent.id,
          approvedBy: activePrecedent.approvedBy,
          rationale: activePrecedent.rationale
        },
        timestamp
      };
    }

    // Kiểm tra ngoại lệ hoàn ứng nhân viên hợp pháp
    const isStaffException = allowStaffReimbursement && inv.isStaffReimbursed;
    if (!isStaffException) {
      return {
        status: 'ESCALATED',
        riskGroup: 'OUT_OF_POLICY',
        invoiceId: inv.id,
        supplierName: inv.supplierName,
        totalAmount: inv.totalAmount,
        taxRate: inv.taxRate,
        flaggedReason: 'Hóa đơn từ ' + (nonCashThreshold / 1_000_000) + ' triệu đồng thanh toán TIỀN MẶT (vi phạm điều kiện khấu trừ thuế GTGT và chi phí TNDN)',
        plainExplanation: 'Luật thuế quy định hóa đơn từng lần từ ' + (nonCashThreshold / 1_000_000) + ' triệu VNĐ trở lên bắt buộc phải có chứng từ thanh toán không dùng tiền mặt (Ủy nhiệm chi ngân hàng) để được khấu trừ.',
        sopClause: 'Khoản 2 Điều 14 Luật Thuế GTGT 48/2024/QH15 & Điều 1.2 Tax-SOP-2026',
        actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' trị giá ' + inv.totalAmount.toLocaleString('vi-VN') + '₫ thanh toán Tiền mặt. Kế toán trưởng xử lý thế nào?',
        options: [
          {
            id: 'A',
            label: 'Yêu cầu nộp Ủy nhiệm chi ngân hàng',
            actionDescription: 'Tạm treo hóa đơn, yêu cầu nhân viên thanh toán bổ sung UNC',
            resultingAction: 'REQUEST_SUPPLIER_REISSUE'
          },
          {
            id: 'B',
            label: 'Loại trừ thuế GTGT & Chuyển sang Chỉ tiêu B4',
            actionDescription: 'Chỉ ghi nhận chi phí nội bộ, loại toàn bộ tiền thuế và chi phí khỏi quyết toán thuế',
            resultingAction: 'REJECT_TAX_DEDUCTION'
          }
        ],
        requiresCFO: false,
        timestamp
      };
    }
  }

  // 3b. Hàng hóa cấm khấu trừ (Rượu, bia, dịch vụ giải trí cá nhân không phục vụ SXKD)
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
      plainExplanation: 'Tiền mua rượu bia liên hoan không được khấu trừ thuế GTGT và không được tính vào chi phí được trừ khi tính thuế TNDN (phải đưa vào Chỉ tiêu B4).',
      sopClause: 'Điều 2.1 Quy chế Tax-SOP-2026 & Luật Thuế TNDN 67/2025/QH15',
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' có mục đồ uống có cồn (' + inv.totalAmount.toLocaleString('vi-VN') + '₫). KTT xử lý thế nào?',
      options: [
        {
          id: 'A',
          label: 'Loại bỏ toàn bộ thuế & Chi phí',
          actionDescription: 'Không đưa vào sổ sách khấu trừ thuế của công ty',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        },
        {
          id: 'B',
          label: 'Khấu trừ phần ăn, bóc tách loại phần rượu',
          actionDescription: 'Tách chi phí ăn uống tiếp khách hợp lệ, tự loại phần thuế rượu bia sang Chỉ tiêu B4',
          resultingAction: 'ACCEPT_WITH_DOCS'
        }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 3c. Hàng hóa/dịch vụ thuộc danh mục loại trừ nhưng áp sai thuế suất 8% theo NQ 204/2025
  const excludedCategories = (config?.excludedVat8Categories ?? [
    'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
    'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
  ]).map((value) => value.trim().toLocaleUpperCase('vi-VN')).filter(Boolean);
  const normalizedItemName = inv.itemName.toLocaleUpperCase('vi-VN');
  const isExcludedItem = excludedCategories.some((category) => normalizedItemName.includes(category)) || /CƯỚC INTERNET/.test(normalizedItemName);
  if ((isExcludedItem && inv.taxRate === 8) || lineItemResult.hasExcludedVat8Item) {
    if (activePrecedent) {
      return {
        status: 'ROUTINE',
        invoiceId: inv.id,
        supplierName: inv.supplierName,
        totalAmount: inv.totalAmount,
        appliedTaxRate: inv.taxRate,
        approvedTaxAmount: inv.taxAmount,
        plainExplanation: 'Duyệt theo Tiền lệ Ngoại lệ của CFO (#' + activePrecedent.id + '): ' + activePrecedent.rationale,
        kFactorAfter: calculateKFactor(inv.preTaxAmount, kSafeMin, kSafeMax, macroState).kFactor,
        applicableRegulations: regInfo.applicableRegulations.map(r => r.code),
        sopVersion: 'TAX-SOP-2026-v2.5',
        precedentApplied: {
          precedentId: activePrecedent.id,
          approvedBy: activePrecedent.approvedBy,
          rationale: activePrecedent.rationale
        },
        lineItemAnalysis,
        timestamp
      };
    }

    const flagMsg = lineItemResult.hasExcludedVat8Item
      ? 'Phát hiện mặt hàng trong chi tiết dòng hàng thuộc danh mục loại trừ áp sai thuế suất 8% (NQ 204/2025/QH15)'
      : 'Hàng hóa/dịch vụ thuộc danh mục loại trừ áp sai thuế suất 8% (thuộc danh mục loại trừ bắt buộc 10% theo NQ 204/2025/QH15)';

    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: flagMsg,
      plainExplanation: 'Bên bán xuất hóa đơn thuế suất ưu đãi 8% cho mặt hàng thuộc danh mục loại trừ không được giảm thuế theo Nghị quyết 204/2025/QH15 (phải áp dụng 10%). Kê khai 8% sẽ bị phạt 20% khi thanh tra thuế.',
      sopClause: 'Điều 1.3 Quy chế Tax-SOP-2026 & Nghị quyết 204/2025/QH15',
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' từ ' + inv.supplierName + ' áp sai thuế 8% (phải là 10%). KTT xử lý thế nào?',
      options: [
        {
          id: 'A',
          label: 'Yêu cầu nhà cung cấp xuất lại HĐ 10%',
          actionDescription: 'Trả lại hóa đơn, yêu cầu bên bán lập hóa đơn thay thế hoặc điều chỉnh thuế 10%',
          resultingAction: 'REQUEST_SUPPLIER_REISSUE'
        },
        {
          id: 'B',
          label: 'Loại phần thuế khỏi khấu trừ',
          actionDescription: 'Hạch toán chi phí nội bộ nhưng không kê khai số thuế đầu vào sai phạm này',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false,
      lineItemAnalysis,
      timestamp
    };
  }

  // 3d. Nhà cung cấp lập hóa đơn SAU ngày bị cơ quan thuế đóng MST / bỏ trốn
  if (inv.sellerStatus === 'CLOSED' && inv.sellerSuspensionDate && inv.invoiceDate > inv.sellerSuspensionDate) {
    return {
      status: 'ESCALATED',
      riskGroup: 'OUT_OF_POLICY',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hóa đơn lập ngày ' + inv.invoiceDate + ', SAU ngày người bán bị đóng MST (' + inv.sellerSuspensionDate + ')',
      plainExplanation: 'Nhà cung cấp đã chấm dứt hiệu lực mã số thuế trước khi phát hành hóa đơn này. Hóa đơn bất hợp pháp 100% theo quy định hóa đơn điện tử.',
      sopClause: 'Điều 2.2 Quy chế Tax-SOP-2026 & Nghị định 254/2026/NĐ-CP',
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' phát hành sau ngày bên bán đóng MST (' + inv.sellerSuspensionDate + '). Hệ thống khuyến nghị loại bỏ ngay. KTT xác nhận?',
      options: [
        {
          id: 'A',
          label: 'Loại bỏ ngay lập tức (Khuyến nghị)',
          actionDescription: 'Tuyệt đối cấm kê khai để tránh rủi ro vi phạm tội trốn thuế',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        },
        {
          id: 'B',
          label: 'Chuyển Ban Pháp chế điều tra đối tác',
          actionDescription: 'Tạm giữ hồ sơ để bộ phận pháp chế làm việc với nhà cung cấp',
          resultingAction: 'FORWARD_TO_CFO'
        }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4. Kiểm tra Nhóm 1: Chưa xác định được thông tin thực tế (Uncertain Info)
  // 4a. Ảnh hóa đơn bị mờ số tiền, OCR không tin cậy
  if (inv.isImageBlurry) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hình ảnh hóa đơn bị mờ/lóa dòng tổng tiền, OCR không nhận diện chắc chắn',
      plainExplanation: 'Chứng từ ảnh chụp/scan bị mờ nét số tiền thanh toán. Cần Kế toán trưởng nhìn mắt thường để xác nhận con số chuẩn.',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026',
      actionableQuestion: 'Hóa đơn taxi ' + inv.invoiceNumber + ' bị mờ số tiền, hệ thống nhận diện hai khả năng là 140.000₫ hoặc 190.000₫. KTT chọn con số nào?',
      options: [
        {
          id: 'A',
          label: 'Xác nhận số tiền là 140.000₫',
          actionDescription: 'Ghi nhận số tiền nhỏ hơn để an toàn chi phí',
          resultingAction: 'ACCEPT_WITH_DOCS'
        },
        {
          id: 'B',
          label: 'Xác nhận số tiền là 190.000₫',
          actionDescription: 'Ghi nhận số tiền đúng theo thực tế cuốc xe sau khi xem lại bản gốc',
          resultingAction: 'ACCEPT_WITH_DOCS'
        }
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
      plainExplanation: 'Hóa đơn ghi tên dịch vụ/hàng hóa chung chung và thiếu bảng kê chi tiết từng món. Cơ quan thuế sẽ loại chi phí khi kiểm tra nếu không có bảng kê.',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026',
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' (' + inv.totalAmount.toLocaleString('vi-VN') + '₫) thiếu bảng kê chi tiết. KTT xử lý thế nào?',
      options: [
        {
          id: 'A',
          label: 'Tạm treo, yêu cầu bổ sung bảng kê',
          actionDescription: 'Gửi yêu cầu cho nhân viên mua hàng nộp bảng kê trước khi duyệt',
          resultingAction: 'REQUEST_SUPPLIER_REISSUE'
        },
        {
          id: 'B',
          label: 'Loại khỏi đợt kê khai thuế quý này',
          actionDescription: 'Tạm thời chưa đưa vào kê khai khấu trừ',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 4c. Hóa đơn điều chỉnh nhưng không tìm thấy số hóa đơn gốc (Nghị định 254/2026/NĐ-CP)
  if (inv.isAdjustment && !inv.originalInvoiceRef) {
    return {
      status: 'ESCALATED',
      riskGroup: 'UNCERTAIN_INFO',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      taxRate: inv.taxRate,
      flaggedReason: 'Hóa đơn điều chỉnh nhưng không tìm thấy số hóa đơn gốc trong CSDL nội bộ',
      plainExplanation: 'Hóa đơn ghi là điều chỉnh giảm tiền nhưng hệ thống không tìm thấy hóa đơn gốc tương ứng theo quy định tại Nghị định 254/2026/NĐ-CP.',
      sopClause: 'Điều 1.4 Quy chế Tax-SOP-2026 & Nghị định 254/2026/NĐ-CP',
      actionableQuestion: 'Hóa đơn điều chỉnh ' + inv.invoiceNumber + ' không tìm thấy số hóa đơn gốc. KTT xử lý thế nào?',
      options: [
        {
          id: 'A',
          label: 'Tạm treo chờ tra soát hóa đơn gốc',
          actionDescription: 'Liên hệ kế toán đối tác để xác minh số hóa đơn gốc đã phát hành',
          resultingAction: 'REQUEST_SUPPLIER_REISSUE'
        },
        {
          id: 'B',
          label: 'Từ chối tiếp nhận hóa đơn này',
          actionDescription: 'Bác bỏ hóa đơn điều chỉnh không rõ nguồn gốc',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
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
      flaggedReason: 'Nhà cung cấp đã đóng MST ngày ' + inv.sellerSuspensionDate + ', nhưng hóa đơn lập ngày ' + inv.invoiceDate + ' (Trước ngày đóng)',
      plainExplanation: 'Đối tác hiện đã đóng mã số thuế nhưng tại thời điểm giao dịch họ vẫn đang hoạt động bình thường. Giao dịch vẫn hợp lệ nếu có đầy đủ hồ sơ chứng minh hàng hóa có thật.',
      sopClause: 'Điều 2.2 Quy chế Tax-SOP-2026',
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' lập trước ngày người bán đóng MST. Giao dịch hợp lệ nếu đủ hồ sơ kho. KTT quyết định?',
      options: [
        {
          id: 'A',
          label: 'Xác nhận đủ hồ sơ, tiếp tục kê khai',
          actionDescription: 'Tập hợp hợp đồng, phiếu nhập kho thực tế, UNC và đưa vào khấu trừ',
          resultingAction: 'ACCEPT_WITH_DOCS'
        },
        {
          id: 'B',
          label: 'Loại bỏ chi phí để an toàn tối đa',
          actionDescription: 'Chấp nhận loại trừ chi phí để tránh phải giải trình khi thanh tra thuế',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false,
      timestamp
    };
  }

  // 5. Nếu không vướng bất kỳ điều kiện nào ở trên -> DUYỆT THƯỜNG QUY 100% (ROUTINE)
  const approvedTax = inv.taxAmount;
  const newK = calculateKFactor(inv.preTaxAmount, kSafeMin, kSafeMax, macroState).kFactor;

  return {
    status: 'ROUTINE',
    invoiceId: inv.id,
    supplierName: inv.supplierName,
    totalAmount: inv.totalAmount,
    appliedTaxRate: inv.taxRate,
    approvedTaxAmount: approvedTax,
    plainExplanation: 'Hóa đơn đáp ứng đầy đủ điều kiện 3H (Hợp pháp - Hợp lệ - Hợp lý), đúng thuế suất, thanh toán không tiền mặt hợp lệ và nằm trong hạn mức thường quy.',
    kFactorAfter: newK,
    lineItemAnalysis,
    timestamp
  };
}

// Hàm đối soát hóa đơn công khai đính kèm context văn bản pháp quy theo ngày lập và cấu hình quy định động
export function evaluateInvoiceLocally(
  inv: InvoiceInput,
  customConfig?: Partial<SystemPolicyConfig>,
  customSopVersion: string = 'TAX-SOP-2026 v2.5',
  macroState?: Pick<MacroState, 'totalSales' | 'openingInventory' | 'totalPurchases'>
): RefereeDecision {
  const regInfo = getApplicableRegulations(inv.invoiceDate);
  const applicableDecreeCodes = regInfo.applicableRegulations.map((d) => d.code);
  const decision = evaluateInvoiceLocallyInternal(inv, customConfig, macroState);

  return {
    ...decision,
    applicableRegulations: applicableDecreeCodes,
    sopVersion: customSopVersion
  } as RefereeDecision;
}

function getDataQualityIssue(inv: InvoiceInput): string | null {
  const date = new Date(`${inv.invoiceDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== inv.invoiceDate) return 'Ngày hóa đơn không hợp lệ hoặc không thể đối chiếu văn bản có hiệu lực.';
  const expectedTax = Math.round(inv.preTaxAmount * inv.taxRate / 100);
  const expectedTotal = inv.preTaxAmount + inv.taxAmount;
  if (Math.abs(inv.taxAmount - expectedTax) > 1 || Math.abs(inv.totalAmount - expectedTotal) > 1) {
    return 'Các số tiền trên hóa đơn không nhất quán với tiền trước thuế và thuế suất; cần xác nhận lại chứng từ gốc.';
  }
  if (inv.isImageBlurry) return 'Ảnh hóa đơn bị mờ, chưa thể xác nhận chính xác dữ liệu thực tế.';
  if (!inv.paymentMethod || inv.hasBankSlip === undefined || inv.hasItemManifest === undefined || inv.sellerStatus === 'UNKNOWN') {
    return 'Hóa đơn còn thiếu dữ liệu nguồn về thanh toán, bảng kê hoặc trạng thái mã số thuế nhà cung cấp.';
  }
  return null;
}

function uncertainDecision(inv: InvoiceInput, reason: string, timestamp: string): RefereeDecision {
  return {
    status: 'ESCALATED',
    riskGroup: 'UNCERTAIN_INFO',
    invoiceId: inv.id,
    supplierName: inv.supplierName,
    totalAmount: inv.totalAmount,
    taxRate: inv.taxRate,
    flaggedReason: reason,
    plainExplanation: 'Hệ thống chưa đủ dữ liệu chắc chắn để khẳng định hóa đơn hợp lệ. Cần người phụ trách kiểm tra và xác nhận trước khi xử lý tiếp.',
    sopClause: 'Quy trình kiểm soát dữ liệu đầu vào Tax-SOP-2026',
    actionableQuestion: `Hóa đơn ${inv.invoiceNumber} từ ${inv.supplierName} cần xác minh: ${reason} KTT chọn tiếp tục bổ sung hồ sơ hay tạm dừng xử lý?`,
    options: [
      {
        id: 'A',
        label: 'Bổ sung và xác nhận hồ sơ',
        actionDescription: 'Tạm treo quyết định và yêu cầu bổ sung dữ liệu/chứng từ còn thiếu.',
        resultingAction: 'REQUEST_SUPPLIER_REISSUE'
      },
      {
        id: 'B',
        label: 'Tạm dừng xử lý',
        actionDescription: 'Không đưa hóa đơn vào đề xuất khấu trừ cho đến khi có bằng chứng hợp lệ.',
        resultingAction: 'REJECT_TAX_DEDUCTION'
      }
    ],
    requiresCFO: false,
    timestamp
  };
}
