import { RequestError, requestErrorResponse } from '@/lib/server/http';
import { withRequestDatabase } from '@/lib/server/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { LEDGER_READY_SQL } from '@/services/batchService';
import { getDatabase } from '@/lib/server/db';
import { InvoiceInput, RefereeDecision } from '@/lib/schemas';
import { generateCanonicalVoucher } from '@/lib/accounting/ledgerMapper';
import { formatMisaAmisPayload } from '@/lib/accounting/adapters/misaAdapter';
import { formatFastAccountingPayload } from '@/lib/accounting/adapters/fastAdapter';
import { generateUniversalCsv, generateUniversalXml } from '@/lib/accounting/adapters/universalXmlExporter';
import { CanonicalLedgerVoucher, LedgerSyncRequest, LedgerSyncResult } from '@/lib/accounting/types';

export const dynamic = 'force-dynamic';

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return value ? (JSON.parse(String(value)) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function handleGET(request: NextRequest) {
  try {
    requireRequestUser(request);
    const db = getDatabase();

    const { searchParams } = new URL(request.url);
    const regime = (searchParams.get('regime') === 'CIRCULAR_133' ? 'CIRCULAR_133' : 'CIRCULAR_99_200') as 'CIRCULAR_99_200' | 'CIRCULAR_133';

    const rows = db.prepare(`
      SELECT
        i.id, i.invoice_number, i.supplier_tax_code, i.invoice_date,
        i.payload_json, i.status AS invoice_status, i.approved_deductible_tax,
        e.decision_json
      FROM invoices i
      LEFT JOIN evaluations e ON e.id = (
        SELECT e2.id FROM evaluations e2
        WHERE e2.invoice_id = i.id
        ORDER BY datetime(e2.created_at) DESC LIMIT 1
      )
      WHERE i.status = 'APPROVED'
        AND ${LEDGER_READY_SQL}
      ORDER BY datetime(i.updated_at) DESC
      LIMIT 100
    `).all() as Array<Record<string, unknown>>;

    const vouchers: CanonicalLedgerVoucher[] = [];
    let voucherCounter = 1;

    for (const row of rows) {
      const invoice = parseJson<InvoiceInput | null>(row.payload_json, null);
      if (!invoice) continue;

      const decision = parseJson<RefereeDecision | null>(row.decision_json, null);
      const explicitTax = typeof row.approved_deductible_tax === 'number' ? Number(row.approved_deductible_tax) : undefined;
      const voucher = generateCanonicalVoucher(invoice, decision, voucherCounter++, regime, explicitTax);
      vouchers.push(voucher);
    }

    const totalDebit = vouchers.reduce(
      (sum, v) => sum + v.entries.reduce((s, e) => s + e.debitAmount, 0),
      0
    );
    const totalCredit = vouchers.reduce(
      (sum, v) => sum + v.entries.reduce((s, e) => s + e.creditAmount, 0),
      0
    );

    return NextResponse.json({
      success: true,
      count: vouchers.length,
      totalDebit,
      totalCredit,
      isBalanced: totalDebit === totalCredit,
      vouchers
    });
  } catch (err) {
    return requestErrorResponse(err, 'Lỗi lấy sổ kế toán');
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    // Xuất chứng từ sang phần mềm kế toán là bước ghi sổ: chỉ Kế toán trưởng/CFO, không phải người nhập.
    if (!['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)) throw new RequestError('Chỉ Kế toán trưởng hoặc CFO được xuất chứng từ sang phần mềm kế toán.', 403);
    const body = (await request.json()) as LedgerSyncRequest;
    const { targetSystem = 'MISA_AMIS', voucherIds, regime = 'CIRCULAR_99_200' } = body;

    if (!['MISA_AMIS', 'FAST_ACCOUNTING', 'UNIVERSAL_XML', 'UNIVERSAL_EXCEL'].includes(targetSystem)) throw new RequestError('Adapter kế toán không hợp lệ.');
    if (!['CIRCULAR_133', 'CIRCULAR_99_200'].includes(regime)) throw new RequestError('Chế độ kế toán không hợp lệ.');
    if (voucherIds !== undefined && (!Array.isArray(voucherIds) || voucherIds.some(id => typeof id !== 'string'))) throw new RequestError('Danh sách chứng từ không hợp lệ.');
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT
        i.id, i.invoice_number, i.supplier_tax_code, i.invoice_date,
        i.payload_json, i.status AS invoice_status, i.approved_deductible_tax,
        e.decision_json
      FROM invoices i
      LEFT JOIN evaluations e ON e.id = (
        SELECT e2.id FROM evaluations e2
        WHERE e2.invoice_id = i.id
        ORDER BY datetime(e2.created_at) DESC LIMIT 1
      )
      WHERE i.status = 'APPROVED'
        AND ${LEDGER_READY_SQL}
      ORDER BY datetime(i.updated_at) DESC
    `).all() as Array<Record<string, unknown>>;

    let vouchers: CanonicalLedgerVoucher[] = [];
    let counter = 1;

    for (const row of rows) {
      const invoice = parseJson<InvoiceInput | null>(row.payload_json, null);
      if (!invoice) continue;
      const decision = parseJson<RefereeDecision | null>(row.decision_json, null);
      const explicitTax = typeof row.approved_deductible_tax === 'number' ? Number(row.approved_deductible_tax) : undefined;
      const voucher = generateCanonicalVoucher(invoice, decision, counter++, regime, explicitTax);

      if (!voucherIds || voucherIds.length === 0 || voucherIds.includes(voucher.id)) {
        vouchers.push(voucher);
      }
    }

    const totalDebit = vouchers.reduce(
      (sum, v) => sum + v.entries.reduce((s, e) => s + e.debitAmount, 0),
      0
    );
    const totalCredit = vouchers.reduce(
      (sum, v) => sum + v.entries.reduce((s, e) => s + e.creditAmount, 0),
      0
    );

    const batchReference = `SYNC-${targetSystem}-${Date.now().toString().slice(-6)}`;

    // Sinh payload mẫu theo adapter tương ứng
    let exportedData = '';
    if (targetSystem === 'MISA_AMIS') {
      exportedData = JSON.stringify(formatMisaAmisPayload(vouchers), null, 2);
    } else if (targetSystem === 'FAST_ACCOUNTING') {
      exportedData = JSON.stringify(formatFastAccountingPayload(vouchers), null, 2);
    } else if (targetSystem === 'UNIVERSAL_XML') {
      exportedData = generateUniversalXml(vouchers);
    } else if (targetSystem === 'UNIVERSAL_EXCEL') {
      exportedData = generateUniversalCsv(vouchers);
    }

    const result: LedgerSyncResult = {
      success: true,
      targetSystem,
      syncedCount: vouchers.length,
      totalDebit,
      totalCredit,
      batchReference,
      timestamp: new Date().toISOString(),
      vouchers: vouchers.map((v) => ({
        ...v,
        status: 'READY_TO_POST',
        targetSystem,
        postedAt: new Date().toISOString()
      })),
      exportedData
    };

    return NextResponse.json(result);
  } catch (err) {
    return requestErrorResponse(err, 'Lỗi đồng bộ sổ sách');
  }
}

export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }

export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
