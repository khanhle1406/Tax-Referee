import type { InvoiceInput } from '@/lib/schemas';

/** Dung sai làm tròn khi đối chiếu số tiền trên hóa đơn (₫). */
export const AMOUNT_TOLERANCE_VND = 10;

type TaxInputs = Pick<InvoiceInput, 'preTaxAmount' | 'taxRate' | 'items'>;

/**
 * Thuế theo nhóm thuế suất khi hóa đơn có từ hai thuế suất (VD văn phòng phẩm 8% + cước viễn thông 10%): mỗi nhóm
 * = làm tròn(tổng tiền hàng của nhóm × thuế suất), như khối tổng hợp theo thuế suất của hóa đơn điện tử. Không cần thuế
 * từng dòng (XML thực tế thường không ghi); số học từng dòng đã có RULE_LINE_ITEM_MISMATCH kiểm. Tổng tiền hàng các dòng
 * phải khớp tiền hàng đầu hóa đơn, không thì trả null.
 */
export function multiRateLineTax(inv: TaxInputs): number | null {
  const lines = inv.items ?? [];
  if (lines.length < 2 || new Set(lines.map(line => line.taxRate)).size < 2) return null;
  const sumAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  if (Math.abs(sumAmount - inv.preTaxAmount) > AMOUNT_TOLERANCE_VND * lines.length) return null;
  const byRate = new Map<number, number>();
  for (const line of lines) byRate.set(line.taxRate, (byRate.get(line.taxRate) ?? 0) + line.amount);
  return [...byRate].reduce((sum, [rate, amount]) => sum + Math.round(amount * rate / 100), 0);
}

/**
 * Tiền thuế kỳ vọng ở phần tổng của hóa đơn: hóa đơn nhiều thuế suất hợp lệ thì bằng tổng thuế theo nhóm thuế suất, còn lại là
 * tiền hàng × thuế suất. Nguồn duy nhất cho engine (RULE_DATA_QUALITY), câu hỏi chuyển tiếp và hệ quả đáp án.
 */
/**
 * Thuế in ở phần tổng có khớp không: khớp thuế kỳ vọng, hoặc — với hóa đơn nhiều thuế suất mà mỗi dòng tự khớp — khớp tổng
 * thuế từng dòng (hóa đơn nhiều dòng làm tròn từng dòng có thể lệch cách làm tròn theo nhóm quá 10₫).
 */
export function headerTaxMatches(inv: TaxInputs & Pick<InvoiceInput, 'taxAmount'>): boolean {
  if (Math.abs(inv.taxAmount - expectedHeaderTax(inv)) <= AMOUNT_TOLERANCE_VND) return true;
  const lines = inv.items ?? [];
  if (multiRateLineTax(inv) === null) return false;
  const linesConsistent = lines.every(line => Math.abs(line.taxAmount - Math.round(line.amount * line.taxRate / 100)) <= AMOUNT_TOLERANCE_VND);
  return linesConsistent && Math.abs(inv.taxAmount - lines.reduce((sum, line) => sum + line.taxAmount, 0)) <= AMOUNT_TOLERANCE_VND;
}

export function expectedHeaderTax(inv: TaxInputs): number {
  return multiRateLineTax(inv) ?? Math.round(inv.preTaxAmount * inv.taxRate / 100);
}
