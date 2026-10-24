import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE } from './server/auth/config';
import { jwtKey, verifyAccessToken } from './server/auth/jwt';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);
const PROTECTED = /^\/(es|en|pt)\/(app|admin)(\/|$)/;
const LANDING = /^\/(es|en|pt)\/?$/;

// Guard OPTIMISTA: solo mira la firma y el vencimiento del access token (sin base de datos).
// La autorización real se repite en cada página y acción con requireSession() / withTenant().
export default async function proxy(req: NextRequest) {
  // La portada (/es, /en, /pt) no tiene contenido propio: manda a cada persona a su panel, o al login si no tiene sesión.
  const landing = LANDING.exec(req.nextUrl.pathname);
  if (landing) {
    const locale = landing[1];
    const session = await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value, jwtKey(process.env.JWT_SECRET));
    if (session) return NextResponse.redirect(new URL(`/${locale}/${session.clubId ? 'app' : session.isSuperadmin ? 'admin' : 'login'}`, req.url));
    // Sin access token válido: si quedó un refresh vigente el endpoint renueva la sesión; si no, va al login.
    return NextResponse.redirect(new URL(`/api/auth/refresh?next=${encodeURIComponent(`/${locale}/app`)}`, req.url));
  }

  const m = PROTECTED.exec(req.nextUrl.pathname);
  if (m) {
    const [, locale, area] = m;
    const session = await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value, jwtKey(process.env.JWT_SECRET));
    if (!session) {
      // Access vencido o ausente: el endpoint rota el refresh (o manda al login) y vuelve acá.
      const next = req.nextUrl.pathname + req.nextUrl.search;
      return NextResponse.redirect(new URL(`/api/auth/refresh?next=${encodeURIComponent(next)}`, req.url));
    }
    if (area === 'admin' && !session.isSuperadmin) return NextResponse.redirect(new URL(`/${locale}/app`, req.url));
    if (area === 'app' && !session.clubId) {
      return NextResponse.redirect(new URL(`/${locale}/${session.isSuperadmin ? 'admin' : 'login'}`, req.url));
    }
  }
  return intl(req);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
