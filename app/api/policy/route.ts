import { NextRequest, NextResponse } from 'next/server';
import { createPolicyDraft, listPolicyVersions, publishPolicy, readActivePolicy, rollbackPolicy, validatePolicyBundle } from '@/services/policyService';
import { getRequestUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!getRequestUser(req)) return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
  return NextResponse.json({ active: readActivePolicy(), versions: listPolicyVersions() });
}

export async function POST(req: NextRequest) {
  try {
    const user = getRequestUser(req);
    if (!user) return NextResponse.json({ error: 'Vui lòng đăng nhập' }, { status: 401 });
    if (!['CHIEF_ACCOUNTANT', 'CFO'].includes(user.role)) {
      return NextResponse.json({ error: 'Chỉ Kế toán trưởng hoặc CFO được quản trị policy' }, { status: 403 });
    }
    const body = await req.json();
    const actorId = user.id;
    if (body.action === 'validate') {
      const draft = listPolicyVersions().find((item) => item.version === body.version);
      if (!draft) return NextResponse.json({ error: 'Không tìm thấy policy draft' }, { status: 404 });
      return NextResponse.json(validatePolicyBundle(draft));
    }
    if (body.action === 'publish') return NextResponse.json({ policy: publishPolicy(body.version, actorId, body.reason) });
    if (body.action === 'rollback') return NextResponse.json({ policy: rollbackPolicy(body.version, actorId, body.reason) });
    return NextResponse.json({ policy: createPolicyDraft(body, actorId) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể cập nhật policy' }, { status: 400 });
  }
}
