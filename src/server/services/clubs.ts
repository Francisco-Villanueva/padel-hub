// Alta manual de clubes (MVP): la hace el superadmin desde el panel de Duxio.
import { randomBytes } from 'node:crypto';
import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { auditLog, clubMembers, clubs, refreshTokens, signupLinks, users } from '../db/schema';
import type { Tx } from '../db/tenant';

export interface CreateClubInput {
  slug: string;
  name: string;
  country?: string;
  timezone?: string;
  locale?: 'es' | 'en' | 'pt';
  contactEmail?: string;
  trialEndsAt?: Date;
  owner: { email: string; name: string; passwordHash: string };
}

/** Token del link de alta: 128 bits, sin caracteres que rompan la URL. */
export const newSignupToken = () => randomBytes(16).toString('base64url');

// Va dentro de withPlatform(). Crea club + dueño + links de alta (celular y tablet) en una sola transacción.
export async function createClub(tx: Tx, input: CreateClubInput) {
  const [club] = await tx.insert(clubs).values({
    slug: input.slug, name: input.name, country: input.country, timezone: input.timezone,
    locale: input.locale, contactEmail: input.contactEmail, trialEndsAt: input.trialEndsAt,
  }).returning();

  await tx.insert(signupLinks).values([
    { clubId: club.id, token: newSignupToken(), kind: 'link' },
    { clubId: club.id, token: newSignupToken(), kind: 'tablet' },
  ]);

  const [owner] = await tx.insert(users).values({
    email: input.owner.email, name: input.owner.name, passwordHash: input.owner.passwordHash,
  }).returning({ id: users.id });
  await tx.insert(clubMembers).values({ clubId: club.id, userId: owner.id, role: 'owner' });

  return { club, ownerId: owner.id };
}

/**
 * Suspende los clubes cuya prueba gratuita venció sin que nadie los marque como pagos (reactivar borra `trial_ends_at`).
 * Igual que una suspensión manual: cierra el link de alta y las sesiones, y no borra datos. Idempotente; va dentro de withPlatform().
 */
export async function suspendExpiredTrials(tx: Tx, now: Date = new Date()): Promise<string[]> {
  const expired = await tx.update(clubs).set({ status: 'suspended' })
    .where(and(eq(clubs.status, 'active'), isNotNull(clubs.trialEndsAt), lte(clubs.trialEndsAt, now)))
    .returning({ id: clubs.id });
  for (const { id } of expired) {
    await tx.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.clubId, id), isNull(refreshTokens.revokedAt)));
    await tx.insert(auditLog).values({ clubId: id, action: 'club.trial_expired' });
  }
  return expired.map((c) => c.id);
}
