// Logo del club. Todo va dentro de withTenant() salvo getPublicLogo(), que sirve la imagen pública y va con withPlatform().
import { and, eq } from 'drizzle-orm';
import { auditLog, clubLogos, clubs } from '../db/schema';
import type { Tx } from '../db/tenant';

/** URL pública y versionada: al cambiar el logo cambia el `v`, así ningún caché sirve el anterior. */
export const logoUrlFor = (slug: string, version: number) => `/api/logo/${slug}?v=${version}`;

export async function saveLogo(tx: Tx, ctx: { clubId: string; userId: string; slug: string }, data: Buffer): Promise<string> {
  await tx.insert(clubLogos).values({ clubId: ctx.clubId, contentType: 'image/webp', data })
    .onConflictDoUpdate({ target: clubLogos.clubId, set: { data, contentType: 'image/webp', updatedAt: new Date() } });
  const url = logoUrlFor(ctx.slug, Date.now());
  await tx.update(clubs).set({ logoUrl: url }).where(eq(clubs.id, ctx.clubId));
  await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'club.logo.update', detail: { bytes: data.length } });
  return url;
}

export async function removeLogo(tx: Tx, ctx: { clubId: string; userId: string }): Promise<void> {
  await tx.delete(clubLogos).where(eq(clubLogos.clubId, ctx.clubId));
  await tx.update(clubs).set({ logoUrl: null }).where(eq(clubs.id, ctx.clubId));
  await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'club.logo.remove' });
}

/** Imagen pública de un club activo (null si no hay logo, el slug no existe o el club está suspendido). Va con withPlatform(). */
export async function getPublicLogo(tx: Tx, slug: string): Promise<{ data: Buffer; contentType: string; updatedAt: Date } | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const [row] = await tx.select({ data: clubLogos.data, contentType: clubLogos.contentType, updatedAt: clubLogos.updatedAt })
    .from(clubLogos).innerJoin(clubs, eq(clubs.id, clubLogos.clubId))
    .where(and(eq(clubs.slug, slug), eq(clubs.status, 'active')));
  // PGlite devuelve Uint8Array y el driver de Neon, Buffer: se normaliza.
  return row ? { data: Buffer.from(row.data), contentType: row.contentType, updatedAt: row.updatedAt } : null;
}
