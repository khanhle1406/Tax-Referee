import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { requestErrorResponse } from '@/lib/server/http';
import { WorkflowError } from '@/services/workflowService';
import { attachToBatch } from '@/services/batchService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(error: unknown, fallback: string): NextResponse {
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
  return requestErrorResponse(error, fallback);
}
const noStore = { 'Cache-Control': 'no-store' };
const ItemSchema = z.object({
  invoiceId: z.string().max(200).nullish(), fileName: z.string().max(200).nullish(), fileSha256: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
  error: z.string().max(300).nullish(),
}).strict();
async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRequestUser(request); const { id } = await context.params;
    return NextResponse.json(attachToBatch(user, id, ItemSchema.parse(await request.json())), { headers: noStore });
  } catch (error) { return fail(error, 'Không gắn được hóa đơn vào lô.'); }
}
export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
