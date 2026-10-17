import { AppUser } from '@/lib/server/auth';
import { recordBankEvidence } from './workflowService';
import { BankTransaction, InvoiceInput } from '@/lib/schemas';
import { getDatabase, jsonNow } from '@/lib/server/db';

export interface InvoiceBankMatch {
  invoiceId: string;
  transactionId: string;
  score: number;
  matchReasons: string[];
  isAutoMatched: boolean; // score >= 80
}

export interface BankMatchingResult {
  matchedPairs: InvoiceBankMatch[];
  suggestedPairs: InvoiceBankMatch[];
  unmatchedInvoices: InvoiceInput[];
  unmatchedTransactions: BankTransaction[];
}

export interface SameDayRuleResult {
  isViolation: boolean;
  dailyTotal: number;
  invoiceCount: number;
  violatingInvoiceIds: string[];
  reason?: string;
  /** Các hóa đơn trong cụm (đã khử trùng) — để câu hỏi chuyển tiếp nêu đúng từng tờ. */
  invoices?: InvoiceInput[];
}

function normalizeMst(mst?: string): string {
  if (!mst) return '';
  const cleaned = mst.replace(/[^0-9-]/g, '').trim();
  return cleaned.replace(/-/g, '').length === 10 ? cleaned.replace(/-/g, '') : cleaned;
}

function normalizeText(text?: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tính điểm tương đồng giữa Hóa đơn và Giao dịch ngân hàng (Thang 100 điểm)
 */
export function calculateMatchScore(inv: InvoiceInput, txn: BankTransaction): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // 1. So khớp Số tiền thanh toán (Tối đa 40 điểm)
  const diffAmount = Math.abs(txn.debitAmount - inv.totalAmount);
  if (diffAmount === 0) {
    score += 40;
    reasons.push('Khớp 100% số tiền thanh toán (' + inv.totalAmount.toLocaleString('vi-VN') + '₫)');
  } else if (diffAmount <= 11000) {
    score += 35;
    reasons.push('Khớp số tiền thanh toán (chênh lệch phí chuyển khoản ' + diffAmount.toLocaleString('vi-VN') + '₫)');
  } else {
    // Nếu số tiền lệch quá nhiều -> không thể khớp
    return { score: 0, reasons: ['Lệch số tiền thanh toán'] };
  }

  // 2. So khớp Đơn vị thụ hưởng / MST người bán (Tối đa 30 điểm)
  const cleanSupplierMst = normalizeMst(inv.supplierTaxCode);
  const cleanBenMst = normalizeMst(txn.beneficiaryTaxCode);
  const normDesc = normalizeText(txn.description);
  const normBenName = normalizeText(txn.beneficiaryName);
  const normSupplierName = normalizeText(inv.supplierName);

  if (cleanBenMst && cleanBenMst === cleanSupplierMst) {
    score += 30;
    reasons.push('Khớp chính xác MST đơn vị thụ hưởng (' + cleanSupplierMst + ')');
  } else if (normDesc.includes(cleanSupplierMst)) {
    score += 30;
    reasons.push('Nội dung chuyển khoản chứa MST nhà cung cấp (' + cleanSupplierMst + ')');
  } else {
    // So khớp tên nhà cung cấp
    const words = normSupplierName.split(' ').filter(w => w.length > 2 && !['CONG', 'TY', 'TNHH', 'CP', 'CO', 'PHAN'].includes(w));
    const matchedWords = words.filter(w => normBenName.includes(w) || normDesc.includes(w));
    if (words.length > 0 && matchedWords.length / words.length >= 0.6) {
      score += 25;
      reasons.push('Khớp tên đơn vị thụ hưởng / nhà cung cấp (' + inv.supplierName + ')');
    }
  }

  // 3. So khớp Số hóa đơn trong nội dung chuyển tiền (Tối đa 20 điểm)
  const invNumberClean = inv.invoiceNumber.replace(/^0+/, ''); // Bỏ số 0 đầu
  if (invNumberClean.length > 0 && (normDesc.includes(inv.invoiceNumber) || normDesc.includes(`HD ${invNumberClean}`) || normDesc.includes(`HĐ ${invNumberClean}`))) {
    score += 20;
    reasons.push('Nội dung chuyển khoản chứa số hóa đơn (' + inv.invoiceNumber + ')');
  }

  // 4. So khớp Cửa sổ thời gian thanh toán (Tối đa 10 điểm)
  const invTime = new Date(inv.invoiceDate).getTime();
  const txnTime = new Date(txn.transactionDate).getTime();
  const dayDiff = Math.round((txnTime - invTime) / (1000 * 60 * 60 * 24));

  if (dayDiff >= -15 && dayDiff <= 60) {
    score += 10;
    reasons.push(`Thời gian chuyển khoản trong hạn hợp lý (${dayDiff >= 0 ? dayDiff + ' ngày sau ngày HĐ' : Math.abs(dayDiff) + ' ngày trước ngày HĐ - tạm ứng'})`);
  }

  return { score, reasons };
}

/**
 * Thuật toán Tự động khớp danh sách Hóa đơn với Sao kê Ngân hàng
 */
export function matchInvoicesWithBankTransactions(
  invoices: InvoiceInput[],
  transactions: BankTransaction[]
): BankMatchingResult {
  const matchedPairs: InvoiceBankMatch[] = [];
  const suggestedPairs: InvoiceBankMatch[] = [];

  const matchedTxnIds = new Set<string>();
  const matchedInvIds = new Set<string>();

  // Ưu tiên khớp các hóa đơn chưa có UNC hoặc thanh toán ngân hàng
  for (const inv of invoices) {
    let bestMatch: { txn: BankTransaction; score: number; reasons: string[] } | null = null;

    for (const txn of transactions) {
      if (matchedTxnIds.has(txn.id)) continue;
      // Chỉ khớp các giao dịch chi tiền (debitAmount > 0)
      if (txn.debitAmount <= 0) continue;

      const { score, reasons } = calculateMatchScore(inv, txn);
      if (score >= 60 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { txn, score, reasons };
      }
    }

    if (bestMatch) {
      const isAuto = bestMatch.score >= 80;
      const pair: InvoiceBankMatch = {
        invoiceId: inv.id,
        transactionId: bestMatch.txn.id,
        score: bestMatch.score,
        matchReasons: bestMatch.reasons,
        isAutoMatched: isAuto
      };

      if (isAuto) {
        matchedPairs.push(pair);
        matchedTxnIds.add(bestMatch.txn.id);
        matchedInvIds.add(inv.id);
      } else {
        suggestedPairs.push(pair);
      }
    }
  }

  const unmatchedInvoices = invoices.filter(inv => !matchedInvIds.has(inv.id));
  const unmatchedTransactions = transactions.filter(txn => !matchedTxnIds.has(txn.id));

  return {
    matchedPairs,
    suggestedPairs,
    unmatchedInvoices,
    unmatchedTransactions
  };
}

/**
 * Áp dụng kết quả khớp tự động vào Database:
 * Cập nhật hasBankSlip = true và lưu tham chiếu số bút toán ngân hàng vào hóa đơn
 */
export function applyAutoMatchToDatabase(matches: InvoiceBankMatch[], user: AppUser): number {
  if (matches.length === 0) return 0;
  const db = getDatabase();
  let count = 0;

  const updateTxnStmt = db.prepare(`
    UPDATE bank_transactions
    SET matched_invoice_id = ?, match_score = ?, matched_at = ?
    WHERE id = ?
  `);

  const now = jsonNow();
  const tx = db.transaction((items: InvoiceBankMatch[]) => {
    for (const m of items) {
      if (!m.isAutoMatched) continue;
      const changed = recordBankEvidence(m.invoiceId, m.transactionId, user);
      updateTxnStmt.run(m.invoiceId, m.score, now, m.transactionId);
      if (changed) count++;
    }
  });

  tx(matches);
  return count;
}

/**
 * QUY TẮC GỘP NHIỀU HÓA ĐƠN TRONG NGÀY >= 5.000.000 VNĐ (Luật Thuế GTGT 48/2024/QH15)
 * Căn cứ: khoản 3 Điều 26 NĐ 181/2025/NĐ-CP (từ 01/7/2025); khoản 5 Điều 15 TT 219/2013/TT-BTC (trước đó)
 */
export function checkSameDayMultipleInvoicesRule(
  currentInvoice: InvoiceInput,
  allInvoices: InvoiceInput[],
  threshold: number = 5_000_000
): SameDayRuleResult {
  const currentMst = normalizeMst(currentInvoice.supplierTaxCode);
  const currentDate = currentInvoice.invoiceDate;

  // Lọc tất cả hóa đơn cùng nhà cung cấp và cùng ngày lập
  const sameDayInvoices = [...new Map(allInvoices.filter(inv => normalizeMst(inv.supplierTaxCode)===currentMst && inv.invoiceDate===currentDate && inv.totalAmount>0 && !inv.isAdjustment)
    .map(inv=>[`${inv.supplierTaxCode}:${inv.invoiceSeries || ''}:${inv.invoiceNumber}`,inv])).values()];

  // Nếu chỉ có 1 hóa đơn và chính là currentInvoice thì chưa kích hoạt quy tắc gộp
  if (sameDayInvoices.length <= 1) {
    return {
      isViolation: false,
      dailyTotal: currentInvoice.totalAmount,
      invoiceCount: 1,
      violatingInvoiceIds: []
    };
  }

  const dailyTotal = sameDayInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // Nếu tổng các hóa đơn trong ngày >= 5.000.000 VNĐ
  if (dailyTotal >= threshold) {
    // Kiểm tra xem có hóa đơn nào thanh toán tiền mặt hoặc chưa có chứng từ ngân hàng không
    // Nhân viên trả tiền mặt cho bên bán vẫn là thanh toán tiền mặt (cùng quy tắc với hóa đơn đơn lẻ), kể cả khi được hoàn ứng qua ngân hàng.
    const violatingInvoices = sameDayInvoices.filter(inv => inv.paymentMethod === 'CASH');
    if (violatingInvoices.length > 0) {
      return {
        isViolation: true,
        dailyTotal,
        invoiceCount: sameDayInvoices.length,
        violatingInvoiceIds: violatingInvoices.map(inv => inv.id),
        invoices: sameDayInvoices,
        reason: `Phát hiện cụm ${sameDayInvoices.length} hóa đơn cùng ngày (${currentDate}) từ nhà cung cấp [${currentInvoice.supplierName} - MST ${currentInvoice.supplierTaxCode}] có tổng thanh toán ${dailyTotal.toLocaleString('vi-VN')}₫ (vượt ngưỡng 5 triệu đồng theo Luật Thuế GTGT 48/2024/QH15). Tất cả hóa đơn trong cụm bắt buộc phải thanh toán không dùng tiền mặt (Ủy nhiệm chi ngân hàng).`
      };
    }
  }

  return {
    isViolation: false,
    dailyTotal,
    invoiceCount: sameDayInvoices.length,
    violatingInvoiceIds: []
  };
}
