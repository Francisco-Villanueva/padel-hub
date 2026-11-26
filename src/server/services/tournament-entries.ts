// Parejas inscriptas en un torneo y alta de jugadores en el momento.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { normalizePhone } from '../../lib/phone';
import type { PlayerInput } from '../../lib/player-schema';
import { validatePair } from '../../lib/tournament/eligibility';
import type { CategoryRuleKind, Modality } from '../../lib/tournament/constants';
import { players, tournamentEntries, tournamentEntryPlayers, tournaments } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';
import { createPlayer, createPlayerWithoutPhone, PlayerError } from './players';
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


// Inscripción rápida y masiva ------------------------------------------------------------------------------------------
// Los jugadores que se anotan a un torneo suelen ser nuevos: en vez de dar de alta a cada uno aparte, se anota la pareja
// escribiendo sus nombres. Si ya existe un jugador del club con ese nombre se usa; si no, se crea sin teléfono (se completa
// después) con el alta manual de siempre y su consentimiento.

/** Un lado de la pareja: un jugador ya existente o los datos para encontrarlo o crearlo. */
export interface PlayerRef {
  playerId?: string;
  firstName?: string;
  lastName?: string;
  gender?: 'male' | 'female';
  category?: number | null;
}
export interface PairRowInput { p1: PlayerRef; p2: PlayerRef }
export type PairRowResult =
  | { ok: true; entryId: string; created: number; reused: number }
  | { ok: false; error: string; detail?: Record<string, unknown> };

/** Sin tildes ni mayúsculas, para comparar nombres. */
export const normalizeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Nombre de pila provisorio cuando solo se conoce el apellido (la lista de inscriptos suele traer solo apellidos). */
export const PLACEHOLDER_FIRST_NAME = 'Nombre';

type Catalogue = { id: string; first: string; last: string; category: number | null; gender: 'male' | 'female' }[];

function defaultGender(modality: Modality, slot: 1 | 2): 'male' | 'female' {
  if (modality === 'femenino') return 'female';
  if (modality === 'mixto') return slot === 1 ? 'male' : 'female';
  return 'male';
}

/** Busca un jugador del club que coincida con la referencia; null si no hay uno inequívoco. */
function findExisting(cat: Catalogue, ref: PlayerRef): Catalogue[number] | null {
  const last = normalizeName(ref.lastName ?? ''), first = normalizeName(ref.firstName ?? '');
  if (!last) return null;
  const placeholder = !first || first === normalizeName(PLACEHOLDER_FIRST_NAME);
  const same = placeholder
    ? cat.filter((p) => p.last === last)
    : cat.filter((p) => (p.last === last && p.first === first) || (p.last === first && p.first === last)); // también "Nombre Apellido" al revés
  return same.length === 1 ? same[0] : null;
}

/**
 * Anota varias parejas de una vez. Cada fila se resuelve por separado (con un savepoint): si una falla, las demás siguen y
 * esa no deja nada a medias. Devuelve un resultado por fila, en el mismo orden.
 */
export async function registerPairs(
  tx: Tx, ctx: { clubId: string; country?: string; locale?: 'es' | 'en' | 'pt' }, tournamentId: string, rows: PairRowInput[],
): Promise<PairRowResult[]> {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const t = await loadTournament(tx, tournamentId);
  if (t.status !== 'inscripcion') throw new TournamentError('invalid_state', { status: t.status });

  const all = await tx.select({ id: players.id, first: players.firstName, last: players.lastName, category: players.category, gender: players.gender })
    .from(players).where(isNull(players.deletedAt));
  const cat: Catalogue = all.map((p) => ({ id: p.id, first: normalizeName(p.first), last: normalizeName(p.last), category: p.category, gender: p.gender }));
  const single = t.categoryRuleKind === 'single' ? t.categoryRuleValue : undefined;

  const results: PairRowResult[] = [];
  for (const row of rows) {
    let created = 0, reused = 0;
    try {
      const entryId = await tx.transaction(async (sp) => {
        const ids: string[] = [];
        for (const [i, ref] of ([row.p1, row.p2] as const).entries()) {
          if (ref.playerId) { ids.push(ref.playerId); continue; }
          const lastName = (ref.lastName ?? '').trim();
          if (!lastName || lastName.length > 80 || (ref.firstName ?? '').trim().length > 80) throw new TournamentError('pair_missing_names');
          const hit = findExisting(cat, ref);
          if (hit) { ids.push(hit.id); reused++; continue; }
          const playerInput = {
            firstName: (ref.firstName ?? '').trim() || PLACEHOLDER_FIRST_NAME, lastName, gender: ref.gender ?? defaultGender(t.modality as Modality, (i + 1) as 1 | 2),
            category: ref.category === undefined ? single : ref.category ?? undefined, slots: [],
          };
          const id = await createPlayerWithoutPhone(sp as unknown as Tx, ctx, playerInput, { textVersion: 'club-attested-v1', locale: ctx.locale ?? 'es', source: 'manual' });
          cat.push({ id, first: normalizeName(playerInput.firstName), last: normalizeName(lastName), category: playerInput.category ?? null, gender: playerInput.gender });
          ids.push(id); created++;
        }
        return registerPair(sp as unknown as Tx, ctx, tournamentId, { player1Id: ids[0], player2Id: ids[1] });
      });
      results.push({ ok: true, entryId, created, reused });
    } catch (e) {
      if (e instanceof TournamentError) results.push({ ok: false, error: e.code, detail: e.detail });
      else throw e;
    }
  }
  return results;
}
