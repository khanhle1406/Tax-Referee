import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { pullChannel } from '@/services/channels/channelService';
import { channelFail, noStore } from '../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const PullSchema = z.object({ channel: z.enum(['GMAIL', 'ZALO']) }).strict();

async function handlePOST(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    const { channel } = PullSchema.parse(await request.json());
    const result = await pullChannel(user, channel);
    return NextResponse.json({ ...result, outcomes: result.outcomes.map(o => ({ invoiceId: o.invoiceId, workflowStatus: o.workflowStatus, fileName: o.fileName })) }, { headers: noStore });
  } catch (error) { return channelFail(error, 'Không lấy được hóa đơn từ kênh.'); }
}
export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
