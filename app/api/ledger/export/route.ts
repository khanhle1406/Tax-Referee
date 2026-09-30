import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
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

export async function GET(request: NextRequest) {
  try {
    requireRequestUser(request);
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xml'; // 'xml' | 'csv' | 'json'
    const regime = (searchParams.get('regime') === 'CIRCULAR_133' ? 'CIRCULAR_133' : 'CIRCULAR_99_200') as 'CIRCULAR_99_200' | 'CIRCULAR_133';

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT
        i.id, i.invoice_number, i.supplier_tax_code, i.invoice_date,
        i.payload_json, i.status AS invoice_status,
        e.decision_json
      FROM invoices i
      LEFT JOIN evaluations e ON e.id = (
        SELECT e2.id FROM evaluations e2
        WHERE e2.invoice_id = i.id
        ORDER BY datetime(e2.created_at) DESC LIMIT 1
      )
      ORDER BY datetime(i.updated_at) DESC
      LIMIT 200
    `).all() as Array<Record<string, unknown>>;

    const vouchers: CanonicalLedgerVoucher[] = [];
    let counter = 1;

    for (const row of rows) {
      const invoice = parseJson<InvoiceInput | null>(row.payload_json, null);
      if (!invoice) continue;
      const decision = parseJson<RefereeDecision | null>(row.decision_json, null);
      vouchers.push(generateCanonicalVoucher(invoice, decision, counter++, regime));
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi xuất tệp kế toán' },
      { status: 500 }
    );
  }
}
