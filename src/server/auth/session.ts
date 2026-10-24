import 'server-only';
import { cookies } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';
import { ACCESS_COOKIE } from './config';
import { jwtKey, verifyAccessToken, type Session } from './jwt';

// Autenticación real de cada página/acción: el proxy solo hace una comprobación optimista.
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  // Verificar el vencimiento lee el reloj: tiene que pasar en el request, no al prerenderizar el shell.
  await connection();
  return verifyAccessToken(token, jwtKey(process.env.JWT_SECRET));
});

export async function requireSession(locale: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/api/auth/refresh?next=${encodeURIComponent(`/${locale}/app`)}`);
  return s;
}

/** Sesión de club (dueño o empleado). Los superadmin sin club activo no pasan. */
export async function requireClubSession(locale: string) {
  const s = await requireSession(locale);
  if (!s.clubId || !s.role) redirect(`/${locale}/${s.isSuperadmin ? 'admin' : 'login'}`);
  return s as typeof s & { clubId: string; role: NonNullable<typeof s.role> };
}

export async function requireOwner(locale: string) {
  const s = await requireClubSession(locale);
  // 403 con pantalla propia (en vez de mandarlo al inicio sin explicación).
  if (s.role !== 'owner') forbidden();
  return s;
}

export async function requireSuperadmin(locale: string) {
  const s = await requireSession(locale);
  if (!s.isSuperadmin) redirect(`/${locale}`);
  return s;
}
