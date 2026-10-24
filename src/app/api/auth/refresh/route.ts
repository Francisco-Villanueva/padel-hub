import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/server/auth/config';
import { clearAuthCookies, requestMeta, safeNext, sameOrigin, setAuthCookies } from '@/server/auth/http';
import { getAuth } from '@/server/auth/instance';
import { LOCALES } from '@/server/db/schema';

const noStore = { 'Cache-Control': 'no-store' };

// GET: lo usa el proxy cuando el access token venció. Rota el refresh y vuelve a la página pedida.
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get('next'), '/');
  const locale = LOCALES.find((l) => next.startsWith(`/${l}/`) || next === `/${l}`) ?? 'es';
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  const toLogin = () => {
    const res = NextResponse.redirect(new URL(`/${locale}/login?next=${encodeURIComponent(next)}`, req.url));
    clearAuthCookies(res);
    return res;
  };
  if (!raw) return toLogin();

  const result = await (await getAuth()).refresh(raw, requestMeta(req));
  if (result.status === 'ok') {
    const res = NextResponse.redirect(new URL(next, req.url));
    setAuthCookies(res, result.tokens);
    return res;
  }
  // Otra pestaña acaba de rotar el token: sus cookies ya llegaron o están por llegar; se reintenta la página.
  if (result.status === 'concurrent') return NextResponse.redirect(new URL(next, req.url));
  return toLogin();
}

// POST: refresh desde fetch() del cliente.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  const result = raw ? await (await getAuth()).refresh(raw, requestMeta(req)) : ({ status: 'invalid' } as const);
  if (result.status === 'ok') {
    const res = NextResponse.json({ status: 'ok', exp: result.tokens.accessExp }, { headers: noStore });
    setAuthCookies(res, result.tokens);
    return res;
  }
  const res = NextResponse.json({ error: result.status }, { status: result.status === 'concurrent' ? 409 : 401, headers: noStore });
  if (result.status !== 'concurrent') clearAuthCookies(res);
  return res;
}
