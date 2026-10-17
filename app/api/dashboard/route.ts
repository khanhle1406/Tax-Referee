import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { readDashboardSummary } from '@/services/dashboardService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({error: 'Vui lòng đăng nhập.'}, {status: 401, headers: {'Cache-Control': 'no-store'}});
  if (user.role !== 'CHIEF_ACCOUNTANT' && user.role !== 'CFO') {
    return NextResponse.json({error: 'Chỉ Kế toán trưởng hoặc CFO được xem tổng quan.'}, {status: 403, headers: {'Cache-Control': 'no-store'}});
  }
  return NextResponse.json(readDashboardSummary(), {headers: {'Cache-Control': 'no-store'}});
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRequestDatabase(request, () => handleGET(request));
}
