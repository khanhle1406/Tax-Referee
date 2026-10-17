import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { channelStatus } from '@/services/channels/channelService';
import { channelFail, noStore } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Chỉ trả về đã cấu hình / chưa cấu hình — không bao giờ trả giá trị bí mật. */
async function handleGET(request: NextRequest) {
  try {
    requireRequestUser(request);
    return NextResponse.json({ channels: channelStatus() }, { headers: noStore });
  } catch (error) { return channelFail(error, 'Không tải được trạng thái kênh.'); }
}
export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }
