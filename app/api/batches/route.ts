import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { requestErrorResponse } from '@/lib/server/http';
import { WorkflowError } from '@/services/workflowService';
import { createBatch, listBatches } from '@/services/batchService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(error: unknown, fallback: string): NextResponse {
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
  return requestErrorResponse(error, fallback);
}
const noStore = { 'Cache-Control': 'no-store' };
const CreateSchema = z.object({ label: z.string().max(120).optional(), source: z.enum(['UPLOAD', 'MANUAL']).optional() }).strict();

async function handleGET(request: NextRequest) {
  try { requireRequestUser(request); return NextResponse.json({ batches: listBatches(50) }, { headers: noStore }); }
  catch (error) { return fail(error, 'Không tải được danh sách lô.'); }
}
async function handlePOST(request: NextRequest) {
  try {
    const user = requireRequestUser(request);
    const input = CreateSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ batch: createBatch(user, input) }, { headers: noStore });
  } catch (error) { return fail(error, 'Không tạo được lô.'); }
}
export async function GET(...args: Parameters<typeof handleGET>) { return withRequestDatabase(args[0], () => handleGET(...args)); }
export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
