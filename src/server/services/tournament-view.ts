// Lectura para la UI del torneo: arma en una sola pasada todo lo que necesita la página de detalle.
import { asc, eq, inArray, isNull } from 'drizzle-orm';
import type { CategoryRuleKind, Modality } from '../../lib/tournament/constants';
import { players, rankingEvents } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';
import { listBracketMatches } from './tournament-matches';
import { listEntries } from './tournament-entries';
import { getTournament, zoneStates } from './tournaments';

type Ctx = { clubId: string };

/** Un jugador puede jugar el torneo en general (la validez de la pareja completa la decide registerPair). */
export function playerMayPlay(t: { categoryRuleKind: string; categoryRuleValue: number; modality: string }, p: { category: number | null; gender: 'male' | 'female' }) {
  if (p.category == null) return false;
  if ((t.categoryRuleKind as CategoryRuleKind) === 'single' && p.category !== t.categoryRuleValue) return false;
  const m = t.modality as Modality;
  return !((m === 'masculino' && p.gender !== 'male') || (m === 'femenino' && p.gender !== 'female'));
}

/** Jugadores del club que pueden inscribirse: activos, aptos para la regla y que no estén ya en una pareja activa. */
export async function listEligiblePlayers(tx: Tx, ctx: Ctx, tournamentId: string) {
  const t = await getTournament(tx, ctx, tournamentId);
  if (!t) return [];
  const taken = new Set((await listEntries(tx, ctx, tournamentId)).flatMap((e) => [e.player1Id, e.player2Id]));
  const all = await tx.select({ id: players.id, firstName: players.firstName, lastName: players.lastName, category: players.category, gender: players.gender })
    .from(players).where(isNull(players.deletedAt)).orderBy(asc(players.lastName), asc(players.firstName), asc(players.id)).limit(2000);
  return all.filter((p) => !taken.has(p.id) && playerMayPlay(t, p));
}

export async function tournamentView(tx: Tx, ctx: Ctx, id: string) {
  const tournament = await getTournament(tx, ctx, id);
  if (!tournament) return null;
  const entries = await listEntries(tx, ctx, id);
  const zones = tournament.status === 'inscripcion' || tournament.status === 'borrador' ? [] : await zoneStates(tx, ctx, id);
  const bracket = ['llave', 'cerrado'].includes(tournament.status) || (tournament.status === 'cancelado' && entries.length > 0)
    ? await listBracketMatches(tx, ctx, id) : [];
  const eligible = tournament.status === 'inscripcion' ? await listEligiblePlayers(tx, ctx, id) : [];
  return { tournament, entries, zones, bracket, eligible, activeCount: entries.length };
}

/** Puntos otorgados al cerrar, con el nombre del jugador. */
export async function tournamentPoints(tx: Tx, ctx: Ctx, id: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const rows = await tx.select({ playerId: rankingEvents.playerId, entryId: rankingEvents.entryId, roundReached: rankingEvents.roundReached, points: rankingEvents.points })
    .from(rankingEvents).where(eq(rankingEvents.tournamentId, id));
  const ids = rows.map((r) => r.playerId);
  const names = ids.length ? await tx.select({ id: players.id, firstName: players.firstName, lastName: players.lastName }).from(players).where(inArray(players.id, ids)) : [];
  const byId = new Map(names.map((n) => [n.id, n]));
  return rows.map((r) => ({ ...r, firstName: byId.get(r.playerId)?.firstName ?? '', lastName: byId.get(r.playerId)?.lastName ?? '' }))
    .sort((a, b) => b.points - a.points || a.lastName.localeCompare(b.lastName));
}
