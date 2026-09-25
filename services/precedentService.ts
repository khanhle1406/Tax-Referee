import { getDatabase, jsonNow } from '@/lib/server/db';
import { CorporatePrecedent, CorporatePrecedentSchema, InvoiceInput } from '@/lib/schemas';

/**
 * Tìm tiền lệ hợp lệ của CFO cho nhà cung cấp và mẫu rủi ro (IMP-12)
 */
export function findPrecedentForInvoice(
  invoice: InvoiceInput,
  riskPattern: string
): CorporatePrecedent | null {
  try {
    const db = getDatabase();
    const currentDate = invoice.invoiceDate || new Date().toISOString().slice(0, 10);

    const rows = db.prepare(`
      SELECT 
        id, supplier_tax_code as supplierTaxCode, supplier_name as supplierName,
        risk_pattern as riskPattern, sop_clause as sopClause,
        approved_option as approvedOption, rationale, approved_by as approvedBy,
        effective_from as effectiveFrom, effective_to as effectiveTo,
        status, created_at as createdAt
      FROM corporate_precedents
      WHERE supplier_tax_code = ?
        AND status = 'ACTIVE'
        AND effective_from <= ?
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY datetime(created_at) DESC
    `).all(invoice.supplierTaxCode, currentDate, currentDate) as any[];

    for (const row of rows) {
      // Khớp chính xác pattern hoặc khớp bao quát
      if (
        row.riskPattern === riskPattern ||
        row.riskPattern === 'ALL_EXCEPTIONS' ||
        (riskPattern.includes('OUT_OF_POLICY') && row.riskPattern.includes('OUT_OF_POLICY'))
      ) {
        return CorporatePrecedentSchema.parse(row);
      }
    }

    return null;
  } catch (err) {
    console.warn('Lỗi tra cứu tiền lệ doanh nghiệp:', err);
    return null;
  }
}

/**
 * Tạo mới tiền lệ ngoại lệ được CFO phê duyệt
 */
export function createPrecedent(params: {
  supplierTaxCode: string;
  supplierName: string;
  riskPattern: string;
  sopClause: string;
  approvedOption: string;
  rationale: string;
  approvedBy: string;
  effectiveMonths?: number;
}): CorporatePrecedent {
  const db = getDatabase();
  const id = `PREC-${Date.now().toString(36).toUpperCase()}`;
  const now = jsonNow();
  const effectiveFrom = now.slice(0, 10);

  const months = params.effectiveMonths || 6;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const effectiveTo = d.toISOString().slice(0, 10);

  const precedent: CorporatePrecedent = {
    id,
    supplierTaxCode: params.supplierTaxCode,
    supplierName: params.supplierName,
    riskPattern: params.riskPattern,
    sopClause: params.sopClause,
    approvedOption: params.approvedOption,
    rationale: params.rationale,
    approvedBy: params.approvedBy,
    effectiveFrom,
    effectiveTo,
    status: 'ACTIVE',
    createdAt: now
  };

  db.prepare(`
    INSERT INTO corporate_precedents (
      id, supplier_tax_code, supplier_name, risk_pattern, sop_clause,
      approved_option, rationale, approved_by, effective_from, effective_to,
      status, created_at
    ) VALUES (
      @id, @supplierTaxCode, @supplierName, @riskPattern, @sopClause,
      @approvedOption, @rationale, @approvedBy, @effectiveFrom, @effectiveTo,
      @status, @createdAt
    )
  `).run(precedent);

  return precedent;
}

/**
 * Lấy toàn bộ danh sách tiền lệ cho trang quản trị
 */
export function listCorporatePrecedents(): CorporatePrecedent[] {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT 
        id, supplier_tax_code as supplierTaxCode, supplier_name as supplierName,
        risk_pattern as riskPattern, sop_clause as sopClause,
        approved_option as approvedOption, rationale, approved_by as approvedBy,
        effective_from as effectiveFrom, effective_to as effectiveTo,
        status, created_at as createdAt
      FROM corporate_precedents
      ORDER BY datetime(created_at) DESC
    `).all() as any[];

    return rows.map(r => CorporatePrecedentSchema.parse(r));
  } catch (err) {
    console.warn('Lỗi lấy danh sách tiền lệ:', err);
    return [];
  }
}

/**
 * Thu hồi một tiền lệ
 */
export function revokeCorporatePrecedent(id: string): boolean {
  try {
    const db = getDatabase();
    const res = db.prepare(`
      UPDATE corporate_precedents
      SET status = 'REVOKED'
      WHERE id = ?
    `).run(id);
    return res.changes > 0;
  } catch (err) {
    console.warn('Lỗi thu hồi tiền lệ:', err);
    return false;
  }
}
