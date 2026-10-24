import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, ACCESS_TTL_SEC, REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TTL_SEC } from './config';
import type { RequestMeta, Tokens } from './service';

const secure = process.env.NODE_ENV === 'production';

export function setAuthCookies(res: NextResponse, t: Tokens) {
  res.cookies.set(ACCESS_COOKIE, t.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: ACCESS_TTL_SEC });
  res.cookies.set(REFRESH_COOKIE, t.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: REFRESH_COOKIE_PATH, maxAge: REFRESH_TTL_SEC });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: REFRESH_COOKIE_PATH, maxAge: 0 });
}

// CSRF: además de SameSite=Lax, las mutaciones exigen que el Origin sea el propio host.
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export function requestMeta(req: NextRequest): RequestMeta {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? undefined;
  return { ip, userAgent: req.headers.get('user-agent') ?? undefined };
}

// Solo páginas internas: evita open redirect con ?next=https://malo.com o //malo.com, y bucles
// de rotación de refresh con ?next=/api/auth/refresh.
export function safeNext(next: string | null, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.startsWith('/api/')) return fallback;
  return next;
}

export const homeFor = (locale: string, t: Tokens) => `/${locale}/${t.session.clubId ? 'app' : 'admin'}`;
