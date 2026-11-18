// Resultados de partidos (zonas y llave), avance de la llave y sorteo de desempates.
import { randomInt } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { setsSchema, winnerOfSets } from '../../lib/tournament-schema';
import { resolveFourZoneRound2 } from '../../lib/tournament/draw';
import { mulberry32 } from '../../lib/tournament/rng';
import { drawTieOrder } from '../../lib/tournament/standings';
import { tournamentMatches, tournaments, tournamentZones } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';
import { TournamentError } from './tournament-errors';
import { zoneStates } from './tournaments';

type Ctx = { clubId: string };
type Match = typeof tournamentMatches.$inferSelect;

async function loadMatch(tx: Tx, id: string) {
  const [m] = await tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, id));
  if (!m) throw new TournamentError('not_found');
  const [t] = await tx.select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, m.tournamentId));
  return { m, status: t.status };
}

const requiredStatus = (m: Match) => (m.stage === 'zona' ? 'zonas' : 'llave');

/** Partidos de la llave ordenados por ronda y posición. */
export async function listBracketMatches(tx: Tx, ctx: Ctx, tournamentId: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  return tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.stage, 'llave')))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.position));
}

/**
 * Carga (o corrige) el resultado: sets válidos, ganador por sets, avance en la llave. Corregir el ganador de un partido
 * cuyo cruce siguiente ya se jugó no se permite (hay que borrar antes ese resultado).
 */
export async function recordResult(tx: Tx, ctx: Ctx, matchId: string, rawSets: unknown, opts: { now?: Date } = {}) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const { m, status } = await loadMatch(tx, matchId);
  if (status !== requiredStatus(m)) throw new TournamentError('invalid_state', { status });
  if (!m.entryAId || !m.entryBId || m.status === 'bye') throw new TournamentError('result_invalid', { reason: 'no_players' });
  const parsed = setsSchema.safeParse(rawSets);
  const side = parsed.success ? winnerOfSets(parsed.data) : null;
  if (!parsed.success || !side) throw new TournamentError('result_invalid', { reason: 'sets' });
  const winner = side === 'a' ? m.entryAId : m.entryBId;

  await propagate(tx, m, winner);
  await tx.update(tournamentMatches).set({ sets: parsed.data, winnerEntryId: winner, status: 'jugado', playedAt: opts.now ?? new Date() }).where(eq(tournamentMatches.id, m.id));
  if (m.stage === 'zona' && m.zoneId) await tx.update(tournamentZones).set({ tieDraw: null }).where(eq(tournamentZones.id, m.zoneId)); // un sorteo viejo ya no vale
}

/** Quita el resultado de un partido (solo si lo que depende de él no se jugó). */
export async function clearResult(tx: Tx, ctx: Ctx, matchId: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const { m, status } = await loadMatch(tx, matchId);
  if (status !== requiredStatus(m)) throw new TournamentError('invalid_state', { status });
  if (m.status !== 'jugado') throw new TournamentError('invalid_state', { status: m.status });
  await propagate(tx, m, null);
  await tx.update(tournamentMatches).set({ sets: null, winnerEntryId: null, status: 'pendiente', playedAt: null }).where(eq(tournamentMatches.id, m.id));
  if (m.stage === 'zona' && m.zoneId) await tx.update(tournamentZones).set({ tieDraw: null }).where(eq(tournamentZones.id, m.zoneId));
}

/** Lleva el ganador (o su ausencia) a lo que depende del partido: el cruce siguiente de la llave o la 2ª ronda de una zona de 4. */
async function propagate(tx: Tx, m: Match, winner: string | null) {
  if (m.stage === 'llave') {
    if (!m.nextMatchId || !m.nextSlot) return;
    const [next] = await tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m.nextMatchId));
    const current = m.nextSlot === 'a' ? next.entryAId : next.entryBId;
    if (current === winner) return;
    if (next.winnerEntryId) throw new TournamentError('next_played');
    await tx.update(tournamentMatches).set(m.nextSlot === 'a' ? { entryAId: winner } : { entryBId: winner }).where(eq(tournamentMatches.id, next.id));
    return;
  }
  if (!m.zoneId || m.round !== 1) return;
  const [zone] = await tx.select().from(tournamentZones).where(eq(tournamentZones.id, m.zoneId));
  if (zone.size !== 4) return;
  const zms = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.zoneId, m.zoneId), eq(tournamentMatches.stage, 'zona')));
  const r2 = zms.filter((x) => x.round === 2).sort((a, b) => a.position - b.position);
  if (r2.some((x) => x.winnerEntryId)) throw new TournamentError('next_played');
  // Resultado de la 1ª ronda con este partido ya actualizado.
  const r1 = zms.filter((x) => x.round === 1).sort((a, b) => a.position - b.position).map((x) => {
    const w = x.id === m.id ? winner : x.winnerEntryId;
    return w ? { winner: w, loser: w === x.entryAId ? x.entryBId! : x.entryAId! } : null;
  });
  const specs = r1[0] && r1[1] ? resolveFourZoneRound2([r1[0], r1[1]]) : [null, null];
  for (const row of r2) {
    const spec = specs[row.position - 1];
    await tx.update(tournamentMatches).set({ entryAId: spec?.a ?? null, entryBId: spec?.b ?? null }).where(eq(tournamentMatches.id, row.id));
  }
}

/**
 * Sorteo de desempate de una zona (solo cuando ningún criterio desempata). Se guarda con la semilla y el orden:
 * queda registrado y es reproducible. Se invalida si después se corrige algún resultado de la zona.
 */
export async function resolveTie(tx: Tx, ctx: Ctx, zoneId: string, opts: { seed?: number } = {}) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const [zone] = await tx.select().from(tournamentZones).where(eq(tournamentZones.id, zoneId));
  if (!zone) throw new TournamentError('not_found');
  const [t] = await tx.select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, zone.tournamentId));
  if (t.status !== 'zonas') throw new TournamentError('invalid_state', { status: t.status });
  const state = (await zoneStates(tx, ctx, zone.tournamentId)).find((s) => s.zone.id === zoneId)!;
  if (state.standings.needsDraw.length === 0) throw new TournamentError('draw_invalid');
  const seed = opts.seed ?? randomInt(2 ** 31);
  const rng = mulberry32(seed);
  const order = state.standings.needsDraw.flatMap((g) => drawTieOrder(g, rng));
  await tx.update(tournamentZones).set({ tieDraw: { seed, order } }).where(eq(tournamentZones.id, zoneId));
  return { seed, order };
}
