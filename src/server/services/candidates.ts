// "Falta el cuarto": candidatos para completar un partido. La app solo ordena y filtra; quien decide es el club.
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { PlayerFilters } from '../../lib/player-schema';
import { contactLog, playerConsents, players } from '../db/schema';
import type { Tx } from '../db/tenant';

export const CANDIDATE_LIMIT = 60;

export type CandidateFilters = Pick<PlayerFilters, 'category' | 'gender' | 'position' | 'slot'>;

/**
 * Jugadores activos, con consentimiento registrado, que cumplen los filtros. Los que nunca fueron contactados van primero
 * y después los contactados hace más tiempo, para repartir las invitaciones.
 */
export async function listCandidates(tx: Tx, f: Partial<CandidateFilters>) {
  const conds: SQL[] = [
    isNull(players.deletedAt),
    sql`exists (select 1 from ${playerConsents} c where c.player_id = ${players.id})`,
  ];
  if (f.category) conds.push(eq(players.category, f.category));
  if (f.gender) conds.push(eq(players.gender, f.gender));
  if (f.position) conds.push(eq(players.position, f.position));
  if (f.slot) conds.push(sql`${players.slots} @> ARRAY[${f.slot}]::time_slot[]`);

  const lastContact = sql<string | null>`(select max(c.created_at) from ${contactLog} c where c.player_id = players.id)`;
  const where = and(...conds);

  const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(players).where(where);
  const rows = await tx.select({
    id: players.id, firstName: players.firstName, lastName: players.lastName, locality: players.locality, position: players.position,
    slots: players.slots, phoneE164: players.phoneE164,
    category: players.category, gender: players.gender,
    lastContactAt: lastContact,
  }).from(players)
    .where(where)
    .orderBy(sql`${lastContact} asc nulls first`, asc(players.lastName), asc(players.id))
    .limit(CANDIDATE_LIMIT);
  return { rows, total };
}
