import type { ActionOption, InvoiceInput, RiskGroup, RuleFinding, SystemPolicyConfig } from '@/lib/schemas';
import { RISK_GROUP_LABELS, groupOf } from '@/lib/riskTaxonomy';
import { vat8Basis } from '@/lib/legalBasis';
import { expectedHeaderTax, headerTaxMatches, multiRateLineTax } from '@/lib/invoiceMath';

/**
 * Câu hỏi chuyển tiếp "trả lời trong một câu": mỗi ý nêu lý do bằng số liệu cụ thể và hai đáp án có hệ quả rõ
 * (₫ thuế được khấu trừ hay bị loại), để người xử lý quyết định ngay mà không phải mở lại chứng từ gốc.
 * Mỗi đáp án mang một "hệ quả" máy đọc được (AnswerEffect) để màn hình và máy chủ áp dụng đúng câu trả lời
 * "1A, 2B" — chữ trên nút luôn khớp chữ trong câu hỏi. Toàn bộ là template tất định; AI không tạo số liệu.
 */
export const vnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))}₫`;
/** 2026-10-05 → 05/10/2026 */
export const viDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
const TOLERANCE = 10;

/** Hệ quả của một đáp án khi người có thẩm quyền chọn nó. */
export type AnswerEffect =
  | { kind: 'SET_FIELDS'; values: Record<string, string | number | boolean>; confirm?: string[] }
  | { kind: 'CONFIRM_FIELDS'; fields: string[] }
  | { kind: 'NEED_VALUE'; field: string }
  | { kind: 'RESOLVE'; ruleId: string; resultingAction: string }
  | { kind: 'REQUEST_INFO' }
  | { kind: 'REJECT' };

type Option = ActionOption;
const option = (id: 'A' | 'B', label: string, actionDescription: string, resultingAction: Option['resultingAction']): Option => ({ id, label, actionDescription, resultingAction });

export interface ConcreteIssue { reason: string; ask: string; options?: [Option, Option] }
/** Cắt chuỗi do người dùng/AI nhập (tên hàng, tên NCC) để câu hỏi luôn ≤ 700 ký tự — tên rất dài không làm vỡ chuyển tiếp (lỗi 500). */
const clip = (value: unknown, max = 120): string => { const text = String(value ?? ''); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };
export interface QuestionContext { config?: Partial<SystemPolicyConfig>; nonCashThreshold: number; dailyTotal?: number; splitTotal?: number; kttLimit: number; duplicateOf?: { id: string; invoiceNumber: string };
  /** Cụm cùng người bán, cùng ngày mà quy tắc gộp đã dùng để kết luận (cùng tổng, cùng danh sách). */
  sameDayCluster?: { total: number; members: Array<{ invoiceNumber: string; totalAmount: number; paymentMethod?: string }> } }
const payWord = (method?: string) => method === 'CASH' ? 'tiền mặt' : method === 'BANK_TRANSFER' ? 'chuyển khoản' : 'chưa rõ cách trả';
/** Liệt kê tối đa 4 hóa đơn của cụm để người duyệt không phải mở hồ sơ tìm từng tờ. */
const clusterList = (members: Array<{ invoiceNumber: string; totalAmount: number; paymentMethod?: string }>): string => {
  const shown = members.slice(0, 4).map(m => `HĐ ${clip(m.invoiceNumber, 30)} (${vnd(m.totalAmount)}, ${payWord(m.paymentMethod)})`);
  return shown.join(', ') + (members.length > 4 ? ` và ${members.length - 4} hóa đơn khác` : '');
};

export function concreteIssue(finding: Pick<RuleFinding, 'ruleId' | 'flaggedReason'>, inv: InvoiceInput, ctx: QuestionContext): ConcreteIssue | null {
  const tax = vnd(inv.taxAmount), total = vnd(inv.totalAmount), item = `“${clip(inv.itemName)}”`;
  const standardRate = ctx.config?.vatStandardRate ?? 10;
  switch (finding.ruleId) {
    case 'RULE_DATA_QUALITY': {
      const expectedTax = expectedHeaderTax(inv);
      const expectedTotal = inv.preTaxAmount + inv.taxAmount;
      if (!headerTaxMatches(inv)) {
        const basis = multiRateLineTax(inv) !== null ? 'tổng thuế các dòng hàng' : `${inv.taxRate}% × ${vnd(inv.preTaxAmount)}`;
        // Tổng in khớp với số thuế tính lại ⇒ chỉ ô thuế bị đọc/nhập sai, sửa được. Ngược lại hóa đơn tự nhất quán với số thuế đang in:
        // không tự ghi số thuế không có trên hóa đơn — người xử lý nhập số đúng theo chứng từ gốc.
        const totalConfirms = Math.abs(inv.totalAmount - (inv.preTaxAmount + expectedTax)) <= TOLERANCE;
        return {
          reason: `Tiền thuế in trên hóa đơn ${tax} lệch ${basis} = ${vnd(expectedTax)}${totalConfirms ? ` (tổng in ${total} khớp với số thuế tính lại)` : ''}.`,
          ask: 'Tiền thuế đúng là bao nhiêu?',
          options: [totalConfirms
            ? option('A', `${vnd(expectedTax)} — ô thuế đọc sai, sửa và đánh giá lại`, 'Xác nhận số thuế khớp tổng in trên chứng từ, ghi nguồn và đánh giá lại.', 'CONFIRM_CORRECTED_DATA')
            : option('A', 'Số đọc/nhập sai — nhập số thuế đúng theo chứng từ gốc', 'Nhập lại tiền thuế in trên chứng từ gốc rồi đánh giá lại; không tự ghi số thuế tính lại.', 'CONFIRM_CORRECTED_DATA'),
            option('B', `${tax} như in — yêu cầu NCC lập biên bản điều chỉnh`, 'Giữ hồ sơ, chưa khấu trừ thuế cho đến khi bên bán điều chỉnh hóa đơn.', 'REQUEST_INFORMATION')]
        };
      }
      if (Math.abs(inv.totalAmount - expectedTotal) > TOLERANCE) {
        return {
          reason: `Tổng thanh toán in trên hóa đơn ${total} lệch tiền hàng + thuế = ${vnd(inv.preTaxAmount)} + ${tax} = ${vnd(expectedTotal)}.`,
          ask: 'Tổng thanh toán đúng là bao nhiêu?',
          options: [option('A', `${vnd(expectedTotal)} (= tiền hàng + thuế) — sửa và đánh giá lại`, 'Xác nhận tổng tính lại, ghi nguồn và đánh giá lại toàn bộ quy tắc.', 'CONFIRM_CORRECTED_DATA'),
            option('B', `${total} như in — yêu cầu NCC lập biên bản điều chỉnh`, 'Giữ hồ sơ, chưa khấu trừ thuế cho đến khi bên bán điều chỉnh hóa đơn.', 'REQUEST_INFORMATION')]
        };
      }
      return null;
    }
    case 'RULE_IMAGE_BLURRY':
      return {
        reason: `Ảnh hóa đơn mờ; hệ thống đọc được tổng ${total} (thuế ${tax}) nhưng chưa chắc chắn.`,
        ask: `Tổng thanh toán trên chứng từ có đúng ${total} không?`,
        options: [option('A', `Đúng ${total} — xác nhận và đánh giá lại`, 'Ghi nhận giá trị đã đối chiếu bằng mắt kèm nguồn, rồi đánh giá lại.', 'CONFIRM_CORRECTED_DATA'),
          option('B', 'Không rõ / sai — gửi lại ảnh rõ hoặc XML gốc', 'Giữ hồ sơ, chưa khấu trừ thuế cho đến khi có chứng từ đọc được.', 'REQUEST_INFORMATION')]
      };
    case 'STATUTORY_LAW_48_CASH_PAYMENT':
      return {
        reason: `Hóa đơn ${total} (≥ ngưỡng ${vnd(ctx.nonCashThreshold)}) ghi thanh toán tiền mặt; theo SOP Điều 1.2 phải có chứng từ không dùng tiền mặt mới được khấu trừ.`,
        ask: 'Khoản này thực tế được thanh toán thế nào?',
        options: [option('A', `Đã chuyển khoản qua ngân hàng — bổ sung UNC để khấu trừ ${tax}`, 'Tạm giữ, bổ sung ủy nhiệm chi rồi đánh giá lại.', 'REQUEST_INFORMATION'),
          option('B', `Trả tiền mặt thật — loại ${tax} VAT khỏi khấu trừ`, 'Không ghi nhận thuế được khấu trừ; lưu lý do.', 'REJECT_TAX_DEDUCTION')]
      };
    case 'STATUTORY_SAME_DAY_CASH_5M':
      return {
        reason: ctx.sameDayCluster?.members.length
          ? `${ctx.sameDayCluster.members.length} hóa đơn cùng ngày ${viDate(inv.invoiceDate)} từ ${clip(inv.supplierName)}: ${clusterList(ctx.sameDayCluster.members)} — cộng lại ${vnd(ctx.sameDayCluster.total)} (≥ ${vnd(ctx.nonCashThreshold)}), có tờ trả tiền mặt.`
          : `Các hóa đơn cùng ngày ${viDate(inv.invoiceDate)} từ ${clip(inv.supplierName)} cộng lại ${vnd(ctx.dailyTotal || inv.totalAmount)} (≥ ${vnd(ctx.nonCashThreshold)}) và đang trả tiền mặt.`,
        ask: 'Cụm hóa đơn này được thanh toán thế nào?',
        options: [option('A', 'Đã chuyển khoản — bổ sung UNC cho cả cụm', 'Tạm giữ cụm hóa đơn, bổ sung ủy nhiệm chi rồi đánh giá lại.', 'REQUEST_INFORMATION'),
          option('B', `Trả tiền mặt thật — loại ${tax} VAT của hóa đơn này`, 'Không ghi nhận thuế được khấu trừ; lưu lý do.', 'REJECT_TAX_DEDUCTION')]
      };
    case 'STATUTORY_RES_204_VAT_8_EXCLUDED': {
      // Chỉ phần dòng hàng thuộc nhóm loại trừ mới sai thuế suất; phần còn lại vẫn được giảm 8% hợp lệ.
      const flagged = (inv.items || []).filter(line => line.isExcludedCategory && line.taxRate === 8);
      const base = flagged.length ? flagged.reduce((sum, line) => sum + line.amount, 0) : inv.preTaxAmount;
      const invoiced = flagged.length ? flagged.reduce((sum, line) => sum + line.taxAmount, 0) : inv.taxAmount;
      const correct = Math.round(base * standardRate / 100);
      // Tên dòng hàng cắt ngắn, tối đa 3 dòng: ý hỏi luôn ≤ 700 ký tự dù hóa đơn có nhiều dòng tên dài.
      const listed = flagged.slice(0, 3).map(line => `“${clip(line.itemName, 40)}”`).join(', ') + (flagged.length > 3 ? ` và ${flagged.length - 3} dòng khác` : '');
      const subject = flagged.length ? `Dòng hàng ${listed}` : item;
      return {
        reason: `${subject} có thể thuộc nhóm không được giảm thuế (viễn thông/kim loại/tài chính/hàng chịu TTĐB… theo ${vat8Basis(inv.invoiceDate)}) nhưng đang áp 8%: thuế ${vnd(invoiced)} trên ${vnd(base)}, nếu đúng ${standardRate}% phải là ${vnd(correct)}.`,
        ask: 'Xử lý phần thuế đang áp 8% này ra sao?',
        // Hệ quả REJECT_TAX_DEDUCTION từ chối cả hồ sơ (issueEffects → REJECT) nên chữ đáp án B nêu thuế của CẢ hóa đơn, không chỉ phần dòng sai.
        options: [option('A', `Đúng nhóm loại trừ — yêu cầu NCC xuất lại ${standardRate}%`, 'Giữ hồ sơ, chưa khấu trừ cho đến khi có hóa đơn đúng thuế suất.', 'REQUEST_SUPPLIER_REISSUE'),
          option('B', `Không khấu trừ toàn bộ ${tax} VAT của hóa đơn — yêu cầu NCC điều chỉnh`, 'Từ chối khấu trừ thuế của cả hóa đơn; ghi nhận chi phí nội bộ, lưu lý do và yêu cầu bên bán điều chỉnh.', 'REJECT_TAX_DEDUCTION')]
      };
    }
    case 'RULE_SCOPE_VAT8_PERIOD':
      return {
        reason: `Hóa đơn ngày ${viDate(inv.invoiceDate)} áp thuế suất 8% nhưng ngày này nằm ngoài mọi kỳ giảm thuế GTGT (gần nhất: NQ 204/2025/QH15, 01/07/2025–31/12/2026).`,
        ask: 'Xử lý thế nào?',
        options: [option('A', `Yêu cầu NCC xuất lại hóa đơn ${standardRate}%`, 'Giữ hồ sơ, chưa khấu trừ cho đến khi có hóa đơn đúng thuế suất.', 'REQUEST_SUPPLIER_REISSUE'),
          option('B', `Không khấu trừ ${tax} trên hóa đơn sai thuế suất`, 'Ghi nhận chi phí nội bộ, loại phần thuế sai.', 'REJECT_TAX_DEDUCTION')]
      };
    case 'RULE_BUYER_TAX_CODE_MISMATCH':
      return {
        reason: `MST người mua trên hóa đơn là ${inv.buyerTaxCode}, khác MST công ty ${ctx.config?.companyTaxCode}; hóa đơn không đúng tên người mua thì không được khấu trừ.`,
        ask: 'Xử lý thế nào?',
        options: [option('A', `Yêu cầu NCC hủy và xuất lại đúng MST ${ctx.config?.companyTaxCode}`, 'Giữ hồ sơ, chưa khấu trừ cho đến khi có hóa đơn đúng tên.', 'REQUEST_INFORMATION'),
          option('B', `Loại toàn bộ ${tax} VAT — hóa đơn không phải của công ty`, 'Không kê khai khấu trừ, không tính chi phí được trừ.', 'REJECT_TAX_DEDUCTION')]
      };
    case 'RULE_HIGH_RISK_SUPPLIER':
      return {
        reason: `Nhà cung cấp ${clip(inv.supplierName)} (MST ${inv.supplierTaxCode}) nằm trong danh bạ cảnh báo rủi ro hóa đơn của doanh nghiệp.`,
        ask: 'CFO đã thẩm tra hàng hóa/hợp đồng thực tế chưa?',
        options: [option('A', `Đã thẩm tra, giao dịch có thật — CFO duyệt kèm hồ sơ phòng vệ, khấu trừ ${tax}`, 'CFO chấp nhận khi đã có hợp đồng, phiếu nhập kho, chứng từ thanh toán chứng minh giao dịch có thật.', 'ACCEPT_WITH_DEFENSE_DOSSIER'),
          option('B', `Chưa chứng minh được — loại toàn bộ ${tax} VAT`, 'Không kê khai khấu trừ để tránh rủi ro khi thanh tra.', 'REJECT_TAX_DEDUCTION')]
      };
    case 'INTERNAL_POLICY_GUEST_ENTERTAINMENT':
      return {
        reason: `${item} (${total}) có đồ uống có cồn/giải trí — nằm ngoài nhóm chi được tự duyệt (SOP Điều 2.1).`,
        ask: 'Mục đích khoản chi là gì?',
        options: [option('A', `Tiếp khách đối tác theo quy chế — duyệt, khấu trừ ${tax}`, 'Xác nhận khoản chi phục vụ SXKD theo quy chế tiếp khách, kèm danh sách khách mời.', 'ACCEPT_WITH_DOCS'),
          option('B', `Chi cá nhân/ngoài quy chế — loại ${tax} VAT`, 'Ghi nhận chi phí nội bộ, không khấu trừ thuế.', 'REJECT_TAX_DEDUCTION')]
      };
    case 'RULE_SCOPE_NOT_COVERED':
      return {
        reason: `${item} (${total}) là ${finding.flaggedReason.match(/nhóm “([^”]+)”/)?.[1] || 'khoản chi'} — SOP không có quy tắc tự duyệt cho loại chi này.`,
        ask: 'Khoản này có phục vụ trực tiếp sản xuất kinh doanh không?',
        options: [option('A', `Có hợp đồng/chứng từ phục vụ SXKD — duyệt, khấu trừ ${tax}`, 'Người có thẩm quyền xác nhận kèm hợp đồng/chứng từ chứng minh.', 'ACCEPT_WITH_DOCS'),
          option('B', `Không phục vụ SXKD — loại ${tax} VAT, chỉ ghi nhận chi phí`, 'Không kê khai khấu trừ; lưu lý do.', 'REJECT_TAX_DEDUCTION')]
      };
    case 'AUTHORITY_EXCEED_KTT_LIMIT':
      if (inv.isAdjustment) return null;
      return {
        reason: `Tổng thanh toán ${total} ≥ hạn mức tự duyệt của Kế toán trưởng ${vnd(ctx.kttLimit)} (SOP Điều 3.3).`,
        ask: `CFO có phê duyệt khoản chi ${item} của ${clip(inv.supplierName)} không?`,
        options: [option('A', `CFO phê duyệt chi ${total} — khấu trừ ${tax}`, 'Phê duyệt trong thẩm quyền CFO; chỉ hoàn tất khi mọi phát hiện khác đã được giải quyết.', 'ACCEPT_WITH_DOCS'),
          option('B', 'Tạm dừng để thẩm tra hợp đồng', 'Giữ hồ sơ, chưa duyệt thuế cho đến khi thẩm tra xong điều khoản hợp đồng.', 'REQUEST_INFORMATION')]
      };
    case 'AUTHORITY_SPLIT_PURCHASE':
      return {
        reason: `Hóa đơn ${total} từ ${clip(inv.supplierName)}; cộng các hóa đơn cùng bên bán ngày ${viDate(inv.invoiceDate)} (mỗi tờ dưới hạn mức) là ${vnd(ctx.splitTotal || inv.totalAmount)} ≥ hạn mức Kế toán trưởng ${vnd(ctx.kttLimit)} — có thể là một giao dịch bị tách nhỏ (SOP Điều 3.3).`,
        ask: 'CFO xác nhận đây là các giao dịch độc lập?',
        options: [option('A', `Giao dịch độc lập, có hợp đồng/đơn hàng riêng — CFO duyệt, khấu trừ ${tax}`, 'CFO phê duyệt trong thẩm quyền; lưu hợp đồng/đơn hàng làm bằng chứng.', 'ACCEPT_WITH_DOCS'),
          option('B', 'Cùng một giao dịch bị tách — giữ hồ sơ, gộp phê duyệt', 'Giữ hồ sơ, chưa ghi nhận thuế; gộp phê duyệt theo hạn mức CFO.', 'REQUEST_INFORMATION')]
      };
    case 'RULE_DUPLICATE_INVOICE':
      return {
        reason: `Trùng với hóa đơn đã tiếp nhận${ctx.duplicateOf ? ` [${ctx.duplicateOf.id}]` : ''} (cùng MST ${inv.supplierTaxCode} + ký hiệu + số ${inv.invoiceNumber}${ctx.duplicateOf && ctx.duplicateOf.invoiceNumber !== inv.invoiceNumber ? `, hồ sơ gốc ghi số "${ctx.duplicateOf.invoiceNumber}"` : ''}).`,
        ask: 'Đây là bản trùng hay hóa đơn thay thế?',
        options: [option('A', 'Bản trùng — từ chối, không kê khai lần hai', 'Hủy tiếp nhận bản trùng để tránh kê khai trùng thuế.', 'REJECT_TAX_DEDUCTION'),
          option('B', 'Hóa đơn thay thế — bổ sung biên bản và số HĐ gốc rồi đánh giá lại', 'Giữ hồ sơ chờ biên bản thay thế và tham chiếu hóa đơn gốc.', 'REQUEST_INFORMATION')]
      };
    case 'RULE_MISSING_MANIFEST':
      return {
        reason: `${item} (${total}) là hóa đơn tổng hợp nhưng chưa có bảng kê chi tiết (SOP Điều 2.1).`,
        ask: 'Đã có bảng kê chi tiết chưa?',
        options: [option('A', 'Có — đính kèm bảng kê rồi đánh giá lại', 'Bổ sung bảng kê và đánh giá lại.', 'REQUEST_INFORMATION'),
          option('B', `Không có — chưa khấu trừ ${tax}`, 'Không đưa vào kê khai khấu trừ kỳ này.', 'REJECT_TAX_DEDUCTION')]
      };
    default:
      return null;
  }
}

const FIELD_LABELS: Record<string, string> = {
  invoiceNumber: 'Số hóa đơn', invoiceDate: 'Ngày lập', supplierName: 'Tên bên bán', supplierTaxCode: 'MST bên bán', itemName: 'Nội dung hàng hóa',
  preTaxAmount: 'Tiền trước thuế', taxRate: 'Thuế suất', taxAmount: 'Tiền thuế', totalAmount: 'Tổng thanh toán', buyerTaxCode: 'MST bên mua',
  invoiceSeries: 'Ký hiệu hóa đơn', taxAuthorityCode: 'Mã CQT', signingDate: 'Ngày ký', items: 'Chi tiết dòng hàng', isAdjustment: 'Hóa đơn điều chỉnh',
  originalInvoiceRef: 'Số hóa đơn gốc', sellerSuspensionDate: 'Ngày đóng MST bên bán', paymentMethod: 'Hình thức thanh toán', sellerStatus: 'Trạng thái MST bên bán',
  hasBankSlip: 'Chứng từ chuyển khoản (UNC)', hasItemManifest: 'Bảng kê chi tiết'
};

export interface FieldAsk { field: string; ask: string; answers: [string, string]; effects: [AnswerEffect, AnswerEffect] }
export interface FieldAskContext { missing: boolean; nonCashThreshold: number; dailyTotal?: number; rawTaxRate?: unknown; sourceValue?: unknown; companyTaxCode?: string; missingFields?: ReadonlySet<string> }

const set = (values: Record<string, string | number | boolean>, confirm?: string[]): AnswerEffect => ({ kind: 'SET_FIELDS', values, ...(confirm ? { confirm } : {}) });
const NEED = (field: string): AnswerEffect => ({ kind: 'NEED_VALUE', field });
const REQUEST: AnswerEffect = { kind: 'REQUEST_INFO' };
const REJECT: AnswerEffect = { kind: 'REJECT' };
const isAbsent = (v: unknown) => v === undefined || v === null || v === '' || v === 'UNKNOWN';

/** Câu hỏi đóng cho một dữ kiện chưa xác minh/còn thiếu, kèm giá trị ứng viên khi tính được từ dữ liệu khác. */
export function fieldAsk(field: string, inv: InvoiceInput, ctx: FieldAskContext): FieldAsk {
  const known = (f: string) => !ctx.missingFields?.has(f) && !isAbsent((inv as unknown as Record<string, unknown>)[f]);
  const total = vnd(inv.totalAmount), tax = vnd(inv.taxAmount);
  const totalText = known('totalAmount') ? total : 'này';
  const supplier = known('supplierName') ? clip(inv.supplierName) : 'bên bán';
  const computedTotal = inv.preTaxAmount + inv.taxAmount;
  const expectedTax = Math.round(inv.preTaxAmount * inv.taxRate / 100);
  const label = FIELD_LABELS[field] || field;
  const raw = (inv as unknown as Record<string, unknown>)[field];
  const absent = ctx.missing || isAbsent(raw);
  const show = (v: unknown) => typeof v === 'number' ? (field === 'taxRate' ? `${v}%` : vnd(v)) : typeof v === 'boolean' ? (v ? 'Có' : 'Không') : Array.isArray(v) ? `${v.length} dòng` : clip(v);
  if (ctx.sourceValue !== undefined && !isAbsent(ctx.sourceValue)) {
    return { field, ask: `${label} trên chứng từ gốc là ${show(ctx.sourceValue)}, nhưng hồ sơ gửi lên ghi ${absent ? 'trống' : show(raw)}. Giá trị đúng là?`,
      answers: [`${show(ctx.sourceValue)} theo chứng từ gốc`, absent ? 'Chứng từ gốc sai — nhập giá trị đúng kèm bằng chứng' : `${show(raw)} (đã sửa, kèm bằng chứng)`],
      effects: [set({ [field]: ctx.sourceValue as string | number | boolean }, [field]), absent ? NEED(field) : { kind: 'CONFIRM_FIELDS', fields: [field] }] };
  }
  switch (field) {
    case 'paymentMethod': {
      const exposure = Math.max(Math.abs(inv.totalAmount), ctx.dailyTotal || 0);
      const aggregated = (ctx.dailyTotal || 0) > Math.abs(inv.totalAmount) ? ` (cộng các hóa đơn cùng ngày của ${supplier}: ${vnd(ctx.dailyTotal || 0)})` : '';
      return { field, ask: `Hóa đơn ${totalText} được thanh toán bằng hình thức nào?${aggregated}`,
        answers: ['Chuyển khoản qua ngân hàng (có UNC)', exposure >= ctx.nonCashThreshold ? `Tiền mặt → không được khấu trừ ${tax} VAT` : `Tiền mặt (dưới ngưỡng ${vnd(ctx.nonCashThreshold)}, vẫn hợp lệ)`],
        effects: [set({ paymentMethod: 'BANK_TRANSFER', hasBankSlip: true }), set({ paymentMethod: 'CASH' })] };
    }
    case 'sellerStatus':
      return { field, ask: `MST bên bán ${known('supplierTaxCode') ? inv.supplierTaxCode : ''} (${supplier}) tại ngày ${viDate(inv.invoiceDate)} đang ở trạng thái nào?`.replace('MST bên bán  (', 'MST bên bán ('),
        answers: ['Đang hoạt động', 'Đã đóng/tạm ngừng → chưa khấu trừ'], effects: [set({ sellerStatus: 'ACTIVE' }), set({ sellerStatus: 'SUSPENDED' })] };
    case 'hasBankSlip':
      return { field, ask: `Đã có ủy nhiệm chi/chứng từ chuyển khoản cho khoản ${totalText} chưa?`, answers: ['Có UNC — đính kèm', `Chưa có → tạm chưa khấu trừ ${tax}`],
        effects: [set({ hasBankSlip: true }), set({ hasBankSlip: false })] };
    case 'hasItemManifest':
      return { field, ask: `“${clip(inv.itemName)}” là hóa đơn tổng hợp — đã có bảng kê chi tiết chưa?`, answers: ['Có bảng kê — đính kèm', 'Chưa có → tạm treo hồ sơ'],
        effects: [set({ hasItemManifest: true }), set({ hasItemManifest: false })] };
    case 'taxRate':
      if (ctx.rawTaxRate !== undefined) return { field, ask: `Thuế suất ghi trên hóa đơn là ${String(ctx.rawTaxRate)}% — không thuộc các mức 0/5/8/10% của Luật Thuế GTGT. Thuế suất đúng là?`,
        answers: ['10% (yêu cầu NCC xuất lại nếu sai)', '8% (chỉ khi thuộc diện giảm thuế)'], effects: [set({ taxRate: 10 }), set({ taxRate: 8 })] };
      break;
    case 'totalAmount':
      if (!absent && Math.abs(computedTotal - inv.totalAmount) > TOLERANCE)
        return { field, ask: `Tổng thanh toán đọc được ${total} nhưng tiền hàng + thuế = ${vnd(computedTotal)}. Số đúng là?`, answers: [vnd(computedTotal), `${total} như in → yêu cầu NCC điều chỉnh`],
          effects: [set({ totalAmount: computedTotal }, ['totalAmount']), REQUEST] };
      if (absent && known('preTaxAmount') && known('taxAmount') && inv.preTaxAmount > 0)
        return { field, ask: `Hóa đơn chưa có tổng thanh toán; tiền hàng ${vnd(inv.preTaxAmount)} + thuế ${tax} = ${vnd(computedTotal)}. Tổng đúng là?`, answers: [vnd(computedTotal), 'Số khác — nhập từ hóa đơn'],
          effects: [set({ totalAmount: computedTotal }, ['totalAmount']), NEED('totalAmount')] };
      break;
    case 'taxAmount':
      if (!absent && Math.abs(expectedTax - inv.taxAmount) > TOLERANCE)
        return { field, ask: `Tiền thuế đọc được ${tax} nhưng ${inv.taxRate}% × ${vnd(inv.preTaxAmount)} = ${vnd(expectedTax)}. Số đúng là?`, answers: [vnd(expectedTax), `${tax} như in → yêu cầu NCC điều chỉnh`],
          effects: [set({ taxAmount: expectedTax }, ['taxAmount']), REQUEST] };
      break;
    case 'originalInvoiceRef':
      return { field, ask: 'Hóa đơn điều chỉnh này điều chỉnh cho hóa đơn gốc số nào?', answers: ['Nhập số hóa đơn gốc rồi đánh giá lại', 'Không có hóa đơn gốc → từ chối hóa đơn điều chỉnh'],
        effects: [NEED('originalInvoiceRef'), REJECT] };
    case 'sellerSuspensionDate':
      return { field, ask: `${supplier} đã đóng MST. Ngày đóng MST là ngày nào (hóa đơn lập ngày ${viDate(inv.invoiceDate)})?`,
        answers: ['Nhập ngày đóng MST để đối chiếu', `Đóng trước ngày hóa đơn → không khấu trừ ${tax}`], effects: [NEED('sellerSuspensionDate'), REJECT] };
    case 'buyerTaxCode':
      if (absent) return ctx.companyTaxCode
        ? { field, ask: 'MST người mua ghi trên hóa đơn là gì?', answers: [`Đúng MST công ty ${ctx.companyTaxCode}`, 'MST khác hoặc không ghi → không khấu trừ'], effects: [set({ buyerTaxCode: ctx.companyTaxCode }, ['buyerTaxCode']), REJECT] }
        : { field, ask: 'MST người mua ghi trên hóa đơn là gì?', answers: ['Nhập MST người mua từ hóa đơn', 'Không ghi MST người mua → không khấu trừ'], effects: [NEED('buyerTaxCode'), REJECT] };
      break;
  }
  if (absent) return { field, ask: `${label}: hóa đơn chưa có dữ liệu.`, answers: [`Nhập ${label.toLocaleLowerCase('vi-VN')} từ hóa đơn rồi đánh giá lại`, 'Yêu cầu người nộp bổ sung chứng từ'], effects: [NEED(field), REQUEST] };
  const shown = show(raw);
  return { field, ask: `${label} đọc được là ${shown} — đúng không?`, answers: [`Đúng ${shown}`, 'Sai — nhập giá trị đúng'], effects: [{ kind: 'CONFIRM_FIELDS', fields: [field] }, NEED(field)] };
}

export interface QuestionItem { n: number; ruleIds: string[]; riskGroup: RiskGroup; text: string; answers: [string, string]; effects: [AnswerEffect, AnswerEffect] }

/** Ghép câu hỏi tổng: một dòng ngữ cảnh + các ý đánh số; mỗi ý có đáp án A/B, trả lời một lần kiểu "1A, 2B". */
export function composeQuestion(inv: InvoiceInput, role: 'CFO' | 'Kế toán trưởng', items: Array<Omit<QuestionItem, 'n'>>, taxAtStake: number, missing: ReadonlySet<string> = new Set()): { question: string; items: QuestionItem[]; invoiceRef: string } {
  const numbered = items.map((item, index) => ({ ...item, n: index + 1 }));
  const invoiceRef = missing.has('invoiceNumber') ? 'Hóa đơn (chưa có số)' : `Hóa đơn ${inv.invoiceNumber}`;
  const supplier = missing.has('supplierName') ? 'bên bán chưa rõ' : clip(inv.supplierName);
  const amount = missing.has('totalAmount') ? 'chưa có tổng tiền' : vnd(inv.totalAmount);
  const stake = taxAtStake > 0 && !missing.has('taxAmount') ? ` (VAT chờ quyết định ${vnd(taxAtStake)})` : '';
  const header = `${invoiceRef} · ${supplier} · ${amount}${stake}. ${role} trả lời`;
  const render = (item: QuestionItem) => `[${RISK_GROUP_LABELS[item.riskGroup]}] ${item.text} A: ${item.answers[0]}; hoặc B: ${item.answers[1]}?`;
  if (numbered.length === 1) return { question: `${header}: ${render(numbered[0])}`, items: numbered, invoiceRef };
  return { question: `${header} ${numbered.length} ý:\n${numbered.map(item => `${item.n}. ${render(item)}`).join('\n')}\nTrả lời một lần, ví dụ: "${numbered.map(item => `${item.n}A`).join(', ')}".`, items: numbered, invoiceRef };
}

/** Hệ quả của đáp án A/B cho một phát hiện quy tắc. */
function issueEffects(finding: Pick<RuleFinding, 'ruleId' | 'options'>, inv: InvoiceInput): [AnswerEffect, AnswerEffect] {
  if (finding.ruleId === 'RULE_DATA_QUALITY') {
    const expectedTax = expectedHeaderTax(inv);
    if (!headerTaxMatches(inv))
      return [Math.abs(inv.totalAmount - (inv.preTaxAmount + expectedTax)) <= TOLERANCE ? set({ taxAmount: expectedTax }, ['taxAmount']) : NEED('taxAmount'), REQUEST];
    if (Math.abs(inv.totalAmount - (inv.preTaxAmount + inv.taxAmount)) > TOLERANCE) return [set({ totalAmount: inv.preTaxAmount + inv.taxAmount }, ['totalAmount']), REQUEST];
  }
  if (finding.ruleId === 'RULE_IMAGE_BLURRY') return [set({ isImageBlurry: false }, ['preTaxAmount', 'taxAmount', 'totalAmount']), REQUEST];
  const map = (o?: { resultingAction: string }): AnswerEffect => !o ? REQUEST
    : o.resultingAction.startsWith('ACCEPT_') ? { kind: 'RESOLVE', ruleId: finding.ruleId, resultingAction: o.resultingAction }
    : o.resultingAction === 'REJECT_TAX_DEDUCTION' ? REJECT : REQUEST;
  return [map(finding.options?.[0]), map(finding.options?.[1])];
}

export function issueItem(finding: Pick<RuleFinding, 'ruleId' | 'kind' | 'flaggedReason' | 'actionableQuestion' | 'sopClause' | 'options'>, inv: InvoiceInput): Omit<QuestionItem, 'n'> {
  const generic = /\s*(?:KTT(?:\/CFO)?|CFO|Kế toán trưởng)?\s*(?:xử lý thế nào|quyết định thế nào|phê duyệt chiến lược xử lý|quyết định|phê duyệt ghi nhận|xác nhận)\?\s*$/i;
  const ask = (finding.actionableQuestion || '').replace(generic, '').trim();
  const reason = finding.flaggedReason.trim().replace(/\.?$/, '.');
  const clause = finding.sopClause && !reason.includes(finding.sopClause) ? ` (Căn cứ: ${finding.sopClause})` : '';
  const text = ask && !reason.includes(ask) ? `${reason}${clause} ${ask}` : `${reason}${clause}`;
  const options = finding.options || [];
  return { ruleIds: [finding.ruleId], riskGroup: groupOf(finding.ruleId, finding.kind), text, answers: [options[0]?.label || 'Đồng ý', options[1]?.label || 'Không đồng ý'], effects: issueEffects(finding, inv) };
}
