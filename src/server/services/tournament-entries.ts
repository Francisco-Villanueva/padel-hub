// Parejas inscriptas en un torneo y alta de jugadores en el momento.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { normalizePhone } from '../../lib/phone';
import type { PlayerInput } from '../../lib/player-schema';
import { validatePair } from '../../lib/tournament/eligibility';
import type { CategoryRuleKind, Modality } from '../../lib/tournament/constants';
import { players, tournamentEntries, tournamentEntryPlayers, tournaments } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';
import { createPlayer, PlayerError } from './players';
import { isUniqueViolation, TournamentError } from './tournament-errors';

type Ctx = { clubId: string };

async function loadTournament(tx: Tx, id: string) {
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, id));
  if (!t) throw new TournamentError('not_found');
  return t;
}

/** Parejas con los datos de sus jugadores (sin dadas de baja salvo que se pida). */
export async function listEntries(tx: Tx, ctx: Ctx, tournamentId: string, opts: { includeRemoved?: boolean } = {}) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const rows = await tx.select().from(tournamentEntries)
    .where(and(eq(tournamentEntries.tournamentId, tournamentId), opts.includeRemoved ? undefined : eq(tournamentEntries.status, 'inscripta')))
    .orderBy(asc(tournamentEntries.createdAt), asc(tournamentEntries.id));
  const ids = [...new Set(rows.flatMap((r) => [r.player1Id, r.player2Id]))];
  const people = ids.length ? await tx.select({ id: players.id, firstName: players.firstName, lastName: players.lastName, category: players.category, gender: players.gender }).from(players).where(inArray(players.id, ids)) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, player1: byId.get(r.player1Id)!, player2: byId.get(r.player2Id)! }));
}

export async function countActiveEntries(tx: Tx, tournamentId: string) {
  const rows = await tx.select({ id: tournamentEntries.id }).from(tournamentEntries)
    .where(and(eq(tournamentEntries.tournamentId, tournamentId), eq(tournamentEntries.status, 'inscripta')));
  return rows.length;
}

/** Inscribe una pareja: valida estado del torneo, existencia de los jugadores, categoría/modalidad y que no estén ya en otra pareja. */
export async function registerPair(tx: Tx, ctx: Ctx, tournamentId: string, input: { player1Id: string; player2Id: string }) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const t = await loadTournament(tx, tournamentId);
  if (t.status !== 'inscripcion') throw new TournamentError('invalid_state', { status: t.status });
  if (input.player1Id === input.player2Id) throw new TournamentError('pair_invalid', { reason: 'same_player' });

  // RLS: un jugador de otro club simplemente no aparece.
  const found = await tx.select({ id: players.id, category: players.category, gender: players.gender }).from(players)
    .where(and(inArray(players.id, [input.player1Id, input.player2Id]), isNull(players.deletedAt)));
  const a = found.find((p) => p.id === input.player1Id), b = found.find((p) => p.id === input.player2Id);
  if (!a || !b) throw new TournamentError('player_not_found');

  const check = validatePair({ rule: { kind: t.categoryRuleKind as CategoryRuleKind, value: t.categoryRuleValue }, modality: t.modality as Modality }, a, b);
  if (!check.ok) throw new TournamentError('pair_invalid', { reason: check.reason });

  // Un jugador no puede estar en dos parejas activas del torneo. Se chequea antes de insertar (un error de unicidad abortaría la
  // transacción); la restricción única de tournament_entry_players cubre la carrera entre dos pedidos simultáneos.
  const taken = await tx.select({ id: tournamentEntryPlayers.playerId }).from(tournamentEntryPlayers)
    .where(and(eq(tournamentEntryPlayers.tournamentId, tournamentId), inArray(tournamentEntryPlayers.playerId, [a.id, b.id])));
  if (taken.length) throw new TournamentError('player_taken', { playerIds: taken.map((x) => x.id) });
  const [entry] = await tx.insert(tournamentEntries).values({ clubId: ctx.clubId, tournamentId, player1Id: a.id, player2Id: b.id }).returning({ id: tournamentEntries.id });
  try {
    await tx.insert(tournamentEntryPlayers).values([a.id, b.id].map((playerId) => ({ clubId: ctx.clubId, tournamentId, entryId: entry.id, playerId })));
  } catch (e) {
    if (isUniqueViolation(e)) throw new TournamentError('player_taken');
    throw e;
  }
  return entry.id;
}

/** Baja lógica de la pareja, solo antes de iniciar. Libera a sus jugadores para otra pareja. */
export async function removePair(tx: Tx, ctx: Ctx, entryId: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const [e] = await tx.select().from(tournamentEntries).where(eq(tournamentEntries.id, entryId));
  if (!e) throw new TournamentError('not_found');
  const t = await loadTournament(tx, e.tournamentId);
  if (t.status !== 'inscripcion' && t.status !== 'borrador') throw new TournamentError('invalid_state', { status: t.status });
  await tx.update(tournamentEntries).set({ status: 'baja' }).where(eq(tournamentEntries.id, entryId));
  await tx.delete(tournamentEntryPlayers).where(eq(tournamentEntryPlayers.entryId, entryId));
}

export interface QuickPlayerInput { firstName: string; lastName: string; gender: 'male' | 'female'; category?: number; phone: string }

/**
 * Alta en el momento. Dedupe por teléfono (único por club): si ya existe un jugador activo se devuelve para que la UI
 * ofrezca usarlo. Si no, se crea con el flujo de alta manual (source = manual) y su registro de consentimiento.
 */
export async function quickCreatePlayer(tx: Tx, ctx: { clubId: string; country: string }, input: QuickPlayerInput, locale: 'es' | 'en' | 'pt' = 'es') {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const phone = normalizePhone(input.phone, ctx.country);
  if (!phone) throw new TournamentError('invalid_phone');
  const [existing] = await tx.select({ id: players.id, firstName: players.firstName, lastName: players.lastName, category: players.category, gender: players.gender })
    .from(players).where(and(eq(players.phoneE164, phone), isNull(players.deletedAt)));
  if (existing) return { existing };
  const playerInput: PlayerInput = { firstName: input.firstName, lastName: input.lastName, gender: input.gender, category: input.category, slots: [], phone: input.phone };
  try {
    const id = await createPlayer(tx, ctx, playerInput, { textVersion: 'club-attested-v1', locale, source: 'manual' });
    return { created: { id } };
  } catch (e) {
    if (e instanceof PlayerError && e.code === 'invalid_phone') throw new TournamentError('invalid_phone');
    throw e;
  }
}
