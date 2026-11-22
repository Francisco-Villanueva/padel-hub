// Lectura para la UI del torneo: arma en una sola pasada todo lo que necesita la página de detalle.
import { asc, eq, inArray, isNull } from 'drizzle-orm';
import type { BoardMatch, SlotLabel } from '../../lib/tournament/board';
import { bracketSource, decodeSlot } from '../../lib/tournament/template';
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

/** Jugadores del club que no están en ninguna pareja activa del torneo (para reemplazos): sin aplicar la regla de categoría. */
export async function listFreePlayers(tx: Tx, ctx: Ctx, tournamentId: string) {
  const taken = new Set((await listEntries(tx, ctx, tournamentId)).flatMap((e) => [e.player1Id, e.player2Id]));
  const all = await tx.select({ id: players.id, firstName: players.firstName, lastName: players.lastName, category: players.category })
    .from(players).where(isNull(players.deletedAt)).orderBy(asc(players.lastName), asc(players.firstName), asc(players.id)).limit(2000);
  return all.filter((p) => !taken.has(p.id));
}

export async function tournamentView(tx: Tx, ctx: Ctx, id: string) {
  const tournament = await getTournament(tx, ctx, id);
  if (!tournament) return null;
  const entries = await listEntries(tx, ctx, id);
  const zones = tournament.status === 'inscripcion' || tournament.status === 'borrador' ? [] : await zoneStates(tx, ctx, id);
  const bracket = ['zonas', 'llave', 'cerrado'].includes(tournament.status) || (tournament.status === 'cancelado' && entries.length > 0)
    ? await listBracketMatches(tx, ctx, id) : [];
  const eligible = tournament.status === 'inscripcion' ? await listEligiblePlayers(tx, ctx, id) : [];
  const free = ['inscripcion', 'zonas', 'llave'].includes(tournament.status) ? await listFreePlayers(tx, ctx, id) : [];
  return { tournament, entries, zones, bracket, eligible, free, activeCount: entries.length };
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

export type TournamentViewData = NonNullable<Awaited<ReturnType<typeof tournamentView>>>;
/** Fila del tablero del club: la misma que ve el público, con el id del partido y si ya están definidas las dos parejas. */
export interface PanelMatch extends BoardMatch { id: string; ready: boolean }

/** Todos los partidos (zonas y llave) en el orden del tablero: por hora, con los sin horario al final. Sin los libres (bye). */
export function panelBoardMatches(view: TournamentViewData): PanelMatch[] {
  const names = new Map(view.entries.map((e) => [e.id, `${e.player1.lastName} / ${e.player2.lastName}`]));
  const maxRound = view.bracket.length ? Math.max(...view.bracket.map((m) => m.round)) : null;
  const zonePos = new Map(view.zones.map((z) => [z.zone.id, z.zone.position]));
  const zoneName = new Map(view.zones.map((z) => [z.zone.id, z.zone.name]));
  const zoneByPos = new Map(view.zones.map((z) => [z.zone.position, z.zone.name]));
  const label = (entryId: string | null, src: string | null): SlotLabel | null => {
    const s = entryId ? null : decodeSlot(src);
    const zone = s ? zoneByPos.get(s.zone + 1) : null;
    return s && zone ? { zone, position: s.position } : null;
  };
  const rows = [...view.zones.flatMap((z) => z.matches), ...view.bracket].filter((m) => m.status !== 'bye');
  const out = rows.map((m) => ({
    id: m.id, ready: Boolean(m.entryAId && m.entryBId), stage: m.stage as 'zona' | 'llave', zoneName: m.zoneId ? zoneName.get(m.zoneId) ?? null : null,
    round: m.round, position: m.position, maxRound: m.stage === 'llave' ? maxRound : null, scheduledAt: m.scheduledAt,
    status: m.status as PanelMatch['status'], nameA: m.entryAId ? names.get(m.entryAId) ?? null : null, nameB: m.entryBId ? names.get(m.entryBId) ?? null : null,
    sets: m.sets, winner: !m.winnerEntryId ? null : m.winnerEntryId === m.entryAId ? 'a' as const : 'b' as const,
    srcA: label(m.entryAId, m.stage === 'llave' ? bracketSource(view.bracket, m, 'a') : null), srcB: label(m.entryBId, m.stage === 'llave' ? bracketSource(view.bracket, m, 'b') : null),
    _zone: m.zoneId ? zonePos.get(m.zoneId) ?? 0 : 0,
  }));
  out.sort((x, y) => (x.scheduledAt?.getTime() ?? Infinity) - (y.scheduledAt?.getTime() ?? Infinity)
    || (x.stage === y.stage ? 0 : x.stage === 'zona' ? -1 : 1) || x._zone - y._zone || x.round - y.round || x.position - y.position);
  return out.map(({ _zone, ...m }) => (void _zone, m));
}
