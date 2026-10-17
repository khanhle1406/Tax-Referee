import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRequestUser } from '@/lib/server/auth';
import { withRequestDatabase } from '@/lib/server/db';
import { requestErrorResponse } from '@/lib/server/http';
import { WorkflowError } from '@/services/workflowService';
import { answerGroup } from '@/services/batchService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function fail(error: unknown, fallback: string): NextResponse {
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
  return requestErrorResponse(error, fallback);
}
const noStore = { 'Cache-Control': 'no-store' };
const AnswerSchema = z.object({
  invoiceIds: z.array(z.string().max(200)).min(2).max(50),
  answers: z.record(z.string().regex(/^\d{1,2}$/), z.enum(['A', 'B'])),
  reason: z.string().min(8).max(500),
  // Phiên bản hồ sơ người duyệt đã nhìn thấy trên thẻ nhóm: hồ sơ vừa bị sửa thì không áp đáp án lên bản mới.
  members: z.array(z.object({ invoiceId: z.string().max(200), revision: z.number().int().min(0), evaluationId: z.string().max(200).nullable() }).strict()).min(2).max(50).optional(),
}).strict();
async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireRequestUser(request); const { id } = await context.params;
    return NextResponse.json({ results: await answerGroup(id, user, AnswerSchema.parse(await request.json())) }, { headers: noStore });
  } catch (error) { return fail(error, 'Không trả lời được nhóm hóa đơn.'); }
}
export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }
