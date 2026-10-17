import { NextResponse } from 'next/server';
import { requestErrorResponse } from '@/lib/server/http';
import { WorkflowError } from '@/services/workflowService';

export const noStore = { 'Cache-Control': 'no-store' };
export function channelFail(error: unknown, fallback: string): NextResponse {
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
  return requestErrorResponse(error, fallback);
}
