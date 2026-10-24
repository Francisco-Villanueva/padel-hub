import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuth } from '@/server/auth/instance';
import { homeFor, requestMeta, sameOrigin, setAuthCookies } from '@/server/auth/http';
import { LOCALES } from '@/server/db/schema';

const Body = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  clubId: z.string().uuid().optional(),
  locale: z.enum(LOCALES).default('es'),
});

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: noStore });
  const { locale, ...input } = parsed.data;

  const result = await (await getAuth()).login(input, requestMeta(req));
  switch (result.status) {
    case 'ok': {
      const res = NextResponse.json({ status: 'ok', redirect: homeFor(locale, result.tokens) }, { headers: noStore });
      setAuthCookies(res, result.tokens);
      return res;
    }
    case 'choose_club':
      return NextResponse.json({ status: 'choose_club', clubs: result.clubs }, { headers: noStore });
    case 'rate_limited':
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...noStore, 'Retry-After': '900' } });
    case 'locked':
      return NextResponse.json({ error: 'locked' }, { status: 423, headers: noStore });
    case 'no_access':
      return NextResponse.json({ error: 'no_access' }, { status: 403, headers: noStore });
    default:
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401, headers: noStore });
  }
}
