// Ranking del club: no hay tabla de rankings, se calcula sumando el libro de puntos (ranking_events).
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { CategoryRuleKind, Modality } from '../../lib/tournament/constants';
import { windowStart, type RankingWindow } from '../../lib/tournament/ranking-window';
import { players, rankingEvents } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';

export interface RankingGroup { ruleKind: CategoryRuleKind; ruleValue: number; modality: Modality }

const groupWhere = (clubId: string, g: RankingGroup, window: RankingWindow, now: Date) => {
  const start = windowStart(now, window);
  return and(
    eq(rankingEvents.clubId, clubId),
    eq(rankingEvents.categoryRuleKind, g.ruleKind),
    eq(rankingEvents.categoryRuleValue, g.ruleValue),
    eq(rankingEvents.modality, g.modality),
    start ? gte(rankingEvents.tournamentEndedOn, start) : undefined,
  );
};

/** Puntos por jugador de un grupo (regla + modalidad) dentro de la ventana, de mayor a menor. */
export async function getRanking(tx: Tx, ctx: { clubId: string }, g: RankingGroup, window: RankingWindow = 'all', now: Date = new Date()) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const total = sql<number>`sum(${rankingEvents.points})::int`;
  const rows = await tx.select({
    playerId: rankingEvents.playerId, firstName: players.firstName, lastName: players.lastName, category: players.category,
    points: total, tournaments: sql<number>`count(*)::int`,
  }).from(rankingEvents)
    .innerJoin(players, and(eq(players.id, rankingEvents.playerId), isNull(players.deletedAt)))
    .where(groupWhere(ctx.clubId, g, window, now))
    .groupBy(rankingEvents.playerId, players.firstName, players.lastName, players.category)
    .orderBy(desc(total), players.lastName, players.firstName, rankingEvents.playerId);
  let position = 0, prev: number | null = null;
  // Empate en puntos = misma posición (1, 2, 2, 4…).
  return rows.map((r, i) => { if (r.points !== prev) { position = i + 1; prev = r.points; } return { ...r, position }; });
}

/** Grupos que ya tienen al menos un evento: alimentan el selector del ranking. */
export async function listRankingBuckets(tx: Tx, ctx: { clubId: string }): Promise<RankingGroup[]> {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const rows = await tx.selectDistinct({ ruleKind: rankingEvents.categoryRuleKind, ruleValue: rankingEvents.categoryRuleValue, modality: rankingEvents.modality })
    .from(rankingEvents).where(eq(rankingEvents.clubId, ctx.clubId))
    .orderBy(rankingEvents.categoryRuleKind, rankingEvents.categoryRuleValue, rankingEvents.modality);
  return rows as RankingGroup[];
}

/** Puntos de cada jugador en un grupo: sirven para sembrar (cabezas de serie por ranking). */
export async function playerPointsInGroup(tx: Tx, clubId: string, g: RankingGroup, window: RankingWindow, playerIds: string[], now: Date = new Date()) {
  if (playerIds.length === 0) return new Map<string, number>();
  const rows = await tx.select({ playerId: rankingEvents.playerId, points: sql<number>`sum(${rankingEvents.points})::int` })
    .from(rankingEvents).where(and(groupWhere(clubId, g, window, now), inArray(rankingEvents.playerId, playerIds)))
    .groupBy(rankingEvents.playerId);
  return new Map(rows.map((r) => [r.playerId, r.points]));
}
