import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { appendAuditEvent } from '@/lib/server/audit';
import { getDatabase, jsonNow } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRequestUser(request);
    if (user.role !== 'ACCOUNTANT') {
      return NextResponse.json({ error: 'Chỉ Kế toán viên được xác nhận hồ sơ Routine' }, { status: 403 });
    }
    const { id } = await context.params;
    const db = getDatabase();
    const row = db.prepare(`
      SELECT i.id, i.payload_json, e.decision_json
      FROM invoices i
      LEFT JOIN evaluations e ON e.id = (
        SELECT e2.id FROM evaluations e2 WHERE e2.invoice_id = i.id
        ORDER BY datetime(e2.created_at) DESC LIMIT 1
      )
      WHERE i.id = ?
    `).get(id) as { id: string; payload_json: string; decision_json?: string } | undefined;
    if (!row) return NextResponse.json({ error: 'Không tìm thấy hồ sơ' }, { status: 404 });
    const decision = row.decision_json ? JSON.parse(row.decision_json) : null;
    if (!decision || decision.status !== 'ROUTINE') {
      return NextResponse.json({ error: 'Chỉ có thể xác nhận đề xuất Routine' }, { status: 400 });
    }

    const timestamp = jsonNow();
    db.prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?')
      .run('APPROVED', timestamp, id);
    const event = appendAuditEvent({
      eventType: 'ROUTINE_CONFIRMED',
      entityId: id,
      actorId: user.id,
      payload: { invoice: JSON.parse(row.payload_json), decision, role: user.role }
    });
    return NextResponse.json({ ok: true, status: 'APPROVED', auditId: event.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
      return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể xác nhận hồ sơ' }, { status: 400 });
  }
}
