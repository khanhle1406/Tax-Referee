import { RequestError, requestErrorResponse } from '@/lib/server/http';
import { withRequestDatabase } from '@/lib/server/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { LEDGER_READY_SQL } from '@/services/batchService';
import { getDatabase } from '@/lib/server/db';
import { InvoiceInput, RefereeDecision } from '@/lib/schemas';
import { generateCanonicalVoucher } from '@/lib/accounting/ledgerMapper';
import { generateUniversalXml, generateUniversalCsv } from '@/lib/accounting/adapters/universalXmlExporter';
import { CanonicalLedgerVoucher } from '@/lib/accounting/types';

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
    const user = requireRequestUser(request);
    // Tải XML sổ cái / CSV bảng kê để nạp vào phần mềm kế toán là bước ghi sổ: chỉ Kế toán trưởng/CFO, không phải người nhập.
    if (!['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)) throw new RequestError('Chỉ Kế toán trưởng hoặc CFO được xuất chứng từ sang phần mềm kế toán.', 403);
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xml'; // 'xml' | 'csv' | 'json'
    const regime = (searchParams.get('regime') === 'CIRCULAR_133' ? 'CIRCULAR_133' : 'CIRCULAR_99_200') as 'CIRCULAR_99_200' | 'CIRCULAR_133';

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
      LIMIT 200
    `).all() as Array<Record<string, unknown>>;

    const vouchers: CanonicalLedgerVoucher[] = [];
    let counter = 1;

    for (const row of rows) {
      const invoice = parseJson<InvoiceInput | null>(row.payload_json, null);
      if (!invoice) continue;
      const decision = parseJson<RefereeDecision | null>(row.decision_json, null);
      const explicitTax = typeof row.approved_deductible_tax === 'number' ? Number(row.approved_deductible_tax) : undefined;
      vouchers.push(generateCanonicalVoucher(invoice, decision, counter++, regime, explicitTax));
    }

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csv = generateUniversalCsv(vouchers);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Bang_Ke_Chung_Tu_Ghi_So_${timestamp}.csv"`
        }
      });
    }

    if (format === 'json') {
      return NextResponse.json({
        standard: 'Circular 99/2025/TT-BTC',
        exportedAt: new Date().toISOString(),
        totalVouchers: vouchers.length,
        vouchers
      });
    }

    // Default: XML format
    const xml = generateUniversalXml(vouchers);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="So_Cai_Dien_Tu_TT99_${timestamp}.xml"`
      }
    });
  } catch (err) {
    return requestErrorResponse(err, 'Lỗi xuất tệp kế toán');
  }
}

export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }
