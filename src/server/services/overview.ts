// Resumen del inicio del club. Va dentro de withTenant().
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { contactLog, playerConsents, players, signupLinks } from '../db/schema';
import type { Tx } from '../db/tenant';

const DAY = 24 * 60 * 60 * 1000;

export async function clubOverview(tx: Tx, now: Date = new Date()) {
  const since30 = new Date(now.getTime() - 30 * DAY).toISOString();
  const since7 = new Date(now.getTime() - 7 * DAY).toISOString();

  const [counts] = await tx.select({
    total: sql<number>`count(*)::int`,
    recent: sql<number>`count(*) filter (where ${players.createdAt} >= ${since30})::int`,
    // `players.id` va literal: con una sola tabla en el FROM, Drizzle omite el prefijo y `id` se resolvería contra la subconsulta.
    noConsent: sql<number>`count(*) filter (where not exists (select 1 from ${playerConsents} c where c.player_id = players.id))::int`,
  }).from(players).where(isNull(players.deletedAt));

  // Jugadores distintos contactados en la semana (si lo contactaron dos veces, cuenta uno).
  const [contacted] = await tx.select({ n: sql<number>`count(distinct ${contactLog.playerId})::int` })
    .from(contactLog).where(sql`${contactLog.createdAt} >= ${since7}`);

  const latest = await tx.select({
    id: players.id, firstName: players.firstName, lastName: players.lastName, locality: players.locality, position: players.position,
    source: players.source, category: players.category, gender: players.gender,
  }).from(players)
    .where(isNull(players.deletedAt)).orderBy(desc(players.createdAt)).limit(5);

  return { total: counts.total, recent: counts.recent, noConsent: counts.noConsent, contacted: contacted.n, latest };
}

/** Links de alta activos del club (celular y tablet). */
export function listSignupLinks(tx: Tx) {
  return tx.select({ kind: signupLinks.kind, token: signupLinks.token }).from(signupLinks).where(eq(signupLinks.active, true)).orderBy(signupLinks.kind);
}
