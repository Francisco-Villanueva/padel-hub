import { NextResponse, type NextRequest } from 'next/server';
import { COUNTRY_TIMEZONE, registerClubSchema } from '@/lib/club-schema';
import { homeFor, requestMeta, sameOrigin, setAuthCookies } from '@/server/auth/http';
import { getAuth } from '@/server/auth/instance';
import { hashPassword } from '@/server/auth/password';

const noStore = { 'Cache-Control': 'no-store' };

// Alta pública de un club: crea club + dueño y deja la sesión iniciada.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const parsed = registerClubSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] }, { status: 400, headers: noStore });
  }
  const d = parsed.data;
  const result = await (await getAuth()).registerClub({
    name: d.name, slug: d.slug, country: d.country, timezone: COUNTRY_TIMEZONE[d.country], locale: d.locale,
    owner: { email: d.ownerEmail, name: d.ownerName, passwordHash: await hashPassword(d.ownerPassword) },
  }, requestMeta(req));

  switch (result.status) {
    case 'ok': {
      const res = NextResponse.json({ status: 'ok', redirect: homeFor(d.locale, result.tokens) }, { headers: noStore });
      setAuthCookies(res, result.tokens);
      return res;
    }
    case 'rate_limited':
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...noStore, 'Retry-After': '3600' } });
    default:
      return NextResponse.json({ error: result.status }, { status: 409, headers: noStore });
  }
}
