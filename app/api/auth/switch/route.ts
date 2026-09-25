import { NextRequest, NextResponse } from 'next/server';
import { appendAuditEvent } from '@/lib/server/audit';
import { AppRole, getRequestUser, switchRole } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const currentUser = getRequestUser(req);
  if (!currentUser) return NextResponse.json({ error: 'Vui lòng đăng nhập trước khi chuyển vai trò' }, { status: 401 });
  if (process.env.NODE_ENV === 'production' && process.env.TAX_REFEREE_ALLOW_ROLE_SWITCH !== 'true') {
    return NextResponse.json({ error: 'Chuyển vai trò bị khóa trong production' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const role = body.role as AppRole;
  if (!['ACCOUNTANT', 'CHIEF_ACCOUNTANT', 'CFO'].includes(role)) {
    return NextResponse.json({ error: 'Vai trò không hợp lệ' }, { status: 400 });
  }

  const result = switchRole(role);
  if (!result) {
    return NextResponse.json({ error: 'Không thể chuyển đổi vai trò' }, { status: 404 });
  }

  appendAuditEvent({
    eventType: 'ROLE_SWITCHED',
    entityId: result.user.id,
    actorId: currentUser.id,
    payload: { fromRole: currentUser.role, toRole: result.user.role }
  });

  const response = NextResponse.json({ user: result.user });
  response.cookies.set('tax_referee_session', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60,
    path: '/'
  });
  return response;
}
