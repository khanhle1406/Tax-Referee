import { NextRequest, NextResponse } from 'next/server';
import { listLegalUpdates, updateLegalCandidateStatus } from '@/services/legalUpdateService';
import { getRequestUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!getRequestUser(_req)) return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
  const { id } = await context.params;
  const candidate = listLegalUpdates().find((item) => item.id === id);
  return candidate ? NextResponse.json(candidate) : NextResponse.json({ error: 'Không tìm thấy cập nhật pháp lý' }, { status: 404 });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getRequestUser(req);
    if (!user) return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    if (!['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)) return NextResponse.json({ error: 'Không đủ quyền cập nhật pháp lý' }, { status: 403 });
    const { id } = await context.params;
    const body = await req.json();
    const allowed = ['NEEDS_REVIEW', 'DRAFT_CREATED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ROLLED_BACK'] as const;
    if (!allowed.includes(body.status)) return NextResponse.json({ error: 'Trạng thái cập nhật không hợp lệ' }, { status: 400 });
    return NextResponse.json(updateLegalCandidateStatus(id, body.status, user.id, body.reason || ''));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể cập nhật trạng thái' }, { status: 400 });
  }
}
