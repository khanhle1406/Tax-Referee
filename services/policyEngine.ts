import { ActionOption, InvoiceInput, InvoiceLineItem, LineItemAnalysis, MacroState, RefereeDecision, RuleFinding, RuleKind, SystemPolicyConfig } from '@/lib/schemas';
import { MACRO_DEFAULTS } from '@/lib/constants';
import { getApplicableRegulations, isUnverifiedDocument } from '@/data/regulatoryRegistry';
import { headerTaxMatches } from '@/lib/invoiceMath';
import { checkDuplicateInvoice } from '@/services/duplicateDetector';
import { findPrecedentForInvoice } from '@/services/precedentService';
import { getSupplier } from '@/services/supplierService';
import { checkSameDayMultipleInvoicesRule } from '@/services/bankMatcherService';
import { getDatabase } from '@/lib/server/db';
import {missingBusinessFacts,needsItemManifest,paymentThreshold} from '@/lib/refereeRequirements';
import {buildHandoff,describeRuleEvidence} from './handoffService';
import {concreteIssue} from './questionBuilder';
import {groupOf,orderFindings,riskGroupsOf} from '@/lib/riskTaxonomy';
import {fieldLabels} from '@/lib/workflowPresentation';
import {buyerTaxCodeBasis,cashPaymentBasis,closedSellerBasis,inSentence,invoiceFrameworkAt,sameDayCashBasis,seriesYearBasis,signingBasis,taxAuthorityCodeBasis,vat8Basis,vat8ExcludedPhrases,vatReductionAt} from '@/lib/legalBasis';

/** Cụm từ chứa từ khóa loại trừ nhưng là hàng hóa thông thường (VD "mũ bảo hiểm" không phải dịch vụ bảo hiểm). */
const VAT8_NOT_EXCLUDED=['MŨ BẢO HIỂM','NÓN BẢO HIỂM','KÍNH BẢO HIỂM','GĂNG TAY BẢO HIỂM',
  // Dịch vụ liên quan ô tô không phải hàng chịu thuế TTĐB (chỉ bản thân chiếc xe mới chịu TTĐB).
  'THUÊ XE Ô TÔ','THUÊ Ô TÔ','SỬA CHỮA Ô TÔ','SỬA CHỮA XE Ô TÔ','BẢO DƯỠNG Ô TÔ','BẢO DƯỠNG XE Ô TÔ','RỬA XE Ô TÔ','GỬI XE Ô TÔ','VẬN CHUYỂN BẰNG Ô TÔ','PHỤ TÙNG Ô TÔ','LỐP Ô TÔ',
  // Thuê nhà hàng (dịch vụ ăn uống/hội nghị) không phải kinh doanh bất động sản.
  'THUÊ NHÀ HÀNG'];
/** Ô tô tải thông thường không chịu TTĐB; pick-up cabin kép và ô tô tải VAN (từ hai hàng ghế) chịu TTĐB nên vẫn bị loại khỏi 8%. */
// "Ô TÔ BÁN TẢI" chỉ được coi là ô tô tải khi không còn dấu hiệu xe chịu TTĐB (tức đã ghi cabin đơn).
const TRUCK_NOT_EXCLUDED=['XE Ô TÔ TẢI','Ô TÔ TẢI','XE O TO TAI','O TO TAI','XE Ô TÔ BÁN TẢI','Ô TÔ BÁN TẢI'];
/** Xe chịu TTĐB gọi theo tên thông dụng, không có chữ "ô tô" (VD "xe bán tải cabin kép"): bị loại khỏi 8% ở mọi kỳ. */
const TTDB_DOUBLE_CAB=['CABIN KÉP','CA BIN KÉP','DOUBLE CAB'];
const TTDB_VAN=['TẢI VAN','Ô TÔ VAN'];
/** Bán tải/pick-up cabin đơn là ô tô tải, không buộc loại (cabin kép vẫn thắng nếu cùng xuất hiện). */
const SINGLE_CAB=['CABIN ĐƠN','CA BIN ĐƠN','SINGLE CAB'];
/** "PICK UP" là tên xe (VD "Ford Ranger Pickup", "xe pick-up") trừ ngữ cảnh dịch vụ lấy hàng/đón khách: "phí pick-up hàng", "dịch vụ pick up", "pick up khách". */
const PICKUP_SERVICE=/(?<![\p{L}\p{N}])(?:(?:PHÍ|PHI|DỊCH VỤ|DICH VU|CƯỚC|CUOC)(?: [\p{L}\p{N}]+)? (?:PICK UP|PICKUP)|(?:PICK UP|PICKUP) (?:HÀNG|HANG|KHÁCH|KHACH))(?![\p{L}\p{N}])/gu;
const PICKUP_WORD=/(?<![\p{L}\p{N}])(?:PICK UP|PICKUP)(?![\p{L}\p{N}])/u;
/** Dịch vụ/phụ tùng cho xe bán tải, pick-up (sửa chữa, bảo dưỡng, thuê, phụ tùng, lốp, rửa xe) không phải bản thân chiếc xe chịu TTĐB: bỏ cả cụm, kể cả loại cabin đi kèm. */
const TRUCK_SERVICE=/(?<![\p{L}\p{N}])(?:SỬA CHỮA|SUA CHUA|BẢO DƯỠNG|BAO DUONG|THUÊ|THUE|PHỤ TÙNG|PHU TUNG|LỐP|LOP|RỬA|RUA)(?: (?:XE|Ô TÔ|O TO|TẢI|TAI))* (?:BÁN TẢI|BAN TAI|PICK UP|PICKUP)(?: (?:CABIN|CA BIN) (?:KÉP|KEP|ĐƠN|DON)| DOUBLE CAB| SINGLE CAB)?(?![\p{L}\p{N}])/gu;
/**
 * Nhận diện xe chịu TTĐB trên tên hàng ĐÃ bỏ cụm dịch vụ (TRUCK_SERVICE, VAT8_NOT_EXCLUDED): "sửa chữa xe bán tải" không phải bán xe.
 * truckSignal tắt miễn trừ "ô tô tải"; "XE VAN" chỉ tắt miễn trừ (không buộc loại) vì không dấu trùng "xe vận".
 */
function ttdbVehicle(textUpper:string):{excluded:boolean;truckSignal:boolean} {
  // Bỏ dấu câu trước khi nhận diện: "(VAN)", "ca-bin kép", "pick-up" vẫn được nhận ra.
  const words=VAT8_NOT_EXCLUDED.reduce((acc,phrase)=>acc.split(phrase).join(' '),textUpper.replace(/[^\p{L}\p{N}]+/gu,' ').replace(TRUCK_SERVICE,' '));
  const any=(list:string[])=>list.some(k=>matchesKeyword(words,k));
  const pickup=matchesKeyword(words,'BÁN TẢI') || PICKUP_WORD.test(words.replace(PICKUP_SERVICE,' '));
  const excluded=any(TTDB_DOUBLE_CAB) || any(TTDB_VAN) || (pickup && !any(SINGLE_CAB));
  return {excluded,truckSignal:excluded || matchesKeyword(words,'XE VAN')};
}
/** Văn phòng phẩm gõ không dấu ("bia ho so") — dạng bỏ dấu của "BIA" không được coi là đồ uống có cồn. */
// Chỉ cụm không mơ hồ: "bia so 1", "bia lo 24 chai", "bia cung cap…" vẫn là bia.
const BENIGN_UNACCENTED=['BIA HO SO','BIA NHUA','BIA KEP','BIA TRINH KY','BIA ACCO','BIA CATALOGUE','BIA SO MI'];
const stripBenign=(textUpper:string)=>BENIGN_UNACCENTED.reduce((acc,phrase)=>containsWord(acc,phrase)?acc.split(phrase).join(' '):acc,textUpper);
/**
 * So khớp nguyên cụm từ với danh mục loại trừ 8% CỦA KỲ LẬP HÓA ĐƠN (lib/legalBasis): từ 01/7/2025, NQ 204/2025 cho xăng,
 * nhiên liệu dầu, than, hóa chất, CNTT được giảm 8%; viễn thông, kim loại, hàng chịu TTĐB (trừ xăng) vẫn bị loại.
 */
function isVat8Excluded(textUpper:string,categories:string[],invoiceDate:string):boolean {
  const vehicle=ttdbVehicle(textUpper);
  if(vehicle.excluded)return true;
  const benign=vehicle.truckSignal?VAT8_NOT_EXCLUDED:[...VAT8_NOT_EXCLUDED,...TRUCK_NOT_EXCLUDED];
  const text=benign.reduce((acc,phrase)=>acc.split(phrase).join(' '),stripBenign(textUpper));
  return vat8ExcludedPhrases(invoiceDate,categories).some(phrase=>matchesKeyword(text,phrase));
}
/** Chi tiếp khách/đồ uống có cồn/giải trí (SOP: cần làm rõ mục đích). So khớp nguyên từ để "BAVIA" hay "BÌA" không bị nhầm với "BIA". */
const SENSITIVE_ITEMS=['RƯỢU','BIA','WHISKY','WHISKEY','WINE','VODKA','CHAMPAGNE','BEER','LIQUOR','COCKTAIL','SOJU','SAKE','THUỐC LÁ','CIGAR','KARAOKE','MASSAGE','NHẬU','TIẾP KHÁCH'];
const isSensitiveText=(textUpper:string)=>{const text=stripBenign(textUpper);return SENSITIVE_ITEMS.some(k=>matchesKeyword(text,k));};
/** Khoản chi SOP không bao phủ → không tự duyệt (ngoài phạm vi quy định), dù số liệu hợp lệ. */
// So khớp nguyên từ: "PHẠT" bắt mọi khoản phạt (tiền phạt, phí phạt chậm thanh toán…) mà không nhầm với "PHÁT".
// "Tiệc cưới/người thân" (ca bẫy U2 của buổi thử 16/10) được bổ sung SAU buổi thử: đóng ca bẫy đã công bố trong Proposal.
export const SCOPE_NOT_COVERED_DEFAULT=['TIỆC CƯỚI','ĐÁM CƯỚI','CƯỚI HỎI','NGƯỜI THÂN','NGƯỜI NHÀ','THÂN NHÂN','TÀI TRỢ','TỪ THIỆN','ỦNG HỘ','QUYÊN GÓP','PHẠT','TIỀN PHẠT','PHÍ PHẠT','NỘP PHẠT','PHẠT CHẬM','PHẠT VI PHẠM','BỒI THƯỜNG','QUÀ BIẾU','BIẾU','QUÀ TẶNG','QUÀ TẾT','GIỎ QUÀ','HỘP QUÀ','QUÀ SINH NHẬT','TẶNG KHÁCH','TẶNG ĐỐI TÁC','QUÀ TRUNG THU','CHI PHÍ CÁ NHÂN','CHI CÁ NHÂN','MỤC ĐÍCH CÁ NHÂN','SỬ DỤNG CÁ NHÂN','MỸ PHẨM','DU LỊCH GIA ĐÌNH','CHO GIA ĐÌNH','GIA ĐÌNH GIÁM ĐỐC','HỌC PHÍ','ĐỒ CHƠI','MUA VÀNG','VÀNG MIẾNG','NGOẠI TỆ','CỔ PHIẾU','TRÁI PHIẾU','CHARITY','DONATION','SPONSORSHIP','SPONSOR','GIFT','GIFTS','PENALTY'];
const AMOUNT_TOLERANCE=10;
const isWordChar=(c:string|undefined)=>c!==undefined && /[\p{L}\p{N}]/u.test(c);
/** Tìm nguyên cụm từ (không khớp giữa từ khác). */
/**
 * Dữ kiện tiền chưa chắc: ảnh mờ, hoặc tổng in trên hóa đơn và (tiền hàng + thuế) là hai giá trị khác nhau nằm hai phía
 * một ngưỡng quyết định (hạn mức KTT, ngưỡng tiền mặt). Khi đó không được kết luận "vượt quyền"/"vi phạm" — hỏi số đúng trước.
 */
export function unverifiedAmountFacts(inv:Pick<InvoiceInput,'isImageBlurry'|'totalAmount'|'preTaxAmount'|'taxAmount'>,thresholds:number[]):string[] {
  if(inv.isImageBlurry)return ['preTaxAmount','taxAmount','totalAmount'];
  const printed=Math.abs(inv.totalAmount),computed=Math.abs(inv.preTaxAmount+inv.taxAmount);
  if(Math.abs(printed-computed)<=AMOUNT_TOLERANCE)return [];
  const low=Math.min(printed,computed),high=Math.max(printed,computed);
  return thresholds.some(t=>low<t && high>=t)?['totalAmount']:[];
}
function containsWord(text:string,word:string):boolean {
  for(let i=text.indexOf(word);i>=0;i=text.indexOf(word,i+1))if(!isWordChar(text[i-1]) && !isWordChar(text[i+word.length]))return true;
  return false;
}
const stripMarks=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/Đ/g,'D').replace(/đ/g,'d').normalize('NFC');
/**
 * Khớp nguyên cụm từ. Người dùng gõ không dấu ("tiep khach ruou") thì so thêm dạng bỏ dấu của từ khóa;
 * văn bản có dấu vẫn so chính xác để "BÌA" không bị nhầm thành "BIA".
 */
// Từ mà bỏ dấu sẽ trùng từ thông dụng khác (PHẠT/phát, BIẾU/biểu): chỉ khớp khi có dấu; dạng không dấu dùng cụm rõ nghĩa (TIỀN PHẠT…).
// "TẶNG KHÁCH" bỏ dấu trùng "tăng khách" (VD "chiến dịch tăng khách hàng").
// "TẢI VAN"/"Ô TÔ VAN"/"BÁN TẢI" bỏ dấu trùng "tải vận", "bán tai…".
const AMBIGUOUS_WITHOUT_MARKS=new Set(['PHẠT','BIẾU','TẶNG KHÁCH','TẶNG ĐỐI TÁC','TẢI VAN','Ô TÔ VAN','BÁN TẢI']);
export function matchesKeyword(textUpper:string,keyword:string):boolean {
  if(containsWord(textUpper,keyword))return true;
  if(AMBIGUOUS_WITHOUT_MARKS.has(keyword))return false;
  const plain=stripMarks(textUpper);
  return plain===textUpper.normalize('NFC') && containsWord(plain,stripMarks(keyword));
}

// 0. IMP-08: Hàm Đối soát Chi tiết Dòng hàng & Đa Thuế suất (Line-item Validation Engine)
export interface LineItemValidationResult {
  isValid: boolean;
  totalItems: number;
  flaggedItemsCount: number;
  warnings: string[];
  totalItemAmount: number;
  totalItemTax: number;
  mismatchHeader: boolean;
  lineArithmeticMismatch: boolean;
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
      lineArithmeticMismatch: false,
      hasExcludedVat8Item: false,
      hasSensitiveItem: false
    };
  }

  const excluded = (config?.excludedVat8Categories || [
    'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
    'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
  ]).map(c => c.trim().toLocaleUpperCase('vi-VN'));

  const warnings: string[] = [];
  let flaggedCount = 0;
  let sumAmount = 0;
  let sumTax = 0;
  let hasExcludedVat8Item = false;
  let hasSensitiveItem = false;
  let lineArithmeticMismatch = false;

  for (const item of items) {
    sumAmount += item.amount;
    sumTax += item.taxAmount;
    const nameUpper = item.itemName.normalize('NFC').toLocaleUpperCase('vi-VN');

    // 1. Kiểm tra tính toán số học từng dòng (dung sai làm tròn 1.000đ)
    const expectedAmount = item.quantity * item.unitPrice - (item.discountAmount || 0);
    if (Math.abs(item.amount - expectedAmount) > 1000) {
      lineArithmeticMismatch = true;
      warnings.push(`Dòng ${item.lineNumber} [${item.itemName}]: Thành tiền (${item.amount.toLocaleString('vi-VN')}₫) lệch so với số lượng x đơn giá (${expectedAmount.toLocaleString('vi-VN')}₫).`);
      flaggedCount++;
      item.flaggedReason = 'Lệch số học thành tiền';
    }
    const expectedItemTax=Math.round(item.amount*item.taxRate/100);
    if(Math.abs(item.taxAmount-expectedItemTax)>AMOUNT_TOLERANCE){
      lineArithmeticMismatch=true;flaggedCount++;
      warnings.push(`Dòng ${item.lineNumber} [${item.itemName}]: Tiền thuế ${item.taxAmount.toLocaleString('vi-VN')}₫ lệch so với thành tiền × thuế suất (${expectedItemTax.toLocaleString('vi-VN')}₫).`);
    }

    // 2. Rà soát danh mục loại trừ thuế suất 8% (Nghị quyết 204/2025/QH15)
    if (item.taxRate === 8) {
      const isExcluded = isVat8Excluded(nameUpper, excluded, inv.invoiceDate);
      if (isExcluded) {
        warnings.push(`Dòng ${item.lineNumber} [${item.itemName}]: Mặt hàng thuộc danh mục loại trừ nhưng đang áp thuế suất ưu đãi 8% thay vì 10% (${vat8Basis(inv.invoiceDate)}).`);
        flaggedCount++;
        hasExcludedVat8Item = true;
        item.isExcludedCategory = true;
        item.flaggedReason = `Sai thuế suất 8% theo ${vat8Basis(inv.invoiceDate)}`;
      }
    }

    // 3. Phát hiện chi phí nhạy cảm không phục vụ SXKD
    const isSensitive = isSensitiveText(nameUpper);
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
    lineArithmeticMismatch,
    hasExcludedVat8Item,
    hasSensitiveItem
  };
}

// Tính toán Tham số nguồn hàng K thời gian thực (ngưỡng nội bộ Điều 4.3 Tax-SOP-2026)
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

interface EvaluatedFinding extends RuleFinding {
  sopClause: string;
  actionableQuestion: string;
  options: [ActionOption, ActionOption];
  requiresCFO?: boolean;
}

// Hàm đối soát hóa đơn nội bộ theo Tax-SOP-2026 và Khung Pháp lý Hiện hành
// P0-3: Bộ máy Quy tắc thu thập mọi phát hiện (Multi-finding Collection Engine)
function evaluateInvoiceLocallyInternal(
  inv: InvoiceInput,
  config?: Partial<SystemPolicyConfig>,
  macroState?: Pick<MacroState, 'totalSales' | 'openingInventory' | 'totalPurchases'>,
  contextInvoices?: InvoiceInput[]
): RefereeDecision {
  const timestamp = new Date().toISOString();
  const regInfo = getApplicableRegulations(inv.invoiceDate);
  const evaluatedFindings: EvaluatedFinding[] = [];

  // Thiết lập các ngưỡng theo cấu hình động hoặc mặc định pháp luật 2026
  const nonCashThreshold = paymentThreshold(inv,config);
  const kttApprovalLimit = config?.kttApprovalLimit ?? 200_000_000;
  const kSafeMin = config?.kFactorSafeMin ?? 1.05;
  const kSafeMax = config?.kFactorSafeMax ?? 1.25;
  const isExceedKtt = Math.abs(inv.totalAmount) >= kttApprovalLimit;
  const registeredSupplier=getSupplier(inv.supplierTaxCode);
  if(registeredSupplier && ['CLOSED','SUSPENDED'].includes(registeredSupplier.status))inv.sellerStatus=registeredSupplier.status as 'CLOSED'|'SUSPENDED';

  // 1. STATUTORY: Kiểm tra hóa đơn trùng lặp tiền hạch toán (IMP-13)
  const duplicate = checkDuplicateInvoice(inv);
  if (duplicate.isDuplicate) {
    evaluatedFindings.push({
      ruleId: 'RULE_DUPLICATE_INVOICE',
      kind: 'STATUTORY',
      severity: 'CRITICAL',
      riskGroup: 'OUT_OF_POLICY',
      flaggedReason: duplicate.duplicateReason || 'Phát hiện hóa đơn trùng lặp số chứng từ trong hệ thống',
      plainExplanation: 'Hóa đơn này có số hiệu trùng với chứng từ đã tiếp nhận trước đó. Cần KTT xác minh để tránh rủi ro kê khai trùng thuế GTGT.',
      legalBasis: 'Điều 1.1 & Điều 3.4 Quy chế Tax-SOP-2026 (Chống trùng lặp HĐĐT)',
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
      requiresCFO: false
    });
  }

  // 2. DATA_QUALITY: Thẩm định chi tiết dòng hàng & đa thuế suất (IMP-08)
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

  if (lineItemResult.mismatchHeader || lineItemResult.lineArithmeticMismatch) {
    evaluatedFindings.push({
      ruleId: 'RULE_LINE_ITEM_MISMATCH',
      kind: 'DATA_QUALITY',
      severity: 'HIGH',
      riskGroup: 'UNCERTAIN_INFO',
      flaggedReason: lineItemResult.mismatchHeader?`Tổng cộng các dòng hàng (${lineItemResult.totalItemAmount.toLocaleString('vi-VN')}₫) không khớp với số tiền trước thuế trên hóa đơn (${inv.preTaxAmount.toLocaleString('vi-VN')}₫)`:lineItemResult.warnings.filter(w=>w.startsWith('Dòng')).join('; '),
      plainExplanation: 'Số liệu dòng hàng hoặc tổng hợp chưa nhất quán; cần đối chiếu chứng từ gốc trước khi tự xử lý.',
      legalBasis: 'Điều 1.1 Quy chế Tax-SOP-2026 (Tính toàn vẹn số liệu dòng hàng)',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026 (Tính toàn vẹn số liệu dòng hàng)',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} có tổng dòng hàng (${lineItemResult.totalItemAmount.toLocaleString('vi-VN')}₫) lệch so với Header (${inv.preTaxAmount.toLocaleString('vi-VN')}₫). KTT xử lý thế nào?`,
      options: [
        {
          id: 'A',
          label: 'Yêu cầu nhà cung cấp lập biên bản điều chỉnh',
          actionDescription: 'Tạm treo hóa đơn, yêu cầu NCC kiểm tra lại phần mềm xuất hóa đơn và điều chỉnh',
          resultingAction: 'REQUEST_INFORMATION'
        },
        {
          id: 'B',
          label: 'Từ chối tiếp nhận hóa đơn',
          actionDescription: 'Hủy tiếp nhận hóa đơn có sai lệch số liệu nội tại',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false
    });
  }

  // 3. DATA_QUALITY: Kiểm tra chất lượng dữ liệu nguồn
  const dailyTotal = sameDayPurchaseTotal(inv,contextInvoices);
  const issue = getDataQualityIssue(inv,config,dailyTotal);
  if (issue) {
    evaluatedFindings.push({
      ruleId: 'RULE_DATA_QUALITY',
      kind: 'DATA_QUALITY',
      severity: 'HIGH',
      riskGroup: 'UNCERTAIN_INFO',
      flaggedReason: issue,
      plainExplanation: 'Hệ thống chưa đủ dữ liệu chắc chắn để khẳng định hóa đơn hợp lệ. Cần người phụ trách kiểm tra và xác nhận trước khi xử lý tiếp.',
      legalBasis: 'Quy trình kiểm soát dữ liệu đầu vào Tax-SOP-2026',
      sopClause: 'Quy trình kiểm soát dữ liệu đầu vào Tax-SOP-2026',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} từ ${inv.supplierName} cần xác minh: ${issue} KTT chọn tiếp tục bổ sung hồ sơ hay tạm dừng xử lý?`,
      options: [
        {
          id: 'A',
          label: 'Bổ sung và xác nhận hồ sơ',
          actionDescription: 'Tạm treo quyết định và yêu cầu bổ sung dữ liệu/chứng từ còn thiếu.',
          resultingAction: 'REQUEST_INFORMATION'
        },
        {
          id: 'B',
          label: 'Không đủ căn cứ — không khấu trừ hóa đơn này',
          actionDescription: 'Không đưa hóa đơn vào đề xuất khấu trừ; lưu lý do.',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false
    });
  }

  // 4. DATA_QUALITY: Người bán bị tạm ngừng
  if (inv.sellerStatus === 'SUSPENDED') {
    evaluatedFindings.push({
      ruleId: 'RULE_SELLER_SUSPENDED',
      kind: 'DATA_QUALITY',
      severity: 'HIGH',
      riskGroup: 'UNCERTAIN_INFO',
      flaggedReason: 'Mã số thuế nhà cung cấp đang ở trạng thái tạm ngừng; cần xác nhận thời điểm giao dịch và hồ sơ hàng hóa.',
      plainExplanation: 'Nhà cung cấp đang bị tạm ngừng hoạt động trên CSDL Thuế. Cần kiểm tra thời điểm phát sinh giao dịch có trước thời điểm tạm ngừng hay không.',
      legalBasis: `Điều 2.2 Quy chế Tax-SOP-2026 & ${invoiceFrameworkAt(inv.invoiceDate).decree}`,
      sopClause: 'Điều 2.2 Quy chế Tax-SOP-2026',
      actionableQuestion: `Nhà cung cấp ${inv.supplierName} đang ở trạng thái tạm ngừng hoạt động. KTT xử lý thế nào?`,
      options: [
        {
          id: 'A',
          label: 'Xác minh hồ sơ thực tế',
          actionDescription: 'Tạm dừng hạch toán để kiểm tra hồ sơ giao nhận hàng hóa',
          resultingAction: 'REQUEST_INFORMATION'
        },
        {
          id: 'B',
          label: 'Từ chối tiếp nhận',
          actionDescription: 'Loại bỏ khỏi hồ sơ kê khai thuế',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false
    });
  }

  // 5. Kiểm tra danh bạ nhà cung cấp rủi ro cao (quy chế quản lý rủi ro nhà cung cấp nội bộ)
  if (registeredSupplier) {
    if (registeredSupplier.status === 'CLOSED' || registeredSupplier.status === 'SUSPENDED') {
      inv.sellerStatus = registeredSupplier.status;
    }
    if (registeredSupplier.riskLevel === 'HIGH_RISK_INVOICE') {
      evaluatedFindings.push({
        ruleId: 'RULE_HIGH_RISK_SUPPLIER',
        kind: 'STATUTORY',
        severity: 'HIGH',
        riskGroup: 'OUT_OF_POLICY',
        flaggedReason: `Nhà cung cấp [${inv.supplierName} - MST ${inv.supplierTaxCode}] nằm trong danh bạ cảnh báo rủi ro cao về hóa đơn (High Risk Supplier)`,
        plainExplanation: 'Nhà cung cấp này nằm trong danh bạ cảnh báo rủi ro hóa đơn của doanh nghiệp (quy chế quản lý rủi ro nhà cung cấp nội bộ). Cần KTT/CFO kiểm tra kỹ lưỡng hồ sơ hàng hóa thực tế và hợp đồng trước khi phê duyệt.',
        legalBasis: 'Quy chế Quản lý rủi ro nhà cung cấp (SOP nội bộ)',
        sopClause: 'Quy chế Quản lý rủi ro nhà cung cấp (SOP nội bộ)',
        actionableQuestion: `Nhà cung cấp ${inv.supplierName} thuộc diện cảnh báo rủi ro cao. KTT/CFO quyết định thế nào?`,
        options: [
          {
            id: 'A',
            label: 'Yêu cầu thẩm tra toàn bộ hồ sơ nguồn gốc hàng hóa',
            actionDescription: 'Yêu cầu lập Bộ hồ sơ phòng vệ 4 lớp chứng minh giao dịch có thật trước khi hạch toán',
            resultingAction: 'ACCEPT_WITH_DEFENSE_DOSSIER'
          },
          {
            id: 'B',
            label: 'Từ chối hạch toán và loại bỏ chi phí',
            actionDescription: 'Loại toàn bộ chi phí và thuế để tránh rủi ro giải trình thanh tra',
            resultingAction: 'REJECT_TAX_DEDUCTION'
          }
        ],
        requiresCFO: true
      });
    }
  }

  // 6. STATUTORY: Kiểm tra MST người mua khớp với doanh nghiệp
  if (config?.companyTaxCode && inv.buyerTaxCode) {
    const cleanBuyer = inv.buyerTaxCode.replace(/[^0-9]/g, '');
    const cleanCompany = config.companyTaxCode.replace(/[^0-9]/g, '');
    if (cleanBuyer && cleanCompany && cleanBuyer !== cleanCompany) {
      evaluatedFindings.push({
        ruleId: 'RULE_BUYER_TAX_CODE_MISMATCH',
        kind: 'STATUTORY',
        severity: 'CRITICAL',
        riskGroup: 'OUT_OF_POLICY',
        flaggedReason: `Mã số thuế người mua trên hóa đơn (${inv.buyerTaxCode}) không trùng khớp với MST doanh nghiệp (${config.companyTaxCode})`,
        plainExplanation: `Hóa đơn không ghi nhận MST của doanh nghiệp mình (nghi vấn lấy nhầm hóa đơn công ty khác hoặc hóa đơn cá nhân người lao động). Theo ${inSentence(buyerTaxCodeBasis(inv.invoiceDate))}, hóa đơn phải ghi đúng tên, mã số thuế người mua; hóa đơn ghi MST của đơn vị khác không đủ điều kiện để doanh nghiệp khấu trừ thuế GTGT đầu vào.`,
        legalBasis: buyerTaxCodeBasis(inv.invoiceDate),
        sopClause: buyerTaxCodeBasis(inv.invoiceDate),
        actionableQuestion: `Hóa đơn ${inv.invoiceNumber} từ ${inv.supplierName} ghi sai MST người mua (${inv.buyerTaxCode} thay vì ${config.companyTaxCode}). KTT xử lý thế nào?`,
        options: [
          {
            id: 'A',
            label: 'Yêu cầu nhà cung cấp hủy và xuất lại HĐ đúng MST doanh nghiệp',
            actionDescription: 'Tạm dừng hạch toán, gửi văn bản yêu cầu người bán hủy hóa đơn sai thông tin và phát hành lại đúng MST công ty',
            resultingAction: 'REQUEST_INFORMATION'
          },
          {
            id: 'B',
            label: 'Từ chối tiếp nhận và loại bỏ hoàn toàn',
            actionDescription: 'Không đưa vào kê khai khấu trừ và không tính vào chi phí được trừ',
            resultingAction: 'REJECT_TAX_DEDUCTION'
          }
        ],
        requiresCFO: isExceedKtt
      });
    }
  }

  // 7. DATA_QUALITY: Ký hiệu hóa đơn & MCCQT 34 ký tự
  if (inv.invoiceSeries) {
    const series = inv.invoiceSeries.trim().toUpperCase();
    if (series.length >= 2 && series[1] === 'C' && config?.strictMccqtCheck !== false) {
      const mccqt = inv.taxAuthorityCode?.trim();
      if (!mccqt || mccqt.length !== 34) {
        evaluatedFindings.push({
          ruleId: 'RULE_MCCQT_INVALID',
          kind: 'DATA_QUALITY',
          severity: 'HIGH',
          riskGroup: 'UNCERTAIN_INFO',
          flaggedReason: `Ký hiệu hóa đơn '${inv.invoiceSeries}' là loại có mã của Cơ quan thuế (ký tự thứ 2 là 'C') nhưng thiếu hoặc sai định dạng chuỗi MCCQT 34 ký tự (hiện có: ${mccqt ? mccqt.length + ' ký tự' : 'Trống'}).`,
          plainExplanation: `Theo ${inSentence(taxAuthorityCodeBasis(inv.invoiceDate))}, hóa đơn điện tử có mã của cơ quan thuế phải được cơ quan thuế cấp mã trước khi gửi cho người mua, và mã này là nội dung của hóa đơn (theo đặc tả kỹ thuật của cơ quan thuế là chuỗi 34 ký tự). Chưa có mã hợp lệ thì cần tra cứu lại trước khi kê khai.`,
          legalBasis: taxAuthorityCodeBasis(inv.invoiceDate),
          sopClause: taxAuthorityCodeBasis(inv.invoiceDate),
          actionableQuestion: `Hóa đơn ${inv.invoiceNumber} thuộc nhóm có mã CQT nhưng chưa có mã MCCQT 34 ký tự hợp lệ. KTT xử lý thế nào?`,
          options: [
            {
              id: 'A',
              label: 'Tra cứu lại trên Cổng thông tin HĐĐT Tổng cục Thuế',
              actionDescription: 'Tạm treo chứng từ để đối soát lại dữ liệu hóa đơn trên Cổng Cục Thuế',
              resultingAction: 'REQUEST_INFORMATION'
            },
            {
              id: 'B',
              label: 'Tạm hoãn kê khai chờ cấp mã',
              actionDescription: 'Chưa đưa vào tờ khai thuế kỳ này cho đến khi nhận được tệp XML có MCCQT hợp lệ',
              resultingAction: 'REJECT_TAX_DEDUCTION'
            }
          ],
          requiresCFO: false
        });
      }
    }

    // Series Year Mismatch
    const seriesYearMatch = series.match(/^[1-6][CK](\d{2})/);
    if (seriesYearMatch && config?.strictSeriesYearCheck !== false) {
      const seriesYear = parseInt(seriesYearMatch[1], 10);
      const invYear = parseInt(inv.invoiceDate.slice(2, 4), 10);
      if (seriesYear !== invYear) {
        evaluatedFindings.push({
          ruleId: 'RULE_SERIES_YEAR_MISMATCH',
          kind: 'DATA_QUALITY',
          severity: 'HIGH',
          riskGroup: 'UNCERTAIN_INFO',
          flaggedReason: `Ký hiệu hóa đơn '${inv.invoiceSeries}' (dải năm ${seriesYear}) không khớp với năm lập hóa đơn (${inv.invoiceDate}, năm ${invYear}).`,
          plainExplanation: `Theo ${inSentence(seriesYearBasis(inv.invoiceDate))}, hai chữ số năm trong ký hiệu hóa đơn thể hiện năm lập hóa đơn điện tử. Lệch năm cần được người bán giải trình hoặc điều chỉnh trước khi kê khai.`,
          legalBasis: seriesYearBasis(inv.invoiceDate),
          sopClause: seriesYearBasis(inv.invoiceDate),
          actionableQuestion: `Hóa đơn ${inv.invoiceNumber} có ký hiệu dải năm '${seriesYear}' khác năm lập thực tế '${invYear}'. KTT xử lý thế nào?`,
          options: [
            {
              id: 'A',
              label: 'Yêu cầu nhà cung cấp giải trình và xuất biên bản điều chỉnh',
              actionDescription: 'Tạm hoãn tiếp nhận, yêu cầu người bán giải trình lý do lệch dải năm',
              resultingAction: 'REQUEST_INFORMATION'
            },
            {
              id: 'B',
              label: 'Từ chối tiếp nhận hóa đơn lệch dải năm',
              actionDescription: 'Loại bỏ khỏi hồ sơ kê khai thuế',
              resultingAction: 'REJECT_TAX_DEDUCTION'
            }
          ],
          requiresCFO: false
        });
      }
    }
  }

  // 8. DATA_QUALITY: Độ trễ ký số
  if (inv.signingDate && inv.invoiceDate) {
    const signTime = new Date(inv.signingDate).getTime();
    const invTime = new Date(inv.invoiceDate).getTime();
    const diffDays = Math.round((signTime - invTime) / (1000 * 60 * 60 * 24));
    if (diffDays > 30 || diffDays < 0) {
      evaluatedFindings.push({
        ruleId: 'RULE_SIGNING_DELAY',
        kind: 'DATA_QUALITY',
        severity: 'MEDIUM',
        riskGroup: 'UNCERTAIN_INFO',
        flaggedReason: `Chữ ký số bên bán được ký vào ngày ${inv.signingDate}, lệch ${Math.abs(diffDays)} ngày so với ngày lập hóa đơn (${inv.invoiceDate}).`,
        plainExplanation: `Theo ${inSentence(signingBasis(inv.invoiceDate))}, ${inv.invoiceDate < '2025-06-01'
          ? 'khi thời điểm ký số khác thời điểm lập hóa đơn thì thời điểm khai thuế là thời điểm lập hóa đơn.'
          : inv.invoiceDate < '2026-07-01'
            ? 'người bán ký số và gửi cơ quan thuế cấp mã chậm nhất là ngày làm việc tiếp theo kể từ thời điểm lập hóa đơn; người mua khai thuế theo thời điểm nhận hóa đơn đúng, đủ về hình thức và nội dung.'
            : 'cần đối chiếu thời điểm ký số với thời điểm lập hóa đơn để xác định kỳ kê khai.'} Hóa đơn này có ngày ký số lệch ${Math.abs(diffDays)} ngày so với ngày lập.`,
        legalBasis: signingBasis(inv.invoiceDate),
        sopClause: signingBasis(inv.invoiceDate),
        actionableQuestion: `Hóa đơn ${inv.invoiceNumber} có ngày ký số lệch ${Math.abs(diffDays)} ngày so với ngày lập. KTT xử lý thế nào?`,
        options: [
          {
            id: 'A',
            label: 'Chấp nhận kê khai theo quy định của CQT',
            actionDescription: 'Kê khai theo kỳ phát sinh của ngày lập hóa đơn nếu hóa đơn được CQT chấp nhận',
            resultingAction: 'ACCEPT_WITH_DOCS'
          },
          {
            id: 'B',
            label: 'Yêu cầu bên bán lập hóa đơn mới đúng ngày',
            actionDescription: 'Yêu cầu hủy hóa đơn ký muộn và phát hành hóa đơn mới',
            resultingAction: 'REQUEST_INFORMATION'
          }
        ],
        requiresCFO: false
      });
    }
  }

  // 9. STATUTORY: Người bán đóng MST phát hành hóa đơn sau ngày đóng
  if (inv.sellerStatus === 'CLOSED' && !inv.sellerSuspensionDate) {
    evaluatedFindings.push({
      ruleId: 'RULE_SELLER_CLOSURE_DATE_UNKNOWN', kind: 'DATA_QUALITY', severity: 'HIGH',
      riskGroup: 'UNCERTAIN_INFO', flaggedReason: 'Bên bán đã đóng MST nhưng chưa có ngày đóng để đối chiếu ngày hóa đơn.',
      plainExplanation: 'Cần xác minh ngày đóng MST và chứng từ nguồn trước khi xét điều kiện hóa đơn.',
      legalBasis: 'Quy trình kiểm soát dữ liệu nguồn', sopClause: 'Quy trình kiểm soát dữ liệu nguồn',
      actionableQuestion: 'Kế toán trưởng cần bổ sung bằng chứng ngày đóng MST bên bán, hay tạm giữ hồ sơ chờ xác minh?',
      options: [{id:'A',label:'Bổ sung ngày đóng MST và nguồn xác minh',actionDescription:'Đối chiếu nguồn và đánh giá lại.',resultingAction:'REQUEST_INFORMATION'},
        {id:'B',label:'Tạm giữ hồ sơ',actionDescription:'Chưa duyệt thuế khi thiếu bằng chứng.',resultingAction:'REQUEST_INFORMATION'}], requiresCFO: false
    });
  }

  if (inv.sellerStatus === 'CLOSED' && inv.sellerSuspensionDate && inv.invoiceDate > inv.sellerSuspensionDate) {
    evaluatedFindings.push({
      ruleId: 'STATUTORY_DECREE_254_CLOSED_SELLER',
      kind: 'STATUTORY',
      severity: 'CRITICAL',
      riskGroup: 'OUT_OF_POLICY',
      flaggedReason: 'Hóa đơn lập ngày ' + inv.invoiceDate + ', SAU ngày người bán bị đóng MST (' + inv.sellerSuspensionDate + ')',
      plainExplanation: 'Ngày lập hóa đơn sau ngày đóng MST đã ghi nhận; cần đối chiếu chứng từ và nguồn xác minh trước khi xử lý.',
      legalBasis: `Điều 2.2 Quy chế Tax-SOP-2026 & ${closedSellerBasis(inv.invoiceDate)}`,
      sopClause: `Điều 2.2 Quy chế Tax-SOP-2026 & ${closedSellerBasis(inv.invoiceDate)}`,
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' phát hành sau ngày bên bán đóng MST (' + inv.sellerSuspensionDate + '). Hệ thống khuyến nghị loại bỏ ngay. ' + (isExceedKtt ? 'CFO' : 'KTT') + ' xác nhận?',
      options: [
        {
          id: 'A',
          label: 'Loại bỏ ngay lập tức (Khuyến nghị)',
          actionDescription: 'Loại hồ sơ này khỏi đề xuất thuế nội bộ và lưu lý do đối chiếu.',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        },
        {
          id: 'B',
          label: 'Tạm giữ hồ sơ, chuyển Ban Pháp chế',
          actionDescription: 'Tạm dừng hạch toán để bộ phận pháp chế làm việc với nhà cung cấp',
          resultingAction: 'REQUEST_INFORMATION'
        }
      ],
      requiresCFO: isExceedKtt
    });
  }

  // 10. STATUTORY: Hóa đơn từ 5 triệu thanh toán tiền mặt (Luật Thuế GTGT 48/2024/QH15)
  const isCashPayment = inv.paymentMethod === 'CASH';
  // Nhân viên trả tiền mặt cho bên bán rồi được công ty hoàn ứng qua ngân hàng vẫn là thanh toán tiền mặt với bên bán.
  if (inv.totalAmount >= nonCashThreshold && isCashPayment) {
    {
      evaluatedFindings.push({
        ruleId: 'STATUTORY_LAW_48_CASH_PAYMENT',
        kind: 'STATUTORY',
        severity: 'CRITICAL',
        riskGroup: 'OUT_OF_POLICY',
        flaggedReason: 'Hóa đơn từ ' + (nonCashThreshold / 1_000_000) + ' triệu đồng thanh toán TIỀN MẶT' + (isExceedKtt ? ' (vượt hạn mức KTT)' : '') + ' cần đối chiếu điều kiện thanh toán theo SOP',
        plainExplanation: 'Theo ' + inSentence(cashPaymentBasis(inv.invoiceDate)) + ', hàng hóa, dịch vụ mua vào từ ' + (nonCashThreshold / 1_000_000) + ' triệu đồng trở lên (đã gồm thuế GTGT) phải có chứng từ thanh toán không dùng tiền mặt (ví dụ ủy nhiệm chi ngân hàng) để được khấu trừ. Không áp dụng tiền lệ tự duyệt cho điều kiện luật định.',
        legalBasis: cashPaymentBasis(inv.invoiceDate) + ' & Điều 1.2 Tax-SOP-2026',
        sopClause: cashPaymentBasis(inv.invoiceDate) + ' & Điều 1.2 Tax-SOP-2026',
        actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' trị giá ' + inv.totalAmount.toLocaleString('vi-VN') + '₫ thanh toán Tiền mặt' + (isExceedKtt ? ' (vượt thẩm quyền KTT)' : '') + '. ' + (isExceedKtt ? 'CFO' : 'KTT') + ' xử lý thế nào?',
        options: [
          {
            id: 'A',
            label: 'Yêu cầu nộp Ủy nhiệm chi ngân hàng',
            actionDescription: 'Tạm treo hóa đơn, yêu cầu nhân viên thanh toán bổ sung UNC',
            resultingAction: 'REQUEST_INFORMATION'
          },
          {
            id: 'B',
            label: 'Loại khỏi đề xuất thuế nội bộ',
            actionDescription: 'Chưa ghi nhận thuế được duyệt; lưu lý do và chuyển đối chiếu khi kê khai thực tế.',
            resultingAction: 'REJECT_TAX_DEDUCTION'
          }
        ],
        requiresCFO: isExceedKtt
      });
    }
  }

  // 11. STATUTORY: Cụm nhiều hóa đơn trong ngày >= 5M thanh toán tiền mặt (Luật 48/2024/QH15)
  let sameDayCluster: { total: number; members: Array<{ invoiceNumber: string; totalAmount: number; paymentMethod?: string }> } | undefined;
  if (inv.totalAmount < nonCashThreshold && isCashPayment) {
    let sameDayInvoices: InvoiceInput[] = [];
    if (contextInvoices) {
      sameDayInvoices = contextInvoices.filter(
        other => other.id !== inv.id &&
                 other.supplierTaxCode === inv.supplierTaxCode &&
                 other.invoiceDate === inv.invoiceDate
      );
    } else {
      try {
        const db = getDatabase();
        const rows = db.prepare(`
          SELECT payload_json FROM invoices
          WHERE supplier_tax_code = ? AND invoice_date = ? AND id != ? AND status!='REJECTED'
        `).all(inv.supplierTaxCode, inv.invoiceDate, inv.id) as Array<{ payload_json: string }>;
        sameDayInvoices = rows.map(r => JSON.parse(r.payload_json));
      } catch {
        // Bỏ qua nếu môi trường test không có SQLite
      }
    }

    if (sameDayInvoices.length > 0) {
      const allSameDay = [inv, ...sameDayInvoices].filter(i=>i.totalAmount>0 && !i.isAdjustment);
      const sameDayCheck = checkSameDayMultipleInvoicesRule(inv, allSameDay, nonCashThreshold);
      if (sameDayCheck.isViolation) {
        sameDayCluster = { total: sameDayCheck.dailyTotal, members: (sameDayCheck.invoices || []).map(i => ({ invoiceNumber: i.invoiceNumber, totalAmount: i.totalAmount, paymentMethod: i.paymentMethod })) };
        evaluatedFindings.push({
          ruleId: 'STATUTORY_SAME_DAY_CASH_5M',
          kind: 'STATUTORY',
          severity: 'CRITICAL',
          riskGroup: 'OUT_OF_POLICY',
          flaggedReason: `Cụm ${sameDayCheck.invoiceCount} hóa đơn cùng ngày (${inv.invoiceDate}) từ NCC [${inv.supplierName}] có tổng giá trị ${sameDayCheck.dailyTotal.toLocaleString('vi-VN')}₫ (≥ ${nonCashThreshold / 1_000_000} triệu đồng) thanh toán TIỀN MẶT`,
          plainExplanation: `Theo ${inSentence(sameDayCashBasis(inv.invoiceDate))}, mua hàng hóa, dịch vụ của ${inv.invoiceDate < '2025-07-01' ? 'một nhà cung cấp' : 'cùng một người bán'} có giá trị dưới ${nonCashThreshold / 1_000_000} triệu đồng nhưng mua nhiều lần trong cùng một ngày có tổng giá trị từ ${nonCashThreshold / 1_000_000} triệu đồng trở lên thì chỉ được khấu trừ thuế khi có chứng từ thanh toán ${inv.invoiceDate < '2025-07-01' ? 'qua ngân hàng' : 'không dùng tiền mặt'}.`,
          legalBasis: sameDayCashBasis(inv.invoiceDate),
          sopClause: sameDayCashBasis(inv.invoiceDate),
          actionableQuestion: `Phát hiện cụm hóa đơn cùng ngày từ ${inv.supplierName} đạt ${sameDayCheck.dailyTotal.toLocaleString('vi-VN')}₫ thanh toán tiền mặt. KTT xử lý thế nào?`,
          options: [
            {
              id: 'A',
              label: 'Yêu cầu thanh toán bổ sung Ủy nhiệm chi ngân hàng',
              actionDescription: 'Tạm treo toàn bộ cụm hóa đơn và yêu cầu chuyển khoản qua ngân hàng',
              resultingAction: 'REQUEST_INFORMATION'
            },
            {
              id: 'B',
              label: 'Loại trừ thuế GTGT toàn bộ cụm hóa đơn',
              actionDescription: 'Không đưa vào kê khai khấu trừ thuế đầu vào',
              resultingAction: 'REJECT_TAX_DEDUCTION'
            }
          ],
          requiresCFO: isExceedKtt
        });
      }
    }
  }

  // 12. STATUTORY: Hàng hóa/dịch vụ loại trừ áp sai thuế suất 8% (NQ 204/2025/QH15)
  const excludedCategories = (config?.excludedVat8Categories ?? [
    'VIỄN THÔNG', 'TÀI CHÍNH', 'NGÂN HÀNG', 'CHỨNG KHOÁN', 'BẢO HIỂM',
    'BẤT ĐỘNG SẢN', 'KIM LOẠI', 'KHAI KHOÁNG', 'HÓA CHẤT', 'TIÊU THỤ ĐẶC BIỆT'
  ]).map((value) => value.trim().toLocaleUpperCase('vi-VN')).filter(Boolean);
  const normalizedItemName = inv.itemName.normalize('NFC').toLocaleUpperCase('vi-VN');
  const isExcludedItem = isVat8Excluded(normalizedItemName, excludedCategories, inv.invoiceDate);
  // Có dòng hàng nhiều thuế suất thì xét theo từng dòng; tên chung ở đầu hóa đơn chỉ quyết định khi mọi dòng cùng 8%.
  const headerDecidesVat8 = new Set((inv.items ?? []).map(line => line.taxRate)).size < 2;
  if ((isExcludedItem && inv.taxRate === 8 && headerDecidesVat8) || lineItemResult.hasExcludedVat8Item) {
    const flagMsg = lineItemResult.hasExcludedVat8Item
      ? 'Dòng hàng có thuế suất 8% trong danh mục loại trừ đang cấu hình; cần đối chiếu ngành hàng và nguồn quy định'
      : 'Hàng hóa/dịch vụ có thuế suất 8% trong danh mục loại trừ đang cấu hình; cần đối chiếu ngành hàng và nguồn quy định';

    evaluatedFindings.push({
      ruleId: 'STATUTORY_RES_204_VAT_8_EXCLUDED',
      kind: 'STATUTORY',
      severity: 'HIGH',
      riskGroup: 'OUT_OF_POLICY',
      flaggedReason: flagMsg + (isExceedKtt ? ' (vượt hạn mức KTT)' : ''),
      plainExplanation: `Bên bán xuất hóa đơn thuế suất ưu đãi 8% cho mặt hàng thuộc danh mục loại trừ không được giảm thuế theo ${vat8Basis(inv.invoiceDate)} (phải áp dụng 10%). Kê khai sai thuế suất có thể bị truy thu và xử phạt khi thanh tra thuế. Không áp dụng tiền lệ cho sai sót thuế suất.`,
      legalBasis: `Điều 1.3 Quy chế Tax-SOP-2026 & ${vat8Basis(inv.invoiceDate)}`,
      sopClause: `Điều 1.3 Quy chế Tax-SOP-2026 & ${vat8Basis(inv.invoiceDate)}`,
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' từ ' + inv.supplierName + ' áp thuế 8% cho ngành hàng thuộc danh mục cần đối chiếu' + (isExceedKtt ? ' (vượt trần KTT)' : '') + '. ' + (isExceedKtt ? 'CFO' : 'KTT') + ' xử lý thế nào?',
      options: [
        {
          id: 'A',
          label: 'Xác minh ngành hàng và thuế suất',
          actionDescription: 'Tạm giữ hồ sơ, đối chiếu nguồn quy định và yêu cầu bên bán điều chỉnh nếu xác nhận sai thuế suất.',
          resultingAction: 'REQUEST_INFORMATION'
        },
        {
          id: 'B',
          label: 'Loại phần thuế khỏi khấu trừ',
          actionDescription: 'Hạch toán chi phí nội bộ nhưng không kê khai số thuế đầu vào sai phạm này',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: isExceedKtt
    });
  }

  // 13. INTERNAL_POLICY: Quy chế nội bộ & Chi phí nhạy cảm (Rượu bia tiếp khách, viết lại theo P0-2/P0-3)
  // Cùng một mẫu nguyên từ cho tên hàng và dòng hàng (gồm thuốc lá; ngoặc/dấu câu không làm lọt từ khóa).
  const isAlcohol = isSensitiveText(normalizedItemName) || lineItemResult.hasSensitiveItem;
  if (isAlcohol) {
    evaluatedFindings.push({
      ruleId: 'INTERNAL_POLICY_GUEST_ENTERTAINMENT',
      kind: 'INTERNAL_POLICY',
      severity: 'MEDIUM',
      riskGroup: 'OUT_OF_POLICY',
      flaggedReason: 'Khoản chi có đồ uống có cồn/tiếp khách: Cần làm rõ mục đích phục vụ sản xuất kinh doanh hay phúc lợi nhân viên theo quy chế tài chính (Luật Thuế TNDN)',
      plainExplanation: 'Hóa đơn có đồ uống có cồn hoặc chi phí tiếp khách/giải trí. Theo quy định thuế TNDN, chi phí này chỉ được trừ và khấu trừ thuế khi phục vụ trực tiếp SXKD, có quy chế tiếp khách, danh sách đối tác hoặc thỏa mãn trần chi phúc lợi.',
      legalBasis: 'Điều 2.1 Quy chế Tax-SOP-2026 (chi tiếp khách theo quy chế nội bộ)',
      sopClause: 'Điều 2.1 Quy chế Tax-SOP-2026 & Luật Thuế TNDN',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} có khoản chi tiếp khách/đồ uống (${inv.totalAmount.toLocaleString('vi-VN')}₫). Khoản chi này phục vụ tiếp khách đối tác nào hay phúc lợi nhân viên? Có quy chế không? ${isExceedKtt ? 'CFO' : 'KTT'} xử lý thế nào?`,
      options: [
        {
          id: 'A',
          label: 'Duyệt kèm Quy chế tiếp khách & Hồ sơ SXKD',
          actionDescription: 'Xác nhận khoản chi phục vụ tiếp khách đối tác theo quy chế, kèm danh sách khách mời và hóa đơn hợp lệ',
          resultingAction: 'ACCEPT_WITH_DOCS'
        },
        {
          id: 'B',
          label: 'Loại khỏi đề xuất thuế nội bộ',
          actionDescription: 'Lưu chi phí nội bộ và lý do không duyệt thuế trong hồ sơ này.',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: isExceedKtt
    });
  }

  // 13b. SCOPE: Khoản chi SOP không bao phủ (tài trợ, từ thiện, tiền phạt, quà biếu, chi cá nhân, tài sản tài chính)
  const scopeKeywords=(config?.scopeNotCoveredCategories ?? SCOPE_NOT_COVERED_DEFAULT).map(k=>k.trim().toLocaleUpperCase('vi-VN')).filter(Boolean);
  const scopeTexts=[inv.itemName,...(inv.items||[]).map(i=>i.itemName)].map(t=>t.toLocaleUpperCase('vi-VN'));
  // Hóa đơn 0 đồng (VD hàng khuyến mại bên bán tặng) không có tiền/thuế nào cần quyết định: không chuyển tiếp vì từ khóa.
  const nothingAtStake=Math.abs(inv.totalAmount)===0 && Math.abs(inv.taxAmount)===0;
  const scopeHit=nothingAtStake ? undefined : scopeKeywords.find(k=>scopeTexts.some(t=>matchesKeyword(t,k)));
  if (scopeHit) {
    evaluatedFindings.push({
      ruleId: 'RULE_SCOPE_NOT_COVERED', kind: 'INTERNAL_POLICY', severity: 'HIGH', riskGroup: 'OUT_OF_POLICY',
      flaggedReason: `Nội dung “${inv.itemName}” thuộc nhóm “${scopeHit.toLocaleLowerCase('vi-VN')}” — SOP chưa có quy tắc tự duyệt cho loại chi này.`,
      plainExplanation: 'Khoản chi này không nằm trong các nhóm chi phí mà quy chế cho phép hệ thống tự duyệt. Hệ thống không tự kết luận được hay không được khấu trừ, nên chuyển người có thẩm quyền quyết định.',
      legalBasis: 'Điều 2.3 Quy chế Tax-SOP-2026 (Phạm vi tự động hóa)', sopClause: 'Điều 2.3 Quy chế Tax-SOP-2026',
      actionableQuestion: `Khoản chi “${inv.itemName}” nằm ngoài phạm vi tự duyệt. ${isExceedKtt ? 'CFO' : 'KTT'} quyết định?`,
      options: [
        {id:'A',label:'Có hợp đồng/chứng từ phục vụ SXKD — duyệt khấu trừ',actionDescription:'Người có thẩm quyền xác nhận kèm hợp đồng/chứng từ chứng minh.',resultingAction:'ACCEPT_WITH_DOCS'},
        {id:'B',label:'Không phục vụ SXKD — loại thuế, chỉ ghi nhận chi phí',actionDescription:'Không kê khai khấu trừ; lưu lý do.',resultingAction:'REJECT_TAX_DEDUCTION'}
      ],
      requiresCFO: isExceedKtt
    });
  }

  // 13c. SCOPE: Thuế suất 8% ngoài mọi kỳ giảm thuế GTGT (bảng kỳ trong lib/legalBasis: 02/2022–12/2022, 07/2023–12/2026)
  const usesVat8=inv.taxRate===8 || (inv.items||[]).some(i=>i.taxRate===8);
  if (usesVat8 && !vatReductionAt(inv.invoiceDate)) {
    evaluatedFindings.push({
      ruleId: 'RULE_SCOPE_VAT8_PERIOD', kind: 'STATUTORY', severity: 'HIGH', riskGroup: 'OUT_OF_POLICY',
      flaggedReason: `Hóa đơn ngày ${inv.invoiceDate} áp thuế suất 8% ngoài thời gian giảm thuế GTGT đã cấu hình.`,
      plainExplanation: 'Mức thuế 8% chỉ áp dụng trong thời gian có nghị quyết giảm thuế GTGT. Hóa đơn lập ngoài thời gian này phải dùng thuế suất phổ thông 10%.',
      legalBasis: 'Điều 1.3 Quy chế Tax-SOP-2026 & các nghị quyết giảm thuế GTGT theo kỳ (gần nhất: Nghị quyết 204/2025/QH15, hết 31/12/2026)', sopClause: 'Điều 1.3 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} áp 8% ngoài thời gian giảm thuế. ${isExceedKtt ? 'CFO' : 'KTT'} xử lý thế nào?`,
      options: [
        {id:'A',label:'Yêu cầu NCC xuất lại hóa đơn 10%',actionDescription:'Giữ hồ sơ, chưa khấu trừ cho đến khi có hóa đơn đúng thuế suất.',resultingAction:'REQUEST_SUPPLIER_REISSUE'},
        {id:'B',label:'Không khấu trừ phần thuế sai',actionDescription:'Ghi nhận chi phí nội bộ, loại phần thuế sai.',resultingAction:'REJECT_TAX_DEDUCTION'}
      ],
      requiresCFO: isExceedKtt
    });
  }

  // 14. AUTHORITY: Hệ số K chạm Vùng Đỏ
  const { kFactor, zone } = calculateKFactor(inv.preTaxAmount, kSafeMin, kSafeMax, macroState);
  if (zone === 'DANGER_RED' && Math.abs(inv.preTaxAmount) >= 1_000_000_000 && !inv.isAdjustment) {
    evaluatedFindings.push({
      ruleId: 'AUTHORITY_K_FACTOR_RED',
      kind: 'AUTHORITY',
      severity: 'HIGH',
      riskGroup: 'EXCEED_AUTHORITY',
      flaggedReason: 'Lô hàng mua sắm lớn đẩy Tham số nguồn hàng K kỳ này sang mức ' + kFactor + ' (vùng đỏ theo ngưỡng nội bộ Điều 4.3 Tax-SOP-2026)',
      plainExplanation: 'Mua sắm vật tư lớn làm mẫu số tăng mạnh khiến chỉ số K chạm Vùng Đỏ (' + kFactor + '), có nguy cơ bị hệ thống quản lý rủi ro của Cục Thuế gửi văn bản tra soát.',
      legalBasis: 'Điều 4.2 & Điều 4.3 Quy chế Tax-SOP-2026 (ngưỡng hệ số K nội bộ)',
      sopClause: 'Điều 4.2 & Điều 4.3 Quy chế Tax-SOP-2026 (ngưỡng hệ số K nội bộ)',
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
          actionDescription: 'Tạm dừng hạch toán, chuyển bộ phận Thu mua kiểm tra đối soát biên bản nghiệm thu trước khi hạch toán',
          resultingAction: 'REQUEST_INFORMATION'
        }
      ],
      requiresCFO: true
    });
  }

  // 15. AUTHORITY: Vượt hạn mức tự duyệt của KTT (>= 200M)
  if (Math.abs(inv.totalAmount) >= kttApprovalLimit) {
    if (inv.isAdjustment) {
      evaluatedFindings.push({
        ruleId: 'AUTHORITY_EXCEED_KTT_LIMIT',
        kind: 'AUTHORITY',
        severity: 'HIGH',
        riskGroup: 'EXCEED_AUTHORITY',
        flaggedReason: 'Hóa đơn điều chỉnh/giảm giá thương mại đạt ' + Math.abs(inv.totalAmount).toLocaleString('vi-VN') + '₫, vượt hạn mức ' + (kttApprovalLimit / 1_000_000) + 'M của KTT',
        plainExplanation: 'Số tiền điều chỉnh giảm doanh thu/chiết khấu vượt quá thẩm quyền tự duyệt của Kế toán trưởng, quy chế yêu cầu Giám đốc Tài chính (CFO) phê duyệt.',
        legalBasis: 'Điều 3.3 Quy chế Tax-SOP-2026',
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
        requiresCFO: true
      });
    } else {
      evaluatedFindings.push({
        ruleId: 'AUTHORITY_EXCEED_KTT_LIMIT',
        kind: 'AUTHORITY',
        severity: 'HIGH',
        riskGroup: 'EXCEED_AUTHORITY',
        flaggedReason: 'Khoản chi đặc thù vượt hạn mức tự duyệt của KTT (>= ' + (kttApprovalLimit / 1_000_000) + ' triệu)',
        plainExplanation: 'Khoản chi lớn vượt thẩm quyền tự duyệt của Kế toán trưởng, cần chữ ký phê duyệt chi của Giám đốc Tài chính (CFO) hoặc Tổng Giám đốc.',
        legalBasis: 'Điều 3.3 Quy chế Tax-SOP-2026',
        sopClause: 'Điều 3.3 Quy chế Tax-SOP-2026',
        actionableQuestion: 'Khoản chi ' + inv.itemName + ' trị giá ' + inv.totalAmount.toLocaleString('vi-VN') + '₫ vượt trần KTT. CFO có chấp thuận phê duyệt chi và khấu trừ thuế?',
        options: [
          {
            id: 'A',
            label: 'CFO Phê duyệt chi',
            actionDescription: 'Phê duyệt trong thẩm quyền CFO; chỉ hoàn tất khi mọi phát hiện khác đã được giải quyết.',
            resultingAction: 'ACCEPT_WITH_DOCS'
          },
          {
            id: 'B',
            label: 'Yêu cầu thẩm tra hợp đồng',
            actionDescription: 'Tạm dừng hạch toán để thẩm tra điều khoản thanh toán',
            resultingAction: 'REJECT_TAX_DEDUCTION'
          }
        ],
        requiresCFO: true
      });
    }
  }

  // 15b. AUTHORITY: Tách nhỏ hóa đơn — từng hóa đơn dưới hạn mức KTT nhưng cộng các hóa đơn cùng bên bán trong ngày
  // đạt hạn mức (dấu hiệu "split purchase" để né cấp phê duyệt). CFO xác nhận đây là các giao dịch độc lập.
  const splitTotal = inv.isAdjustment || Math.abs(inv.totalAmount) >= kttApprovalLimit ? 0 : sameDayPurchaseTotal(inv, contextInvoices, kttApprovalLimit);
  if (splitTotal >= kttApprovalLimit) {
    evaluatedFindings.push({
      ruleId: 'AUTHORITY_SPLIT_PURCHASE',
      kind: 'AUTHORITY',
      severity: 'HIGH',
      riskGroup: 'EXCEED_AUTHORITY',
      flaggedReason: `Các hóa đơn cùng bên bán trong ngày ${inv.invoiceDate} cộng lại ${splitTotal.toLocaleString('vi-VN')}₫ ≥ hạn mức KTT ${kttApprovalLimit.toLocaleString('vi-VN')}₫ dù từng hóa đơn đều dưới hạn mức`,
      plainExplanation: 'Từng hóa đơn nhỏ hơn hạn mức tự duyệt của Kế toán trưởng, nhưng cộng các hóa đơn cùng bên bán trong cùng ngày thì vượt hạn mức — dấu hiệu tách nhỏ giao dịch để né cấp phê duyệt. Cần CFO xác nhận đây là các giao dịch độc lập trước khi ghi nhận thuế.',
      legalBasis: 'Điều 3.3 Quy chế Tax-SOP-2026',
      sopClause: 'Điều 3.3 Quy chế Tax-SOP-2026',
      actionableQuestion: `Hóa đơn ${inv.invoiceNumber} cùng các hóa đơn của ${inv.supplierName} ngày ${inv.invoiceDate} cộng lại ${splitTotal.toLocaleString('vi-VN')}₫, vượt hạn mức KTT. CFO xác nhận đây là các giao dịch độc lập?`,
      options: [
        { id: 'A', label: 'Giao dịch độc lập — CFO duyệt', actionDescription: 'Có hợp đồng/đơn hàng riêng cho từng hóa đơn; CFO phê duyệt trong thẩm quyền.', resultingAction: 'ACCEPT_WITH_DOCS' },
        { id: 'B', label: 'Cùng một giao dịch bị tách — giữ hồ sơ', actionDescription: 'Giữ hồ sơ, gộp phê duyệt theo hạn mức CFO trước khi ghi nhận thuế.', resultingAction: 'REQUEST_INFORMATION' }
      ],
      requiresCFO: true
    });
  }

  // 16. DATA_QUALITY: Ảnh mờ
  if (inv.isImageBlurry) {
    evaluatedFindings.push({
      ruleId: 'RULE_IMAGE_BLURRY',
      kind: 'DATA_QUALITY',
      severity: 'MEDIUM',
      riskGroup: 'UNCERTAIN_INFO',
      flaggedReason: 'Hình ảnh hóa đơn bị mờ/lóa dòng tổng tiền, AI chưa đọc được dữ liệu chắc chắn',
      plainExplanation: 'Chứng từ ảnh chụp/scan bị mờ nét số tiền thanh toán. Cần Kế toán trưởng nhìn mắt thường để xác nhận con số chuẩn.',
      legalBasis: 'Điều 1.1 Quy chế Tax-SOP-2026',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026',
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' chưa đọc rõ. Kế toán trưởng bổ sung ảnh rõ hơn hoặc xác minh từng trường trên chứng từ gốc?',
      options: [
        {
          id: 'A',
          label: 'Bổ sung ảnh rõ hơn',
          actionDescription: 'Nhận lại ảnh hoặc XML gốc và chạy lại việc trích xuất.',
          resultingAction: 'REQUEST_INFORMATION'
        },
        {
          id: 'B',
          label: 'Xác minh dữ liệu từ chứng từ gốc',
          actionDescription: 'Ghi giá trị và nguồn bằng chứng cho từng trường rồi đánh giá lại.',
          resultingAction: 'CONFIRM_CORRECTED_DATA'
        }
      ],
      requiresCFO: false
    });
  }

  // 17. DATA_QUALITY: Thiếu bảng kê
  if (needsItemManifest(inv) && inv.hasItemManifest === false) {
    evaluatedFindings.push({
      ruleId: 'RULE_MISSING_MANIFEST',
      kind: 'DATA_QUALITY',
      severity: 'MEDIUM',
      riskGroup: 'UNCERTAIN_INFO',
      flaggedReason: 'Hóa đơn tổng hợp thiếu tệp bảng kê chi tiết quy cách hàng hóa đính kèm',
      plainExplanation: 'Nội dung tổng hợp chưa có bảng kê/chi tiết theo SOP; cần bổ sung để xác định giao dịch.',
      legalBasis: 'Điều 1.1 Quy chế Tax-SOP-2026',
      sopClause: 'Điều 1.1 Quy chế Tax-SOP-2026',
      actionableQuestion: 'Hóa đơn ' + inv.invoiceNumber + ' (' + inv.totalAmount.toLocaleString('vi-VN') + '₫) thiếu bảng kê chi tiết. KTT xử lý thế nào?',
      options: [
        {
          id: 'A',
          label: 'Tạm treo, yêu cầu bổ sung bảng kê',
          actionDescription: 'Gửi yêu cầu cho nhân viên mua hàng nộp bảng kê trước khi duyệt',
          resultingAction: 'REQUEST_INFORMATION'
        },
        {
          id: 'B',
          label: 'Loại khỏi đợt kê khai thuế quý này',
          actionDescription: 'Tạm thời chưa đưa vào kê khai khấu trừ',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false
    });
  }

  // 18. DATA_QUALITY: Hóa đơn điều chỉnh thiếu tham chiếu gốc
  if (inv.isAdjustment && !inv.originalInvoiceRef) {
    evaluatedFindings.push({
      ruleId: 'RULE_ADJUSTMENT_NO_ORIGINAL',
      kind: 'DATA_QUALITY',
      severity: 'MEDIUM',
      riskGroup: 'UNCERTAIN_INFO',
      flaggedReason: 'Hóa đơn điều chỉnh nhưng không tìm thấy số hóa đơn gốc trong CSDL nội bộ',
      plainExplanation: `Hóa đơn ghi là điều chỉnh giảm tiền nhưng hệ thống không tìm thấy hóa đơn gốc tương ứng theo ${invoiceFrameworkAt(inv.invoiceDate).decree}.`,
      legalBasis: `Điều 1.4 Quy chế Tax-SOP-2026 & ${invoiceFrameworkAt(inv.invoiceDate).decree}`,
      sopClause: `Điều 1.4 Quy chế Tax-SOP-2026 & ${invoiceFrameworkAt(inv.invoiceDate).decree}`,
      actionableQuestion: 'Hóa đơn điều chỉnh ' + inv.invoiceNumber + ' không tìm thấy số hóa đơn gốc. KTT xử lý thế nào?',
      options: [
        {
          id: 'A',
          label: 'Tạm treo chờ tra soát hóa đơn gốc',
          actionDescription: 'Liên hệ kế toán đối tác để xác minh số hóa đơn gốc đã phát hành',
          resultingAction: 'REQUEST_INFORMATION'
        },
        {
          id: 'B',
          label: 'Từ chối tiếp nhận hóa đơn này',
          actionDescription: 'Bác bỏ hóa đơn điều chỉnh không rõ nguồn gốc',
          resultingAction: 'REJECT_TAX_DEDUCTION'
        }
      ],
      requiresCFO: false
    });
  }

  // 19. DATA_QUALITY: Đóng MST nhưng HĐ lập trước ngày đóng
  if (inv.sellerStatus === 'CLOSED' && inv.sellerSuspensionDate && inv.invoiceDate <= inv.sellerSuspensionDate) {
    evaluatedFindings.push({
      ruleId: 'RULE_SELLER_CLOSED_BEFORE',
      kind: 'DATA_QUALITY',
      severity: 'MEDIUM',
      riskGroup: 'UNCERTAIN_INFO',
      flaggedReason: 'Nhà cung cấp đã đóng MST ngày ' + inv.sellerSuspensionDate + ', nhưng hóa đơn lập ngày ' + inv.invoiceDate + ' (Trước ngày đóng)',
      plainExplanation: 'Đối tác hiện đã đóng mã số thuế nhưng tại thời điểm giao dịch họ vẫn đang hoạt động bình thường. Giao dịch vẫn hợp lệ nếu có đầy đủ hồ sơ chứng minh hàng hóa có thật.',
      legalBasis: 'Điều 2.2 Quy chế Tax-SOP-2026',
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
      requiresCFO: false
    });
  }

  // =========================================================================
  // XỬ LÝ KẾT QUẢ ĐỐI SOÁT & THU THẬP PHÁT HIỆN (P0-2 & P0-3)
  // =========================================================================

  // 1. Kiểm tra Tiền lệ doanh nghiệp cho các finding thuộc INTERNAL_POLICY (P0-2)
  let precedentAppliedInfo: { precedentId: string; approvedBy: string; rationale: string } | undefined;
  const activeFindings: EvaluatedFinding[] = [];

  for (const finding of evaluatedFindings) {
    if (finding.kind === 'INTERNAL_POLICY') {
      const prec = findPrecedentForInvoice(inv, finding.ruleId);
      if (prec) {
        precedentAppliedInfo = {
          precedentId: prec.id,
          approvedBy: prec.approvedBy,
          rationale: prec.rationale
        };
        // Tiền lệ hợp lệ giải tỏa rủi ro nội bộ này
        continue;
      }
    }
    activeFindings.push(finding);
  }

  // 2. Nếu không còn bất kỳ finding nào chưa giải tỏa -> ROUTINE 100%
  if (activeFindings.length === 0) {
    const approvedTax = inv.taxAmount;
    const newK = calculateKFactor(inv.preTaxAmount, kSafeMin, kSafeMax, macroState).kFactor;

    return {
      status: 'ROUTINE',
      invoiceId: inv.id,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      appliedTaxRate: inv.taxRate,
      approvedTaxAmount: approvedTax,
      plainExplanation: precedentAppliedInfo
        ? 'Duyệt theo Tiền lệ Quy chế Tiếp khách của CFO (#' + precedentAppliedInfo.precedentId + '): ' + precedentAppliedInfo.rationale
        : 'Hồ sơ đủ dữ kiện cần thiết và không còn phát hiện theo quy tắc SOP đang chạy; tự hoàn tất chứng từ nội bộ.',
      kFactorAfter: newK,
      lineItemAnalysis,
      precedentApplied: precedentAppliedInfo,
      findings: evaluatedFindings.map(f => ({
        ruleId: f.ruleId,
        kind: f.kind,
        severity: f.severity,
        riskGroup: f.riskGroup,
        flaggedReason: f.flaggedReason,
        plainExplanation: f.plainExplanation,
        legalBasis: f.legalBasis,
        evidence: f.evidence, sopClause:f.sopClause,actionableQuestion:f.actionableQuestion,options:f.options,requiresCFO:f.requiresCFO
      })),
      timestamp
    };
  }

  // 3. Còn phát hiện → ESCALATED. Mỗi phát hiện được viết lại thành câu hỏi đóng có số liệu cụ thể và hệ quả ₫;
  // nhóm chính lấy từ bảng phân loại duy nhất (lib/riskTaxonomy), không phụ thuộc thứ tự khai báo quy tắc.
  const questionContext = { config, nonCashThreshold, kttLimit: kttApprovalLimit, dailyTotal, splitTotal, sameDayCluster, duplicateOf: duplicate.isDuplicate && duplicate.originalInvoiceId ? { id: duplicate.originalInvoiceId, invoiceNumber: duplicate.originalInvoiceNumber || '' } : undefined };
  for (const finding of activeFindings) {
    finding.riskGroup = groupOf(finding.ruleId, finding.kind);
    const concrete = concreteIssue(finding, inv, questionContext);
    if (concrete) {
      finding.flaggedReason = concrete.reason;
      finding.actionableQuestion = concrete.ask;
      if (concrete.options) finding.options = concrete.options;
    }
  }
  const ordered = orderFindings(activeFindings, unverifiedAmountFacts(inv, [kttApprovalLimit, nonCashThreshold]));
  const primaryFinding = ordered[0];
  const requiresCFO = isExceedKtt || ordered.some(f => f.requiresCFO || f.kind === 'AUTHORITY');

  let combinedReason = primaryFinding.flaggedReason;
  if (ordered.length > 1) {
    combinedReason += ` (đồng thời còn ${ordered.length - 1} phát hiện: ${ordered.slice(1).map(f => f.flaggedReason).join('; ')})`;
  }

  return {
    status: 'ESCALATED',
    riskGroup: groupOf(primaryFinding.ruleId, primaryFinding.kind),
    riskGroups: riskGroupsOf(ordered),
    invoiceId: inv.id,
    supplierName: inv.supplierName,
    totalAmount: inv.totalAmount,
    taxRate: inv.taxRate,
    flaggedReason: combinedReason,
    plainExplanation: primaryFinding.plainExplanation,
    sopClause: primaryFinding.sopClause,
    actionableQuestion: primaryFinding.actionableQuestion,
    options: primaryFinding.options,
    requiresCFO,
    lineItemAnalysis,
    duplicateInfo: duplicate.isDuplicate ? duplicate : undefined,
    findings: ordered.map(f => ({
      ruleId: f.ruleId,
      kind: f.kind,
      severity: f.severity,
      riskGroup: f.riskGroup,
      flaggedReason: f.flaggedReason,
      plainExplanation: f.plainExplanation,
      legalBasis: f.legalBasis,
      evidence: f.evidence, sopClause:f.sopClause,actionableQuestion:f.actionableQuestion,options:f.options,requiresCFO:f.requiresCFO
    })),
    // No tax entitlement is established while any finding remains open.
    deductibleTax: 0,
    nonDeductibleTax: 0,
    timestamp
  };
}

// Hàm đối soát hóa đơn công khai đính kèm context văn bản pháp quy theo ngày lập và cấu hình quy định động
export function evaluateInvoiceLocally(
  inv: InvoiceInput,
  customConfig?: Partial<SystemPolicyConfig>,
  customSopVersion: string = 'TAX-SOP-2026 v2.5',
  macroState?: Pick<MacroState, 'totalSales' | 'openingInventory' | 'totalPurchases'>,
  contextInvoices?: InvoiceInput[]
): RefereeDecision {
  const regInfo = getApplicableRegulations(inv.invoiceDate);
  // Chỉ liệt kê văn bản đã đối chiếu nguyên văn; văn bản nguồn thứ cấp (VD CV 2392, luật thuế TNDN/TNCN) không phải căn cứ của quyết định.
  const applicableDecreeCodes = regInfo.applicableRegulations.filter((d) => !isUnverifiedDocument(d)).map((d) => d.code);
  // Chuẩn hóa Unicode (NFC): chữ Việt gõ dạng tổ hợp (NFD) vẫn khớp từ khóa quy tắc.
  const normalized = structuredClone(inv);
  normalized.itemName = normalized.itemName.normalize('NFC');
  normalized.supplierName = normalized.supplierName.normalize('NFC');
  normalized.items = normalized.items?.map(line => ({ ...line, itemName: line.itemName.normalize('NFC') }));
  const decision = evaluateInvoiceLocallyInternal(normalized, customConfig, macroState, contextInvoices);
  const decorated={
    ...decision,
    applicableRegulations: applicableDecreeCodes,
    sopVersion: customSopVersion,
    findings:decision.findings?.map(f=>describeRuleEvidence(f,inv.invoiceDate))
  } as RefereeDecision;
  if(decorated.status==='ROUTINE')return decorated;
  decorated.sopClause=decorated.findings?.[0]?.sopClause||decorated.sopClause;
  decorated.plainExplanation=decorated.findings?.[0]?.plainExplanation||decorated.plainExplanation;
  return buildHandoff(inv,decorated);
}

export function sameDayPurchaseTotal(inv:Partial<InvoiceInput>,context?:InvoiceInput[],maxEach=Infinity):number {
  const rows=context || (getDatabase().prepare("SELECT payload_json FROM invoices WHERE supplier_tax_code=? AND invoice_date=? AND id!=? AND status!='REJECTED'").all(inv.supplierTaxCode || '',inv.invoiceDate || '',inv.id || '') as {payload_json:string}[]).map(r=>JSON.parse(r.payload_json) as InvoiceInput);
  const distinct=new Map<string,Partial<InvoiceInput>>();
  for(const invoice of [inv,...rows])if(invoice.supplierTaxCode===inv.supplierTaxCode && invoice.invoiceDate===inv.invoiceDate && !invoice.isAdjustment && (invoice.totalAmount||0)>0 && (invoice.totalAmount||0)<maxEach)
    distinct.set(`${invoice.supplierTaxCode}:${invoice.invoiceSeries || ''}:${invoice.invoiceNumber}`,invoice);
  return [...distinct.values()].reduce((sum,i)=>sum+(i.totalAmount||0),0);
}
function getDataQualityIssue(inv: InvoiceInput,config?:Partial<SystemPolicyConfig>,dailyTotal=0): string | null {
  const date = new Date(`${inv.invoiceDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== inv.invoiceDate) return 'Ngày hóa đơn không hợp lệ hoặc không thể đối chiếu văn bản có hiệu lực.';
  // Ngày lập muộn hơn hôm nay quá 6 tháng gần như chắc chắn là nhập sai năm: không tự duyệt trên ngày đó.
  if (date.getTime() - Date.now() > 183 * 24 * 60 * 60 * 1000) return `Ngày lập ${inv.invoiceDate} muộn hơn hôm nay hơn 6 tháng — có thể nhập sai năm; cần xác nhận ngày trên chứng từ.`;
  // Hóa đơn nhiều thuế suất hợp lệ: thuế kỳ vọng theo nhóm thuế suất hoặc tổng thuế từng dòng (lib/invoiceMath), không phải tiền hàng × thuế suất đầu hóa đơn.
  const expectedTotal = inv.preTaxAmount + inv.taxAmount;
  if (!headerTaxMatches(inv) || Math.abs(inv.totalAmount - expectedTotal) > AMOUNT_TOLERANCE) {
    return 'Các số tiền trên hóa đơn không nhất quán với tiền trước thuế và thuế suất; cần xác nhận lại chứng từ gốc.';
  }
  if(inv.totalAmount<0 && !inv.isAdjustment)return 'Giá trị âm chưa được xác định là hóa đơn điều chỉnh.';
  const missing=missingBusinessFacts(inv,config,dailyTotal);
  if(missing.length)return `Thiếu dữ kiện cần cho quy tắc: ${missing.map(field=>fieldLabels[field] || field).join(', ')}. Cần bổ sung nguồn xác minh.`;
  return null;
}

