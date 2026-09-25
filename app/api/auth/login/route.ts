import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = login(String(body.email || ''), String(body.password || ''));
  if (!result) return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
  const response = NextResponse.json({ user: result.user });
  response.cookies.set('tax_referee_session', result.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60, path: '/' });
  return response;
}
