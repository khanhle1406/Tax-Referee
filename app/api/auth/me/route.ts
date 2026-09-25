import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getUserFromToken(req.cookies.get('tax_referee_session')?.value);
  return user ? NextResponse.json({ user }) : NextResponse.json({ user: null }, { status: 401 });
}
