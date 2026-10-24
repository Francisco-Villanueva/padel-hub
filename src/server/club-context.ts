import 'server-only';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { requireClubSession } from './auth/session';
import { withTenant } from './db/client';
import { clubs } from './db/schema';

/** Sesión + datos del club activo. Una consulta por request, aunque lo pidan varios componentes. */
export const getClubContext = cache(async (locale: string) => {
  const session = await requireClubSession(locale);
  const [club] = await withTenant(session.clubId, (tx) =>
    tx.select({ id: clubs.id, slug: clubs.slug, name: clubs.name, country: clubs.country, locale: clubs.locale }).from(clubs).where(eq(clubs.id, session.clubId)));
  // Club borrado o inaccesible con una sesión todavía vigente: se vuelve a autenticar en vez de romper con undefined.
  if (!club) redirect(`/${locale}/login`);
  return { session, club };
});
