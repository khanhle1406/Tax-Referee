import { NextRequest, NextResponse } from 'next/server';
import { withRequestDatabase } from '@/lib/server/db';
import { getRequestUser } from '@/lib/server/auth';
import { getDashboard } from '@/services/dashboardService';
import { WorkflowError } from '@/services/workflowService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'no-store' };

/** Tổng quan chỉ đọc cho Kế toán trưởng / CFO. Không chạy lại đánh giá, không ghi DB. */
async function handleGET(request: NextRequest) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Vui lòng đăng nhập để xem Tổng quan.' }, { status: 401, headers: noStore });
  if (user.role === 'ACCOUNTANT') return NextResponse.json({ error: 'Tổng quan dành cho Kế toán trưởng và CFO.' }, { status: 403, headers: noStore });
  try {
    const dashboard = getDashboard(user, { period: request.nextUrl.searchParams.get('period') });
    return NextResponse.json({ dashboard }, { headers: noStore });
  } catch (error) {
    if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    return NextResponse.json({ error: 'Không thể tải Tổng quan.' }, { status: 500, headers: noStore });
  }
}

export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }
