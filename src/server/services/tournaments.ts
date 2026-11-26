// Ciclo de vida del torneo: crear, inscripción, zonas, llave, cierre con puntos y cancelación.
// Reciben el `tx` de withTenant() y no conocen HTTP. Cada función comprueba el flag `tournaments` (defensa en profundidad).
import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { PointsInput, TournamentInput } from '../../lib/tournament-schema';
import { MIN_PAIRS_FLOOR, type CategoryRuleKind, type Modality, type RoundKey, type TournamentStatus } from '../../lib/tournament/constants';
import { drawZones, zoneMatchPlan } from '../../lib/tournament/draw';
import { playerPoints, roundKeyForParticipants, roundPoints, type RoundPoints } from '../../lib/tournament/points';
import type { RankingWindow } from '../../lib/tournament/ranking-window';
import { mulberry32 } from '../../lib/tournament/rng';
import { planZones, zoneName } from '../../lib/tournament/zones';
import { rankingEvents, tournamentEntries, tournamentMatches, tournaments, tournamentTemplates, tournamentZones } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';
import { playerPointsInGroup } from './ranking';
import { createBracketTemplate } from './tournament-bracket';
import { TournamentError } from './tournament-errors';
import { activeEntries } from './tournament-zones';

export { zoneStates } from './tournament-zones';

type Ctx = { clubId: string; userId?: string | null };

const TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  borrador: ['inscripcion', 'cancelado'],
  inscripcion: ['zonas', 'cancelado'],
  // `zonas` = en juego (zonas y llave a la vez); pasa a `llave` solo cuando todas las zonas terminaron, y vuelve si se corrige alguna.
  zonas: ['llave', 'cerrado', 'cancelado'],
  llave: ['zonas', 'cerrado', 'cancelado'],
  cerrado: ['llave'], // reabrir
  cancelado: [],
};

/** Máquina de estados explícita: solo las transiciones válidas. */
export function assertTransition(from: TournamentStatus, to: TournamentStatus) {
  if (!TRANSITIONS[from]?.includes(to)) throw new TournamentError('invalid_state', { from, to });
}

export async function getTournament(tx: Tx, ctx: Ctx, id: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, id));
  return t ?? null;
}

async function mustGet(tx: Tx, ctx: Ctx, id: string) {
  const t = await getTournament(tx, ctx, id);
  if (!t) throw new TournamentError('not_found');
  return t;
}

export async function listTournaments(tx: Tx, ctx: Ctx) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  return tx.select().from(tournaments).orderBy(desc(tournaments.startsOn), desc(tournaments.createdAt), asc(tournaments.id));
}

async function resolvePoints(tx: Tx, input: TournamentInput) {
  let template: typeof tournamentTemplates.$inferSelect | undefined;
  if (input.templateId) {
    [template] = await tx.select().from(tournamentTemplates).where(eq(tournamentTemplates.id, input.templateId));
    if (!template) throw new TournamentError('template_not_found');
  }
  const champion = input.championPoints ?? template?.championPoints;
  if (!champion) throw new TournamentError('champion_required');
  const participation = input.participationPoints ?? template?.participationPoints ?? 0;
  // Snapshot: el torneo guarda su propia tabla (con los ajustes del club); editar la plantilla después no la cambia.
  const table = roundPoints(champion, { percents: template?.roundPercents ?? undefined, overrides: input.roundOverrides });
  return { champion, participation, table, templateId: template?.id ?? null };
}

export async function createTournament(tx: Tx, ctx: Ctx, input: TournamentInput) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const p = await resolvePoints(tx, input);
  const [t] = await tx.insert(tournaments).values({
    clubId: ctx.clubId, name: input.name, modality: input.modality, categoryRuleKind: input.ruleKind, categoryRuleValue: input.ruleValue,
    isRanked: input.isRanked, minPairs: input.minPairs, championPoints: p.champion, participationPoints: p.participation,
    pointsTable: p.table, templateId: p.templateId, startsOn: input.startsOn, seedWindow: input.seedWindow, createdBy: ctx.userId ?? null,
  }).returning({ id: tournaments.id });
  return t.id;
}

/** Solo en borrador o inscripción. Cambiar modalidad o regla con parejas ya inscriptas no se permite (podrían dejar de ser válidas). */
export async function updateTournament(tx: Tx, ctx: Ctx, id: string, input: TournamentInput) {
  const t = await mustGet(tx, ctx, id);
  if (t.status !== 'borrador' && t.status !== 'inscripcion') throw new TournamentError('invalid_state', { status: t.status });
  const rulesChanged = t.modality !== input.modality || t.categoryRuleKind !== input.ruleKind || t.categoryRuleValue !== input.ruleValue;
  if (rulesChanged) {
    const active = await tx.select({ id: tournamentEntries.id }).from(tournamentEntries).where(and(eq(tournamentEntries.tournamentId, id), eq(tournamentEntries.status, 'inscripta'))).limit(1);
    if (active.length) throw new TournamentError('has_entries');
  }
  const p = await resolvePoints(tx, input);
  await tx.update(tournaments).set({
    name: input.name, modality: input.modality, categoryRuleKind: input.ruleKind, categoryRuleValue: input.ruleValue, isRanked: input.isRanked,
    minPairs: input.minPairs, championPoints: p.champion, participationPoints: p.participation, pointsTable: p.table, templateId: p.templateId,
    startsOn: input.startsOn, seedWindow: input.seedWindow,
  }).where(eq(tournaments.id, id));
}

/**
 * Cambia cuánto reparte el torneo (campeón, participación y ajustes por ronda), también con el torneo en juego: los puntos se
 * escriben recién al cerrarlo. Con el torneo cerrado hay que reabrirlo primero (al volver a cerrar se recalculan); cancelado no.
 */
export async function updateTournamentPoints(tx: Tx, ctx: Ctx, id: string, input: PointsInput) {
  const t = await mustGet(tx, ctx, id);
  if (t.status === 'cerrado' || t.status === 'cancelado') throw new TournamentError('invalid_state', { status: t.status });
  const [template] = t.templateId ? await tx.select().from(tournamentTemplates).where(eq(tournamentTemplates.id, t.templateId)) : [];
  const table = roundPoints(input.championPoints, { percents: template?.roundPercents ?? undefined, overrides: input.roundOverrides });
  await tx.update(tournaments).set({ championPoints: input.championPoints, participationPoints: input.participationPoints, pointsTable: table })
    .where(eq(tournaments.id, id));
}

export async function openRegistration(tx: Tx, ctx: Ctx, id: string) {
  const t = await mustGet(tx, ctx, id);
  assertTransition(t.status as TournamentStatus, 'inscripcion');
  await tx.update(tournaments).set({ status: 'inscripcion' }).where(eq(tournaments.id, id));
}

/** Arma zonas (3 y 4) con sorteo reproducible y crea los partidos de zona. Exige el mínimo de parejas. */
export async function startTournament(tx: Tx, ctx: Ctx, id: string, opts: { seed?: number; now?: Date } = {}) {
  const t = await mustGet(tx, ctx, id);
  assertTransition(t.status as TournamentStatus, 'zonas');
  const entries = await activeEntries(tx, id);
  const need = Math.max(t.minPairs, MIN_PAIRS_FLOOR);
  if (entries.length < need) throw new TournamentError('below_min', { missing: need - entries.length, minPairs: need });

  const plan = planZones(entries.length);
  // Cabezas de serie por ranking (una por zona): suma de los puntos de los dos jugadores en el mismo grupo y ventana.
  const group = { ruleKind: t.categoryRuleKind as CategoryRuleKind, ruleValue: t.categoryRuleValue, modality: t.modality as Modality };
  const pts = await playerPointsInGroup(tx, ctx.clubId, group, t.seedWindow as RankingWindow, entries.flatMap((e) => [e.player1Id, e.player2Id]), opts.now);
  const strength = new Map(entries.map((e) => [e.id, (pts.get(e.player1Id) ?? 0) + (pts.get(e.player2Id) ?? 0)]));
  const seeded = entries.filter((e) => strength.get(e.id)! > 0)
    .sort((a, b) => strength.get(b.id)! - strength.get(a.id)! || a.id.localeCompare(b.id)).slice(0, plan.sizes.length);
  const seedOf = new Map(seeded.map((e, i) => [e.id, i + 1]));

  const seed = opts.seed ?? randomInt(2 ** 31);
  const zones = drawZones(entries.map((e) => ({ id: e.id, seed: seedOf.get(e.id) ?? null })), plan, { rng: mulberry32(seed) });

  await persistZones(tx, ctx, id, zones, seedOf, seed);
  return { zones: zones.length, seed };
}

/** Crea las zonas, ubica a las parejas y genera los partidos de zona; deja el torneo en estado `zonas`. */
async function persistZones(tx: Tx, ctx: Ctx, id: string, zones: { index: number; size: 3 | 4; entryIds: string[] }[], seedOf: Map<string, number>, drawSeed: number | null) {
  const zoneRows = await tx.insert(tournamentZones).values(zones.map((z) => ({ clubId: ctx.clubId, tournamentId: id, name: zoneName(z.index), size: z.size, position: z.index + 1 }))).returning({ id: tournamentZones.id, position: tournamentZones.position });
  const zoneId = new Map(zoneRows.map((z) => [z.position - 1, z.id]));
  const matches: (typeof tournamentMatches.$inferInsert)[] = [];
  for (const z of zones) {
    for (const id2 of z.entryIds) {
      await tx.update(tournamentEntries).set({ zoneId: zoneId.get(z.index)!, seed: seedOf.get(id2) ?? null }).where(eq(tournamentEntries.id, id2));
    }
    for (const m of zoneMatchPlan(z.entryIds)) {
      matches.push({ clubId: ctx.clubId, tournamentId: id, stage: 'zona', zoneId: zoneId.get(z.index)!, round: m.round, position: m.position, entryAId: m.a, entryBId: m.b });
    }
  }
  await tx.insert(tournamentMatches).values(matches);
  await tx.update(tournaments).set({ status: 'zonas', drawSeed }).where(eq(tournaments.id, id));
  // La llave se define ya (con "1º Zona A", "2º Zona B"…) y se completa sola a medida que terminan las zonas.
  await createBracketTemplate(tx, ctx, id);
}

/**
 * Inicia el torneo con zonas ya definidas (por ejemplo las que publicó la organización) en vez de sortearlas.
 * `zones` = ids de pareja por zona, en el orden de la zona (pareja 1, 2, 3…). Cada zona es de 3 o 4 y entre todas
 * deben cubrir exactamente a las parejas inscriptas, una sola vez. Exige el mínimo de parejas.
 */
export async function startTournamentWithZones(tx: Tx, ctx: Ctx, id: string, zonesInput: string[][]) {
  const t = await mustGet(tx, ctx, id);
  assertTransition(t.status as TournamentStatus, 'zonas');
  const entries = await activeEntries(tx, id);
  const need = Math.max(t.minPairs, MIN_PAIRS_FLOOR);
  if (entries.length < need) throw new TournamentError('below_min', { missing: need - entries.length, minPairs: need });
  const given = zonesInput.flat();
  const active = new Set(entries.map((e) => e.id));
  const valid = zonesInput.every((z) => z.length === 3 || z.length === 4)
    && given.length === active.size && new Set(given).size === given.length && given.every((e) => active.has(e));
  if (!valid) throw new TournamentError('zones_invalid');
  await persistZones(tx, ctx, id, zonesInput.map((entryIds, index) => ({ index, size: entryIds.length as 3 | 4, entryIds })), new Map(), null);
  return { zones: zonesInput.length };
}

/** Cancelar (dueño o empleado): queda en el historial, solo lectura y sin puntos. */
export async function cancelTournament(tx: Tx, ctx: Ctx, id: string) {
  const t = await mustGet(tx, ctx, id);
  assertTransition(t.status as TournamentStatus, 'cancelado');
  await tx.update(tournaments).set({ status: 'cancelado', cancelledAt: new Date() }).where(eq(tournaments.id, id));
}

/**
 * Cierra el torneo: calcula la ronda alcanzada por pareja y, si es puntuable, escribe el libro de puntos
 * (max(participación, puntos de la ronda)). Idempotente: se reemplazan las filas del torneo, nunca se duplican.
 */
export async function closeTournament(tx: Tx, ctx: Ctx, id: string, opts: { now?: Date } = {}) {
  const t = await mustGet(tx, ctx, id);
  assertTransition(t.status as TournamentStatus, 'cerrado');
  const bracket = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, id), eq(tournamentMatches.stage, 'llave')));
  const rounds = Math.max(0, ...bracket.map((m) => m.round));
  const final = bracket.find((m) => m.round === rounds && m.position === 0);
  if (!final?.winnerEntryId) throw new TournamentError('final_pending');

  const reached = new Map<string, RoundKey>();
  for (const m of bracket) {
    if (m.status === 'bye' || !m.winnerEntryId) continue;
    const loser = m.winnerEntryId === m.entryAId ? m.entryBId : m.entryAId;
    if (loser) reached.set(loser, roundKeyForParticipants(2 ** (rounds - m.round + 1)));
  }
  reached.set(final.winnerEntryId, 'champion');

  const entries = await activeEntries(tx, id);
  for (const e of entries) await tx.update(tournamentEntries).set({ roundReached: reached.get(e.id) ?? null }).where(eq(tournamentEntries.id, e.id));

  const endedOn = t.endsOn ?? (opts.now ?? new Date()).toISOString().slice(0, 10);
  await tx.delete(rankingEvents).where(eq(rankingEvents.tournamentId, id));
  if (t.isRanked) {
    const table = t.pointsTable as RoundPoints;
    const rows = entries.flatMap((e) => [e.player1Id, e.player2Id].map((playerId) => ({
      clubId: ctx.clubId, playerId, tournamentId: id, entryId: e.id, roundReached: reached.get(e.id) ?? null,
      points: playerPoints(table, t.participationPoints, reached.get(e.id) ?? null), tournamentEndedOn: endedOn,
      categoryRuleKind: t.categoryRuleKind, categoryRuleValue: t.categoryRuleValue, modality: t.modality,
    })));
    if (rows.length) await tx.insert(rankingEvents).values(rows);
  }
  await tx.update(tournaments).set({ status: 'cerrado', closedAt: new Date(), endsOn: endedOn }).where(eq(tournaments.id, id));
}

/** Reabrir un torneo cerrado: sus puntos salen del ranking hasta volver a cerrarlo. */
export async function reopenTournament(tx: Tx, ctx: Ctx, id: string) {
  const t = await mustGet(tx, ctx, id);
  assertTransition(t.status as TournamentStatus, 'llave');
  await tx.delete(rankingEvents).where(eq(rankingEvents.tournamentId, id));
  await tx.update(tournaments).set({ status: 'llave', closedAt: null }).where(eq(tournaments.id, id));
}

/** Para la UI: ids de entradas por id (nombre de la pareja). */
export async function entriesByIds(tx: Tx, ids: string[]) {
  return ids.length ? tx.select().from(tournamentEntries).where(inArray(tournamentEntries.id, ids)) : [];
}
