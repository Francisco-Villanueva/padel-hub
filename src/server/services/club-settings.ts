// Ajustes del club (los edita solo el dueño; se valida en las acciones). Todo va dentro de withTenant().
import { and, eq } from 'drizzle-orm';
import type { BrandInput } from '../../lib/club-schema';
import { auditLog, clubs, signupLinks } from '../db/schema';
import type { Tx } from '../db/tenant';
import { newSignupToken } from './clubs';

export async function updateBrand(tx: Tx, ctx: { clubId: string; userId: string }, input: BrandInput) {
  await tx.update(clubs).set({
    name: input.name, locale: input.locale, timezone: input.timezone,
    colorPrimary: input.colorPrimary?.toLowerCase() ?? null, colorAccent: input.colorAccent?.toLowerCase() ?? null,
    contactEmail: input.contactEmail ?? null,
  }).where(eq(clubs.id, ctx.clubId));
  await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'club.update' });
}

export function getBrand(tx: Tx) {
  return tx.select({
    id: clubs.id, name: clubs.name, locale: clubs.locale, timezone: clubs.timezone, country: clubs.country,
    colorPrimary: clubs.colorPrimary, colorAccent: clubs.colorAccent, contactEmail: clubs.contactEmail,
  }).from(clubs).limit(1);
}

export type LinkKind = 'link' | 'tablet';

export function listLinks(tx: Tx) {
  return tx.select({ kind: signupLinks.kind, token: signupLinks.token, active: signupLinks.active }).from(signupLinks).orderBy(signupLinks.kind);
}

/** Cada club tiene un link de cada tipo; si falta, se crea. */
export async function ensureLink(tx: Tx, clubId: string, kind: LinkKind) {
  const [l] = await tx.select({ id: signupLinks.id }).from(signupLinks).where(and(eq(signupLinks.clubId, clubId), eq(signupLinks.kind, kind)));
  if (!l) await tx.insert(signupLinks).values({ clubId, kind, token: newSignupToken() });
}

export async function setLinkActive(tx: Tx, ctx: { clubId: string; userId: string }, kind: LinkKind, active: boolean) {
  await ensureLink(tx, ctx.clubId, kind);
  await tx.update(signupLinks).set({ active }).where(and(eq(signupLinks.clubId, ctx.clubId), eq(signupLinks.kind, kind)));
  await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: active ? 'link.enable' : 'link.disable', detail: { kind } });
}

/** Cambia el token: el link y el QR viejos dejan de funcionar al instante. */
export async function rotateLink(tx: Tx, ctx: { clubId: string; userId: string }, kind: LinkKind) {
  await ensureLink(tx, ctx.clubId, kind);
  const token = newSignupToken();
  await tx.update(signupLinks).set({ token }).where(and(eq(signupLinks.clubId, ctx.clubId), eq(signupLinks.kind, kind)));
  await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'link.rotate', detail: { kind } });
  return token;
}
