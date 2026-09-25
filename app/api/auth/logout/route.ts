import { NextRequest, NextResponse } from 'next/server';
import { logout } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('tax_referee_session')?.value;
  logout(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set('tax_referee_session', '', { httpOnly: true, maxAge: 0, path: '/' });
  return response;
}
