import { NextRequest, NextResponse } from 'next/server';
import { listLegalUpdates, syncLegalUpdates } from '@/services/legalUpdateService';
import { getRequestUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!getRequestUser(req)) return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
  const status = req.nextUrl.searchParams.get('status') as Parameters<typeof listLegalUpdates>[0];
  return NextResponse.json({ updates: listLegalUpdates(status || undefined) });
}

export async function POST(req: NextRequest) {
  try {
    const user = getRequestUser(req);
    if (!user) return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    if (!['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)) return NextResponse.json({ error: 'Không đủ quyền đồng bộ pháp lý' }, { status: 403 });
    const result = await syncLegalUpdates();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể đồng bộ nguồn pháp lý' }, { status: 502 });
  }
}
