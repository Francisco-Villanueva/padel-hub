// Alta manual de clubes (MVP): la hace el superadmin desde el panel de Duxio.
import { randomBytes } from 'node:crypto';
import { clubMembers, clubs, signupLinks, users } from '../db/schema';
import type { Tx } from '../db/tenant';

export interface CreateClubInput {
  slug: string;
  name: string;
  country?: string;
  timezone?: string;
  locale?: 'es' | 'en' | 'pt';
  contactEmail?: string;
  owner: { email: string; name: string; passwordHash: string };
}

/** Token del link de alta: 128 bits, sin caracteres que rompan la URL. */
export const newSignupToken = () => randomBytes(16).toString('base64url');

// Va dentro de withPlatform(). Crea club + dueño + links de alta (celular y tablet) en una sola transacción.
export async function createClub(tx: Tx, input: CreateClubInput) {
  const [club] = await tx.insert(clubs).values({
    slug: input.slug, name: input.name, country: input.country, timezone: input.timezone,
    locale: input.locale, contactEmail: input.contactEmail,
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
