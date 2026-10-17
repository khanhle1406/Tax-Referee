import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { demoCount, demoExists, isSandbox, withDemoDatabase, withRequestDatabase } from '@/lib/server/db';
import { AppRole, getRequestUser, switchRole } from '@/lib/server/auth';
import { allowRate, clientIp } from '@/lib/server/rateLimit';
import { seedDemoCases } from '@/services/demoSeed';
import { demoBatchPresetEnabled, seedDemoBatches } from '@/services/demo/demoBatchPreset';

const DEMO_ROLES: AppRole[] = ['ACCOUNTANT', 'CHIEF_ACCOUNTANT', 'CFO'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.preserveExisting === true) {
      const existing = await withRequestDatabase(req, async () => {
        const user = getRequestUser(req);
        return user ? { user, demo: isSandbox() } : null;
      });
      // Verify must not replace an internal login or reset an existing demo role.
      if (existing) return NextResponse.json(existing);
    }

    const previous = req.cookies.get('tax_referee_demo')?.value;
    const reuse = Boolean(previous && demoExists(previous));
    // Mỗi phiên demo mới là một tệp SQLite trên đĩa: giới hạn theo IP để không bị tạo vô hạn.
    if (!reuse && process.env.NODE_ENV !== 'test' && !allowRate(`demo:${clientIp(req.headers)}`, Number(process.env.TAX_REFEREE_DEMO_PER_HOUR || 200), 60 * 60 * 1000))
      return NextResponse.json({ error: 'Đã tạo quá nhiều phiên demo từ địa chỉ này. Hãy dùng lại phiên hiện có hoặc thử lại sau.' }, { status: 429 });
    if (!reuse && demoCount() >= Number(process.env.TAX_REFEREE_DEMO_MAX || 2000))
      return NextResponse.json({ error: 'Máy chủ demo đã đủ số phiên. Hãy thử lại sau.' }, { status: 503 });
    const id = reuse && previous ? previous : crypto.randomUUID();
    return await withDemoDatabase(id, async () => {
      // Mặc định vào vai Kế toán viên (người nhập liệu) để ca chuyển tiếp được KTT/CFO — một tài khoản khác — duyệt.
      const role: AppRole = DEMO_ROLES.includes(body.role) ? body.role : 'ACCOUNTANT';
      const session = switchRole(role);
      if (!session) throw new Error('Không thể mở demo.');
      // Phiên mới: nạp sẵn 4 ca mẫu (1 tự xử lý + 3 kiểu dừng) để hộp chuyển tiếp không trống.
      if (!reuse) await seedDemoCases();
      // Máy local của đội (TAX_REFEREE_DEMO_PRESET_BATCHES=1): phiên mới có sẵn lô mẫu để trình bày ngay.
      if (!reuse && demoBatchPresetEnabled()) await seedDemoBatches();
      const res = NextResponse.json({ user: session.user, demo: true });
      const opts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60 };
      res.cookies.set('tax_referee_demo', id, opts);
      res.cookies.set('tax_referee_session', session.token, opts);
      return res;
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Demo không khả dụng.' }, { status: 503 });
  }
}
