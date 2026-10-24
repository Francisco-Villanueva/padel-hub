import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { REFRESH_COOKIE } from '@/server/auth/config';
import { requestMeta, sameOrigin, setAuthCookies } from '@/server/auth/http';
import { getAuth } from '@/server/auth/instance';

const noStore = { 'Cache-Control': 'no-store' };

// Cambia el club activo: rota el refresh y reemite el access token con otro `cid`.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const body = z.object({ clubId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!body.success || !raw) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: noStore });

  const result = await (await getAuth()).refresh(raw, requestMeta(req), { clubId: body.data.clubId });
  if (result.status !== 'ok') return NextResponse.json({ error: result.status }, { status: 401, headers: noStore });
  const res = NextResponse.json({ status: 'ok' }, { headers: noStore });
  setAuthCookies(res, result.tokens);
  return res;
}
