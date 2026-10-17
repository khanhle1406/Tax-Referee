import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { addStaff } from '@/services/channels/channelService';
import { listStaff, seedStaffDirectory } from '@/services/staffDirectory';
import { channelFail, noStore } from '../channels/_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const StaffSchema = z.object({
  fullName: z.string().trim().min(2).max(120), department: z.string().trim().max(80).nullish(), title: z.string().trim().max(80).nullish(),
  email: z.string().trim().email().max(200).nullish().or(z.literal('')), zaloUserId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/).nullish().or(z.literal('')),
}).strict();

async function handleGET(request: NextRequest) {
  try {
    const user = requireRequestUser(request); seedStaffDirectory();
    const full = user.role !== 'ACCOUNTANT';
    return NextResponse.json({ staff: listStaff().map(s => ({ id: s.id, fullName: s.fullName, department: s.department, title: s.title, email: full ? s.email : null, zaloUserId: full ? s.zaloUserId : null })) }, { headers: noStore });
  } catch (error) { return channelFail(error, 'Không tải được danh bạ người gửi.'); }
}
async function handlePOST(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    return NextResponse.json({ staff: addStaff(user, StaffSchema.parse(await request.json())) }, { headers: noStore });
  } catch (error) { return channelFail(error, 'Không thêm được người vào danh bạ.'); }
}
export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }
export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
