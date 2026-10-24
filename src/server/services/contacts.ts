// Registro de contactos: cada vez que el club abre WhatsApp con un jugador queda una fila en `contact_log`.
// Todas las funciones reciben el `tx` de withTenant(): RLS filtra por club.
import { and, desc, eq, isNull } from 'drizzle-orm';
import { contactLog, players, users } from '../db/schema';
import type { Tx } from '../db/tenant';
import { PlayerError } from './players';

export type ContactReason = 'falta_cuarto' | 'evento' | 'otro';

/** Registra el contacto. Solo se puede contactar a un jugador activo del club (la FK compuesta y RLS lo refuerzan). */
export async function logContact(tx: Tx, ctx: { clubId: string; userId: string }, playerId: string, reason: ContactReason) {
  const [p] = await tx.select({ id: players.id }).from(players).where(and(eq(players.id, playerId), isNull(players.deletedAt)));
  if (!p) throw new PlayerError('not_found');
  await tx.insert(contactLog).values({ clubId: ctx.clubId, playerId, userId: ctx.userId, reason });
}

export function listContacts(tx: Tx, playerId: string, limit = 10) {
  return tx
    .select({ id: contactLog.id, reason: contactLog.reason, at: contactLog.createdAt, userName: users.name })
    .from(contactLog)
    .innerJoin(users, eq(users.id, contactLog.userId))
    .where(eq(contactLog.playerId, playerId))
    .orderBy(desc(contactLog.createdAt))
    .limit(limit);
}
