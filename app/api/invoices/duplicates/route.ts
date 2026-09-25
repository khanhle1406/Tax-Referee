import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireRequestUser } from '@/lib/server/auth';
import { appendAuditEvent } from '@/lib/server/audit';
import { getDatabase, jsonNow } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    requireRequestUser(request);
    const groups = getDatabase().prepare(`
      SELECT supplier_tax_code AS supplierTaxCode, invoice_number AS invoiceNumber,
             COUNT(*) AS count, GROUP_CONCAT(id) AS invoiceIds
      FROM invoices
      GROUP BY supplier_tax_code, invoice_number
      HAVING COUNT(*) > 1
      ORDER BY count DESC, supplierTaxCode, invoiceNumber
    `).all();
    return NextResponse.json({ groups });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    return NextResponse.json({ error: 'Không thể tải báo cáo duplicate' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    if (!['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)) return NextResponse.json({ error: 'Chỉ KTT hoặc CFO được xử lý duplicate' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const invoiceId = String(body.invoiceId || '');
    const canonicalInvoiceId = String(body.canonicalInvoiceId || '');
    const status = String(body.status || '');
    if (!invoiceId || !canonicalInvoiceId || invoiceId === canonicalInvoiceId || !['CONFIRMED_DUPLICATE', 'CONFIRMED_VALID'].includes(status)) {
      return NextResponse.json({ error: 'Thiếu cặp hóa đơn hoặc trạng thái review hợp lệ' }, { status: 400 });
    }

    const db = getDatabase();
    const rows = db.prepare('SELECT id FROM invoices WHERE id IN (?, ?)').all(invoiceId, canonicalInvoiceId) as Array<{ id: string }>;
    if (rows.length !== 2) return NextResponse.json({ error: 'Không tìm thấy cặp hóa đơn cần đối chiếu' }, { status: 404 });

    const timestamp = jsonNow();
    const reviewId = crypto.randomUUID();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO invoice_duplicate_reviews (id, invoice_id, canonical_invoice_id, status, reviewed_by, reason, created_at, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(invoice_id) DO UPDATE SET
          canonical_invoice_id = excluded.canonical_invoice_id,
          status = excluded.status,
          reviewed_by = excluded.reviewed_by,
          reason = excluded.reason,
          reviewed_at = excluded.reviewed_at
      `).run(reviewId, invoiceId, canonicalInvoiceId, status, user.id, String(body.reason || ''), timestamp, timestamp);
      if (status === 'CONFIRMED_DUPLICATE') {
        db.prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?').run('ON_HOLD', timestamp, invoiceId);
      }
    })();

    appendAuditEvent({
      eventType: 'DUPLICATE_REVIEWED',
      entityId: invoiceId,
      actorId: user.id,
      payload: { canonicalInvoiceId, status, reason: body.reason || '' }
    });
    return NextResponse.json({ ok: true, invoiceId, canonicalInvoiceId, status });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể xử lý duplicate' }, { status: 400 });
  }
}
