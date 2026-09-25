import { NextResponse } from 'next/server';
import { listAuditEvents } from '@/lib/server/audit';
import { getActivePolicy, getMacroState } from '@/lib/server/db';
import { getRequestUser } from '@/lib/server/auth';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!getRequestUser(req)) return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
  return NextResponse.json({ policy: getActivePolicy(), macroState: getMacroState(), audit: listAuditEvents(100) });
}
