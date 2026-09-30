import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';
import { InvoiceInput, RefereeDecision } from '@/lib/schemas';
import { generateCanonicalVoucher } from '@/lib/accounting/ledgerMapper';
import { formatMisaAmisPayload } from '@/lib/accounting/adapters/misaAdapter';
import { formatFastAccountingPayload } from '@/lib/accounting/adapters/fastAdapter';
import { CanonicalLedgerVoucher, LedgerSyncRequest, LedgerSyncResult } from '@/lib/accounting/types';

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
    const db = getDatabase();

    const { searchParams } = new URL(request.url);
    const regime = (searchParams.get('regime') === 'CIRCULAR_133' ? 'CIRCULAR_133' : 'CIRCULAR_99_200') as 'CIRCULAR_99_200' | 'CIRCULAR_133';

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
      LIMIT 100
    `).all() as Array<Record<string, unknown>>;

    const vouchers: CanonicalLedgerVoucher[] = [];
    let voucherCounter = 1;

    for (const row of rows) {
      const invoice = parseJson<InvoiceInput | null>(row.payload_json, null);
      if (!invoice) continue;

      const decision = parseJson<RefereeDecision | null>(row.decision_json, null);
      const voucher = generateCanonicalVoucher(invoice, decision, voucherCounter++, regime);
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
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Lỗi lấy sổ kế toán' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    const body = (await request.json()) as LedgerSyncRequest;
    const { targetSystem = 'MISA_AMIS', voucherIds, regime = 'CIRCULAR_99_200' } = body;

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
    `).all() as Array<Record<string, unknown>>;

    let vouchers: CanonicalLedgerVoucher[] = [];
    let counter = 1;

    for (const row of rows) {
      const invoice = parseJson<InvoiceInput | null>(row.payload_json, null);
      if (!invoice) continue;
      const decision = parseJson<RefereeDecision | null>(row.decision_json, null);
      const voucher = generateCanonicalVoucher(invoice, decision, counter++, regime);

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
        status: 'POSTED_TO_GL',
        targetSystem,
        postedAt: new Date().toISOString()
      })),
      exportedData
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Lỗi đồng bộ sổ sách' },
      { status: 500 }
    );
  }
}
