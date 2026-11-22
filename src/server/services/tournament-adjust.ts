// Ajustes a mano del club sobre un torneo en juego: rivales de la llave, parejas en las zonas y jugadores de una pareja.
// (Los horarios y los resultados están en tournament-matches.ts.) Nada se deja a medias: si un cambio tocaría un partido que ya
// empezó, falla y se deshace todo.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { players, tournamentEntries, tournamentEntryPlayers, tournamentMatches, tournaments, tournamentZones } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';
import { isStarted, refreshBracket } from './tournament-bracket';
import { TournamentError } from './tournament-errors';

type Ctx = { clubId: string };
export type Side = 'a' | 'b';
export interface SlotRef { matchId: string; side: Side }

async function playing(tx: Tx, tournamentId: string) {
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t) throw new TournamentError('not_found');
  if (t.status !== 'zonas' && t.status !== 'llave') throw new TournamentError('invalid_state', { status: t.status });
  return t;
}

/** Un lugar editable: primera ronda de la llave, partido sin empezar, y no el lado vacío de un cruce libre. */
async function loadSlot(tx: Tx, ref: SlotRef) {
  const [m] = await tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, ref.matchId));
  if (!m) throw new TournamentError('not_found');
  await playing(tx, m.tournamentId);
  if (m.stage !== 'llave' || m.round !== 1 || (m.status === 'bye' && ref.side === 'b') || isStarted(m)) throw new TournamentError('invalid_state', { status: m.status });
  return m;
}

const entryOf = (m: typeof tournamentMatches.$inferSelect, side: Side) => (side === 'a' ? m.entryAId : m.entryBId);
type Slot = typeof tournamentMatches.$inferSelect;
/** En un cruce libre el ganador es la pareja del lado A: se actualiza en el mismo cambio (si no, la restricción del ganador falla). */
const winnerFor = (m: Slot, s: Side, entry: string | null) => (m.status === 'bye' && s === 'a' ? { winnerEntryId: entry } : {});
const patch = (m: Slot, side: Side, v: { entry: string | null; source: string | null; lock: boolean }) =>
  side === 'a' ? { entryAId: v.entry, sourceA: v.source, lockA: v.lock, ...winnerFor(m, 'a', v.entry) } : { entryBId: v.entry, sourceB: v.source, lockB: v.lock };

/**
 * Pone una pareja a mano en un lugar de la primera ronda (queda fijada: la llave automática no la toca), o la saca con `null`
 * (vuelve al lugar automático). La pareja no puede estar ya en otro lugar de la primera ronda: para eso está el intercambio.
 */
export async function setSlotEntry(tx: Tx, ctx: Ctx, ref: SlotRef, entryId: string | null) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const m = await loadSlot(tx, ref);
  if (entryId === null) {
    await tx.update(tournamentMatches).set({ ...side(ref.side, { lock: false, entry: null }), ...winnerFor(m, ref.side, null) }).where(eq(tournamentMatches.id, m.id));
  } else {
    const [e] = await tx.select().from(tournamentEntries).where(and(eq(tournamentEntries.id, entryId), eq(tournamentEntries.tournamentId, m.tournamentId), eq(tournamentEntries.status, 'inscripta')));
    if (!e) throw new TournamentError('not_found');
    const firstRound = await tx.select({ id: tournamentMatches.id, a: tournamentMatches.entryAId, b: tournamentMatches.entryBId }).from(tournamentMatches).where(and(
      eq(tournamentMatches.tournamentId, m.tournamentId), eq(tournamentMatches.stage, 'llave'), eq(tournamentMatches.round, 1),
    ));
    const clash = firstRound.find((x) => (x.a === entryId || x.b === entryId) && !(x.id === m.id && entryOf(m, ref.side) === entryId));
    if (clash) throw new TournamentError('slot_taken');
    await tx.update(tournamentMatches).set({ ...side(ref.side, { lock: true, entry: entryId }), ...winnerFor(m, ref.side, entryId) }).where(eq(tournamentMatches.id, m.id));
  }
  await refreshBracket(tx, m.tournamentId);
}

function side(s: Side, v: { lock: boolean; entry: string | null }) {
  return s === 'a' ? { entryAId: v.entry, lockA: v.lock } : { entryBId: v.entry, lockB: v.lock };
}

/** Deja un lugar otra vez en automático (toma la pareja que le corresponde por su zona, si ya está definida). */
export async function restoreSlot(tx: Tx, ctx: Ctx, ref: SlotRef) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const m = await loadSlot(tx, ref);
  if (!(ref.side === 'a' ? m.sourceA : m.sourceB)) throw new TournamentError('invalid_state', { status: m.status });
  await tx.update(tournamentMatches).set({ ...side(ref.side, { lock: false, entry: null }), ...winnerFor(m, ref.side, null) }).where(eq(tournamentMatches.id, m.id));
  await refreshBracket(tx, m.tournamentId);
}

/** Intercambia dos lugares de la primera ronda (pareja, origen y fijación): "cambiar de cruce". */
export async function swapSlots(tx: Tx, ctx: Ctx, a: SlotRef, b: SlotRef) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  if (a.matchId === b.matchId && a.side === b.side) throw new TournamentError('invalid_state');
  const ma = await loadSlot(tx, a), mb = await loadSlot(tx, b);
  if (ma.tournamentId !== mb.tournamentId) throw new TournamentError('not_found');
  const get = (m: typeof ma, s: Side) => ({ entry: entryOf(m, s), source: s === 'a' ? m.sourceA : m.sourceB, lock: s === 'a' ? m.lockA : m.lockB });
  const va = get(ma, a.side), vb = get(mb, b.side);
  if (ma.id === mb.id) {
    await tx.update(tournamentMatches).set({ ...patch(ma, a.side, vb), ...patch(ma, b.side, va) }).where(eq(tournamentMatches.id, ma.id));
  } else {
    await tx.update(tournamentMatches).set(patch(ma, a.side, vb)).where(eq(tournamentMatches.id, ma.id));
    await tx.update(tournamentMatches).set(patch(mb, b.side, va)).where(eq(tournamentMatches.id, mb.id));
  }
  await refreshBracket(tx, ma.tournamentId);
}

/**
 * Cambia de zona a dos parejas entre sí (el tamaño de las zonas se mantiene). Solo si ningún partido de ninguna de las dos zonas
 * empezó. Reescribe sus partidos de zona; la llave no cambia porque depende solo del tamaño de las zonas.
 */
export async function swapZoneEntries(tx: Tx, ctx: Ctx, entryA: string, entryB: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  if (entryA === entryB) throw new TournamentError('invalid_state');
  const rows = await tx.select().from(tournamentEntries).where(and(inArray(tournamentEntries.id, [entryA, entryB]), eq(tournamentEntries.status, 'inscripta')));
  const ea = rows.find((r) => r.id === entryA), eb = rows.find((r) => r.id === entryB);
  if (!ea || !eb || ea.tournamentId !== eb.tournamentId || !ea.zoneId || !eb.zoneId) throw new TournamentError('not_found');
  await playing(tx, ea.tournamentId);
  if (ea.zoneId === eb.zoneId) throw new TournamentError('invalid_state');
  const zms = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.stage, 'zona'), inArray(tournamentMatches.zoneId, [ea.zoneId, eb.zoneId])));
  if (zms.some((m) => m.status === 'jugado' || m.status === 'en_juego')) throw new TournamentError('zone_started');
  const swap = (id: string | null) => (id === entryA ? entryB : id === entryB ? entryA : id);
  for (const m of zms) {
    if (m.entryAId === entryA || m.entryAId === entryB || m.entryBId === entryA || m.entryBId === entryB) {
      await tx.update(tournamentMatches).set({ entryAId: swap(m.entryAId), entryBId: swap(m.entryBId) }).where(eq(tournamentMatches.id, m.id));
    }
  }
  await tx.update(tournamentEntries).set({ zoneId: eb.zoneId, seed: eb.seed }).where(eq(tournamentEntries.id, entryA));
  await tx.update(tournamentEntries).set({ zoneId: ea.zoneId, seed: ea.seed }).where(eq(tournamentEntries.id, entryB));
  await tx.update(tournamentZones).set({ tieDraw: null }).where(inArray(tournamentZones.id, [ea.zoneId, eb.zoneId]));
  await refreshBracket(tx, ea.tournamentId);
}

/**
 * Cambia a un jugador de una pareja por otro del club (reemplazo, lesión, error de carga). No vuelve a validar la categoría:
 * es una decisión del club. El nuevo no puede estar ya en otra pareja del torneo. Con el torneo cerrado o cancelado no se permite.
 */
export async function replacePlayer(tx: Tx, ctx: Ctx, entryId: string, oldPlayerId: string, newPlayerId: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const [e] = await tx.select().from(tournamentEntries).where(and(eq(tournamentEntries.id, entryId), eq(tournamentEntries.status, 'inscripta')));
  if (!e) throw new TournamentError('not_found');
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, e.tournamentId));
  if (!t || !['inscripcion', 'zonas', 'llave'].includes(t.status)) throw new TournamentError('invalid_state', { status: t?.status ?? '' });
  if (oldPlayerId !== e.player1Id && oldPlayerId !== e.player2Id) throw new TournamentError('not_found');
  if (newPlayerId === e.player1Id || newPlayerId === e.player2Id) throw new TournamentError('pair_invalid', { reason: 'same_player' });
  const [np] = await tx.select({ id: players.id }).from(players).where(and(eq(players.id, newPlayerId), isNull(players.deletedAt)));
  if (!np) throw new TournamentError('player_not_found');
  const taken = await tx.select({ id: tournamentEntryPlayers.playerId }).from(tournamentEntryPlayers).where(and(eq(tournamentEntryPlayers.tournamentId, e.tournamentId), eq(tournamentEntryPlayers.playerId, newPlayerId)));
  if (taken.length) throw new TournamentError('player_taken');
  await tx.update(tournamentEntries).set(oldPlayerId === e.player1Id ? { player1Id: newPlayerId } : { player2Id: newPlayerId }).where(eq(tournamentEntries.id, entryId));
  await tx.delete(tournamentEntryPlayers).where(and(eq(tournamentEntryPlayers.entryId, entryId), eq(tournamentEntryPlayers.playerId, oldPlayerId)));
  await tx.insert(tournamentEntryPlayers).values({ clubId: ctx.clubId, tournamentId: e.tournamentId, entryId, playerId: newPlayerId });
}
