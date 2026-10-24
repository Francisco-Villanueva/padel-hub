import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/server/auth/config';
import { clearAuthCookies, sameOrigin } from '@/server/auth/http';
import { getAuth } from '@/server/auth/instance';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await (await getAuth()).logout(req.cookies.get(REFRESH_COOKIE)?.value);
  const res = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  clearAuthCookies(res);
  return res;
}
