import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { listNotifications } from '@/services/channels/notifier';
import { channelFail, noStore } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleGET(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    return NextResponse.json({ notifications: listNotifications(50, user.role === 'ACCOUNTANT') }, { headers: noStore });
  } catch (error) { return channelFail(error, 'Không tải được danh sách tin đã gửi.'); }
}
export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }
