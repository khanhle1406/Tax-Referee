/**
 * Phiếu giải trình cho từng hóa đơn: vì sao máy đề xuất duyệt (từng điều kiện đã đạt, kèm số), hoặc vì sao dừng
 * (tô đúng trường và quy tắc, kèm số tiền đang chờ). Mọi điều kiện tính bằng chính các hàm engine dùng
 * (ngưỡng thanh toán theo ngày lập, thuế theo nhóm thuế suất, kỳ giảm 8%) — giải trình không nói khác quyết định.
 * Quyết định vẫn do services/policyEngine.ts đưa ra; tệp này chỉ diễn giải.
 */
import { ruleContract } from '@/data/policyContract';
import { headerTaxMatches, expectedHeaderTax, AMOUNT_TOLERANCE_VND } from '@/lib/invoiceMath';
import { cashPaymentBasis, vatReductionAt } from '@/lib/legalBasis';
import { paymentThreshold } from '@/lib/refereeRequirements';
import { RISK_GROUP_LABELS, taxonomyOf } from '@/lib/riskTaxonomy';
import type { InvoiceInput, RefereeDecision, RiskGroup, SystemPolicyConfig } from '@/lib/schemas';

export interface ExplainCheck { key: string; ok: boolean | null; label: string; detail: string }
export interface ExplainHighlight { ruleId: string; ruleLabel: string; group: RiskGroup; groupLabel: string; fields: string[]; fieldLabels: string[]; reason: string }
export interface DecisionExplanation {
  verdict: 'APPROVED' | 'STOPPED';
  headline: string;
  /** Câu một dòng cho người không làm kế toán. */
  plain: string;
  checks: ExplainCheck[];
  highlights: ExplainHighlight[];
  vatAtStake: number;
  basisNote: string;
}

const vnd = (n: number): string => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))}₫`;
const FIELD_LABELS: Record<string, string> = {
  invoiceDate: 'Ngày lập', preTaxAmount: 'Tiền hàng', taxRate: 'Thuế suất', taxAmount: 'Tiền thuế', totalAmount: 'Tổng thanh toán',
  paymentMethod: 'Hình thức thanh toán', hasBankSlip: 'Chứng từ thanh toán', buyerTaxCode: 'MST người mua', sellerStatus: 'Trạng thái bên bán',
  sellerSuspensionDate: 'Ngày đóng/tạm ngừng MST', itemName: 'Nội dung hàng hóa', items: 'Dòng hàng', invoiceSeries: 'Ký hiệu',
  taxAuthorityCode: 'Mã cơ quan thuế', signingDate: 'Ngày ký', supplierTaxCode: 'MST bên bán', invoiceNumber: 'Số hóa đơn',
  isImageBlurry: 'Ảnh chứng từ', hasItemManifest: 'Bảng kê', isAdjustment: 'Hóa đơn điều chỉnh', originalInvoiceRef: 'Hóa đơn gốc',
};
/** Quy tắc về nội dung khoản chi (đồ uống có cồn, ngoài phạm vi SOP, sai 8%). */
const SCOPE_RULES = new Set(['INTERNAL_POLICY_GUEST_ENTERTAINMENT', 'RULE_SCOPE_NOT_COVERED', 'STATUTORY_RES_204_VAT_8_EXCLUDED', 'RULE_SCOPE_VAT8_PERIOD']);

type PrecedentRef = { precedentId: string; approvedBy: string; rationale: string };

export function explainDecision(inv: InvoiceInput, decision: Pick<RefereeDecision, 'status' | 'findings'> & { approvedTaxAmount?: number; precedentApplied?: PrecedentRef }, config: Partial<SystemPolicyConfig> = {}): DecisionExplanation {
  const approved = decision.status === 'ROUTINE';
  // Ca tự duyệt nhờ tiền lệ CFO: engine vẫn trả các phát hiện quy chế nội bộ đã được tiền lệ giải tỏa (policyEngine, nhánh ROUTINE).
  // Chúng không còn là "chỗ chưa ổn": tách riêng, không tô đỏ, ghi chú tiền lệ.
  const precedent = approved ? decision.precedentApplied : undefined;
  const all = decision.findings ?? [];
  const cleared = precedent ? all.filter(f => f.kind === 'INTERNAL_POLICY') : [];
  const findings = all.filter(f => !cleared.includes(f));
  const has = (pred: (ruleId: string) => boolean) => findings.some(f => pred(f.ruleId));
  const threshold = paymentThreshold(inv, config);
  const kttLimit = config.kttApprovalLimit ?? 200_000_000;
  const materiality = config.sellerStatusMaterialityVnd ?? 20_000_000;
  const total = Math.abs(inv.totalAmount);
  const checks: ExplainCheck[] = [];

  const sumOk = Math.abs(inv.preTaxAmount + inv.taxAmount - inv.totalAmount) <= AMOUNT_TOLERANCE_VND;
  checks.push({ key: 'arithmetic', ok: sumOk, label: 'Số tiền cộng đúng',
    detail: `Tiền hàng ${vnd(inv.preTaxAmount)} + thuế ${vnd(inv.taxAmount)} ${sumOk ? '=' : '≠'} tổng ${vnd(inv.totalAmount)}` });

  const taxOk = headerTaxMatches(inv);
  checks.push({ key: 'taxMath', ok: taxOk, label: 'Tiền thuế đúng thuế suất',
    detail: taxOk ? `Thuế ${vnd(inv.taxAmount)} khớp thuế suất ${inv.items && new Set(inv.items.map(l => l.taxRate)).size > 1 ? 'từng nhóm dòng hàng' : `${inv.taxRate}%`}`
      : `Thuế in ${vnd(inv.taxAmount)}, tính lại được ${vnd(expectedHeaderTax(inv))}` });

  // Cùng điều kiện với engine (usesVat8): đầu hóa đơn 8% hoặc có dòng hàng 8% (hóa đơn nhiều thuế suất).
  if (inv.taxRate === 8 || (inv.items ?? []).some(line => line.taxRate === 8)) {
    const period = vatReductionAt(inv.invoiceDate);
    const excluded = has(id => id === 'STATUTORY_RES_204_VAT_8_EXCLUDED' || id === 'RULE_SCOPE_VAT8_PERIOD');
    // Engine chỉ so tên hàng với danh mục từ khóa: phiếu nói đúng phép kiểm đó, không khẳng định mặt hàng "không thuộc nhóm loại trừ".
    checks.push({ key: 'vat8', ok: Boolean(period) && !excluded, label: 'Được áp thuế suất 8%',
      detail: !period ? `Ngày lập ${inv.invoiceDate} nằm ngoài mọi kỳ giảm thuế` : excluded ? `Mặt hàng có thể thuộc nhóm không được giảm (${period.basis})`
        : `Trong kỳ giảm thuế theo ${period.basis}; tên hàng không khớp danh mục từ khóa loại trừ đang cấu hình (kiểm tự động theo tên hàng)` });
  }

  const cashRule = has(id => id === 'STATUTORY_LAW_48_CASH_PAYMENT' || id === 'STATUTORY_SAME_DAY_CASH_5M');
  checks.push({ key: 'payment', ok: total < threshold && !cashRule ? true : !cashRule && inv.paymentMethod === 'BANK_TRANSFER' && inv.hasBankSlip === true ? true : cashRule ? false : null,
    label: 'Điều kiện thanh toán',
    detail: cashRule ? `Từ ${vnd(threshold)} trả tiền mặt (hoặc cụm mua cùng ngày) — chưa đủ chứng từ không dùng tiền mặt`
      : total < threshold ? `${vnd(total)} dưới ngưỡng ${vnd(threshold)}: không bắt buộc chứng từ không dùng tiền mặt`
      : inv.paymentMethod === 'BANK_TRANSFER' && inv.hasBankSlip === true ? 'Chuyển khoản, đã có chứng từ thanh toán' : 'Chưa xác nhận chứng từ thanh toán' });

  const overLimit = has(id => id === 'AUTHORITY_EXCEED_KTT_LIMIT' || id === 'AUTHORITY_SPLIT_PURCHASE');
  checks.push({ key: 'authority', ok: !overLimit && total < kttLimit, label: 'Trong hạn mức tự duyệt',
    detail: overLimit || total >= kttLimit ? `${vnd(total)} từ hạn mức ${vnd(kttLimit)} trở lên (hoặc mua tách nhỏ) — cần CFO` : `${vnd(total)} dưới hạn mức ${vnd(kttLimit)} của Kế toán trưởng` });

  const buyerMismatch = has(id => id === 'RULE_BUYER_TAX_CODE_MISMATCH');
  const companyTaxCode = config.companyTaxCode;
  checks.push({ key: 'buyer', ok: buyerMismatch ? false : inv.buyerTaxCode && companyTaxCode ? true : null, label: 'Đúng MST người mua',
    detail: buyerMismatch ? `MST người mua ${inv.buyerTaxCode} khác MST doanh nghiệp` : !inv.buyerTaxCode ? 'Hóa đơn không ghi MST người mua' : companyTaxCode ? `MST người mua ${inv.buyerTaxCode} đúng doanh nghiệp` : 'Chưa cấu hình MST doanh nghiệp để đối chiếu' });

  const sellerRule = has(id => id.includes('SELLER'));
  checks.push({ key: 'seller', ok: sellerRule ? false : inv.sellerStatus === 'ACTIVE' ? true : total < materiality ? null : false, label: 'Bên bán còn hoạt động',
    detail: sellerRule ? 'Bên bán tạm ngừng, đã đóng MST hoặc có cảnh báo' : inv.sellerStatus === 'ACTIVE' ? 'MST bên bán đang hoạt động'
      : total < materiality ? `Dưới ${vnd(materiality)}: quy chế không bắt buộc tra trạng thái` : 'Chưa xác minh trạng thái MST bên bán' });

  const isScope = (f: { ruleId: string }) => SCOPE_RULES.has(f.ruleId) && f.ruleId !== 'STATUTORY_RES_204_VAT_8_EXCLUDED' && f.ruleId !== 'RULE_SCOPE_VAT8_PERIOD';
  const scope = findings.filter(isScope);
  const clearedLabels = cleared.map(f => ruleContract(f.ruleId).label).join('; ');
  const precedentNote = precedent ? `áp tiền lệ #${precedent.precedentId} đã được CFO duyệt` : '';
  checks.push({ key: 'scope', ok: scope.length === 0, label: 'Nội dung chi trong phạm vi quy chế',
    detail: scope.length ? scope.map(f => ruleContract(f.ruleId).label).join('; ')
      : cleared.some(isScope) ? `${cleared.filter(isScope).map(f => ruleContract(f.ruleId).label).join('; ')} — ${precedentNote}`
      : 'Không có đồ uống có cồn, quà biếu, chi cá nhân hay khoản ngoài quy chế' });

  const duplicate = has(id => id.includes('DUPLICATE'));
  checks.push({ key: 'duplicate', ok: !duplicate, label: 'Không trùng hóa đơn đã nhận', detail: duplicate ? 'Trùng số và MST với hóa đơn đã có' : 'Chưa từng nhận hóa đơn này' });

  const highlights: ExplainHighlight[] = findings.map(f => {
    const tax = taxonomyOf(f.ruleId, f.kind);
    const fields = tax.triggerFields.filter(field => field in FIELD_LABELS);
    return { ruleId: f.ruleId, ruleLabel: ruleContract(f.ruleId).label, group: tax.group, groupLabel: RISK_GROUP_LABELS[tax.group], fields,
      fieldLabels: fields.map(field => FIELD_LABELS[field]), reason: f.flaggedReason };
  });

  const vatAtStake = approved ? 0 : Math.max(0, inv.taxAmount);
  const passed = checks.filter(c => c.ok === true).length;
  const viaPrecedent = approved && cleared.length > 0;
  return {
    verdict: approved ? 'APPROVED' : 'STOPPED',
    headline: approved
      ? `Máy đề xuất duyệt: đạt ${passed} điều kiện, khấu trừ ${vnd(decision.approvedTaxAmount ?? inv.taxAmount)}${viaPrecedent ? ' — áp tiền lệ CFO' : ''}`
      : `Dừng ở ${highlights.length} điểm — VAT chờ quyết định ${vnd(vatAtStake)}`,
    plain: viaPrecedent
      ? `Khoản chi này bình thường phải hỏi (${clearedLabels}), nhưng đã có tiền lệ #${precedent?.precedentId} được CFO duyệt cho đúng bên bán và mục đích này; các điều kiện khác đều đạt nên máy đề xuất duyệt. Kế toán trưởng chốt lô thì mới ghi sổ.`
      : approved
      ? 'Giống bài kiểm tra không sai câu nào: không điều kiện nào trượt nên máy đề xuất duyệt. Kế toán trưởng chốt lô thì mới ghi sổ.'
      : `Có ${highlights.length === 1 ? 'một chỗ' : `${highlights.length} chỗ`} chưa ổn (tô đỏ bên dưới) nên máy không tự quyết — hỏi đúng người có quyền.`,
    checks,
    highlights,
    vatAtStake,
    basisNote: `Ngưỡng thanh toán theo ngày lập ${inv.invoiceDate}: ${cashPaymentBasis(inv.invoiceDate)}.`,
  };
}
