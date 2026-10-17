import { NextRequest, NextResponse } from 'next/server';
import { withRequestDatabase } from '@/lib/server/db';
import { getRequestUser } from '@/lib/server/auth';
import { getMyHistory } from '@/services/historyService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'no-store' };

/** Lịch sử của chính người đang đăng nhập (mọi vai trò). Chỉ đọc. */
async function handleGET(request: NextRequest) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Vui lòng đăng nhập để xem lịch sử.' }, { status: 401, headers: noStore });
  try {
    const history = getMyHistory(user, { limit: Number(request.nextUrl.searchParams.get('limit')) || undefined });
    return NextResponse.json({ history }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Không thể tải lịch sử.' }, { status: 500, headers: noStore });
  }
}

export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }
