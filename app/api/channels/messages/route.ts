import { NextRequest, NextResponse } from 'next/server';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { listChannelMessages } from '@/services/channels/channelService';
import { channelFail, noStore } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleGET(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    // Kế toán viên thấy tên nhân viên đã nhận diện; địa chỉ email/Zalo id đầy đủ chỉ Kế toán trưởng/CFO thấy (như danh bạ).
    return NextResponse.json({ messages: listChannelMessages(100, user) }, { headers: noStore });
  } catch (error) { return channelFail(error, 'Không tải được danh sách file đã nhận.'); }
}
export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }
