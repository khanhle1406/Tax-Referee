import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { assignSender } from '@/services/channels/channelService';
import { channelFail, noStore } from '../../../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const AssignSchema = z.object({ staffId: z.string().trim().min(1).max(80) }).strict();

async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRequestUser(request); const { id } = await context.params;
    const { staffId } = AssignSchema.parse(await request.json());
    return NextResponse.json({ message: await assignSender(user, id, staffId) }, { headers: noStore });
  } catch (error) { return channelFail(error, 'Không xác nhận được người gửi.'); }
}
export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
