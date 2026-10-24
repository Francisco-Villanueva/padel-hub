// Panel del superadmin (Duxio). Todo va dentro de withPlatform() y lo invoca código que ya pasó por requireSuperadmin().
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { NewClubInput } from '../../lib/club-schema';
import { auditLog, clubMembers, clubs, players, refreshTokens, users } from '../db/schema';
import type { Tx } from '../db/tenant';
import { createClub } from './clubs';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type ClubStatusFilter = 'all' | 'active' | 'suspended';

export async function listClubs(tx: Tx, f: { q?: string; status?: ClubStatusFilter }) {
  const conds = [];
  if (f.q) conds.push(or(ilike(clubs.name, `%${escapeLike(f.q)}%`), ilike(clubs.slug, `%${escapeLike(f.q)}%`)));
  if (f.status && f.status !== 'all') conds.push(eq(clubs.status, f.status));
  return tx.select({
    id: clubs.id, slug: clubs.slug, name: clubs.name, country: clubs.country, status: clubs.status, createdAt: clubs.createdAt,
    players: sql<number>`(select count(*)::int from ${players} p where p.club_id = clubs.id and p.deleted_at is null)`,
    users: sql<number>`(select count(*)::int from ${clubMembers} m where m.club_id = clubs.id)`,
  }).from(clubs).where(and(...conds)).orderBy(desc(clubs.createdAt));
}

export async function clubDetail(tx: Tx, id: string, now: Date = new Date()) {
  const [club] = await tx.select().from(clubs).where(eq(clubs.id, id));
  if (!club) return null;
  const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

  const [counts] = await tx.select({
    players: sql<number>`count(*)::int`,
    recent: sql<number>`count(*) filter (where ${players.createdAt} >= ${since30})::int`,
  }).from(players).where(and(eq(players.clubId, id), isNull(players.deletedAt)));
  const [{ members }] = await tx.select({ members: sql<number>`count(*)::int` }).from(clubMembers).where(eq(clubMembers.clubId, id));
  const [{ lastLogin }] = await tx.select({ lastLogin: sql<string | null>`max(${refreshTokens.createdAt})` }).from(refreshTokens).where(eq(refreshTokens.clubId, id));

  const [owner] = await tx.select({ id: users.id, name: users.name, email: users.email }).from(clubMembers)
    .innerJoin(users, eq(users.id, clubMembers.userId)).where(and(eq(clubMembers.clubId, id), eq(clubMembers.role, 'owner'))).limit(1);

  const audit = await tx.select({ id: auditLog.id, action: auditLog.action, at: auditLog.createdAt, userName: users.name })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).where(eq(auditLog.clubId, id)).orderBy(desc(auditLog.createdAt)).limit(10);

  return { club, players: counts.players, recent: counts.recent, members, lastLogin, owner: owner ?? null, audit };
}

/** Suspender no borra nada: los usuarios no pueden entrar y el link de alta se cierra (ambos lo verifican contra `status`). */
export async function setClubStatus(tx: Tx, ctx: { userId: string }, id: string, status: 'active' | 'suspended') {
  const res = await tx.update(clubs).set({ status }).where(eq(clubs.id, id)).returning({ id: clubs.id });
  if (res.length === 0) return false;
  if (status === 'suspended') {
    // Las sesiones abiertas de ese club también se cierran: el access dura hasta 15 min, el refresh ya no se renueva.
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.clubId, id), isNull(refreshTokens.revokedAt)));
  }
  await tx.insert(auditLog).values({ clubId: id, userId: ctx.userId, action: status === 'suspended' ? 'club.suspend' : 'club.reactivate' });
  return true;
}

export type CreateClubError = 'slug_taken' | 'email_taken';

export async function createClubAsAdmin(tx: Tx, ctx: { userId: string }, input: NewClubInput, passwordHash: string): Promise<{ id: string } | { error: CreateClubError }> {
  const [slugTaken] = await tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.slug, input.slug));
  if (slugTaken) return { error: 'slug_taken' };
  const [emailTaken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.ownerEmail));
  if (emailTaken) return { error: 'email_taken' };
  const { club } = await createClub(tx, {
    slug: input.slug, name: input.name, country: input.country, timezone: input.timezone, locale: input.locale,
    owner: { email: input.ownerEmail, name: input.ownerName, passwordHash },
  });
  await tx.insert(auditLog).values({ clubId: club.id, userId: ctx.userId, action: 'club.create' });
  return { id: club.id };
}
