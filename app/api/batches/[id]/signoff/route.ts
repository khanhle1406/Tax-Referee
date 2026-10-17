import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { requestErrorResponse } from '@/lib/server/http';
import { WorkflowError } from '@/services/workflowService';
import { signOffBatch } from '@/services/batchService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(error: unknown, fallback: string): NextResponse {
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
  return requestErrorResponse(error, fallback);
}
const noStore = { 'Cache-Control': 'no-store' };
const SignoffSchema = z.object({ note: z.string().max(500) }).strict();
async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRequestUser(request); const { id } = await context.params;
    return NextResponse.json(signOffBatch(id, user, SignoffSchema.parse(await request.json()).note), { headers: noStore });
  } catch (error) { return fail(error, 'Không chốt được lô.'); }
}
export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
