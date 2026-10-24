// Jugadores del club. Todas las funciones reciben el `tx` de withTenant(): RLS filtra por club.
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { normalizePhone } from '../../lib/phone';
import type { PlayerFilters, PlayerInput } from '../../lib/player-schema';
import { auditLog, contactLog, playerConsents, players } from '../db/schema';
import type { Tx } from '../db/tenant';

export const PAGE_SIZE = 25;

export type PlayerErrorCode = 'invalid_phone' | 'phone_taken' | 'not_found';
export class PlayerError extends Error {
  constructor(readonly code: PlayerErrorCode) { super(code); }
}

const row = {
  id: players.id, firstName: players.firstName, lastName: players.lastName, gender: players.gender,
  category: players.category,
  phoneE164: players.phoneE164, position: players.position, slots: players.slots, instagram: players.instagram,
  locality: players.locality, notes: players.notes, source: players.source, createdAt: players.createdAt,
  // Último contacto del club con el jugador (null si nunca).
  lastContactAt: sql<string | null>`(select max(c.created_at) from ${contactLog} c where c.player_id = players.id)`,
};
export type PlayerRow = Awaited<ReturnType<typeof listPlayers>>['rows'][number];

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function whereFor(f: Partial<PlayerFilters>): SQL {
  const conds: (SQL | undefined)[] = [isNull(players.deletedAt)];
  if (f.q) {
    const like = `%${escapeLike(f.q.toLowerCase())}%`;
    conds.push(sql`(lower(${players.firstName} || ' ' || ${players.lastName}) like ${like} or lower(${players.lastName} || ' ' || ${players.firstName}) like ${like} or ${players.phoneE164} like ${like})`);
  }
  if (f.category) conds.push(eq(players.category, f.category));
  if (f.gender) conds.push(eq(players.gender, f.gender));
  if (f.position) conds.push(eq(players.position, f.position));
  if (f.slot) conds.push(sql`${players.slots} @> ARRAY[${f.slot}]::time_slot[]`);
  return and(...conds)!;
}

export async function listPlayers(tx: Tx, filters: Partial<PlayerFilters>) {
  const w = whereFor(filters);
  const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(players).where(w);
  // Una página fuera de rango (enlace viejo, filtro nuevo) cae en la última en vez de mostrar "sin resultados".
  const page = Math.min(Math.max(1, filters.page ?? 1), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const rows = await tx.select(row).from(players)
    .where(w).orderBy(asc(players.lastName), asc(players.firstName), asc(players.id))
    .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getPlayer(tx: Tx, id: string) {
  const [p] = await tx.select(row).from(players)
    .where(and(eq(players.id, id), isNull(players.deletedAt))).limit(1);
  return p ?? null;
}

async function phoneFree(tx: Tx, phone: string, exceptId?: string) {
  const [dup] = await tx.select({ id: players.id }).from(players).where(and(eq(players.phoneE164, phone), isNull(players.deletedAt)));
  if (dup && dup.id !== exceptId) throw new PlayerError('phone_taken');
}

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};

export async function createPlayer(tx: Tx, ctx: { clubId: string; country: string }, input: PlayerInput, consent: { textVersion: string; locale: 'es' | 'en' | 'pt'; source?: 'manual' | 'link' | 'tablet' }) {
  const source = consent.source ?? 'manual';
  const phone = normalizePhone(input.phone, ctx.country);
  if (!phone) throw new PlayerError('invalid_phone');

  // Si el teléfono pertenece a un jugador dado de baja, el teléfono sigue ocupado por la restricción única: se reactiva.
  const [gone] = await tx.select({ id: players.id }).from(players).where(and(eq(players.phoneE164, phone), sql`${players.deletedAt} is not null`));
  if (!gone) await phoneFree(tx, phone);

  const values = {
    firstName: input.firstName, lastName: input.lastName, gender: input.gender, category: input.category ?? null,
    phoneE164: phone, position: input.position ?? null, slots: input.slots, instagram: input.instagram ?? null,
    locality: input.locality ?? null, notes: input.notes ?? null, source,
  };
  try {
    const [p] = gone
      ? await tx.update(players).set({ ...values, deletedAt: null }).where(eq(players.id, gone.id)).returning({ id: players.id })
      : await tx.insert(players).values({ ...values, clubId: ctx.clubId }).returning({ id: players.id });
    // El club declara que el jugador aceptó recibir mensajes; queda registrado.
    await tx.insert(playerConsents).values({ clubId: ctx.clubId, playerId: p.id, textVersion: consent.textVersion, locale: consent.locale, source });
    return p.id;
  } catch (e) {
    if (isUniqueViolation(e)) throw new PlayerError('phone_taken');
    throw e;
  }
}

export async function updatePlayer(tx: Tx, ctx: { country: string }, id: string, input: PlayerInput) {
  const current = await getPlayer(tx, id);
  if (!current) throw new PlayerError('not_found');
  const phone = normalizePhone(input.phone, ctx.country);
  if (!phone) throw new PlayerError('invalid_phone');
  await phoneFree(tx, phone, id);
  try {
    await tx.update(players).set({
      firstName: input.firstName, lastName: input.lastName, gender: input.gender, category: input.category ?? null,
      phoneE164: phone, position: input.position ?? null, slots: input.slots, instagram: input.instagram ?? null,
      locality: input.locality ?? null, notes: input.notes ?? null,
    }).where(eq(players.id, id));
  } catch (e) {
    if (isUniqueViolation(e)) throw new PlayerError('phone_taken');
    throw e;
  }
}

/** Baja lógica (reversible). El borrado definitivo, por pedido de supresión de datos, es otra acción. */
export async function softDeletePlayer(tx: Tx, ctx: { clubId: string; userId: string }, id: string) {
  const res = await tx.update(players).set({ deletedAt: new Date() }).where(and(eq(players.id, id), isNull(players.deletedAt))).returning({ id: players.id });
  if (res.length === 0) throw new PlayerError('not_found');
  await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'players.delete', detail: { playerId: id } });
}

/** Cantidad de jugadores activos del club, sin filtros. */
export async function countPlayers(tx: Tx): Promise<number> {
  const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(players).where(isNull(players.deletedAt));
  return total;
}

/** Último consentimiento registrado del jugador (null si no hay). */
export async function getLatestConsent(tx: Tx, playerId: string) {
  const [c] = await tx.select().from(playerConsents).where(eq(playerConsents.playerId, playerId)).orderBy(sql`${playerConsents.acceptedAt} desc`).limit(1);
  return c ?? null;
}
