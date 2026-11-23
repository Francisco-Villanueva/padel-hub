// Zonas de un torneo: parejas activas y estado de cada zona (posiciones, desempates). Lo usan el ciclo de vida, la llave y la UI.
import { and, asc, eq } from 'drizzle-orm';
import { zoneStandings, type ZoneMatchResult } from '../../lib/tournament/standings';
import { tournamentEntries, tournamentMatches, tournamentZones } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';

export async function activeEntries(tx: Tx, tournamentId: string) {
  return tx.select().from(tournamentEntries)
    .where(and(eq(tournamentEntries.tournamentId, tournamentId), eq(tournamentEntries.status, 'inscripta')))
    .orderBy(asc(tournamentEntries.createdAt), asc(tournamentEntries.id));
}

/** Estado de cada zona con sus posiciones (también lo usa la UI). Sin comprobar el flag: lo hace quien llama. */
export async function zoneStatesRaw(tx: Tx, tournamentId: string) {
  const zones = await tx.select().from(tournamentZones).where(eq(tournamentZones.tournamentId, tournamentId)).orderBy(asc(tournamentZones.position));
  const matches = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.stage, 'zona')))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.position));
  const entries = await activeEntries(tx, tournamentId);
  return zones.map((z) => {
    const ids = entries.filter((e) => e.zoneId === z.id).map((e) => e.id);
    const ms = matches.filter((m) => m.zoneId === z.id);
    const results: ZoneMatchResult[] = ms.map((m) => ({ round: m.round, position: m.position, a: m.entryAId, b: m.entryBId, winner: m.winnerEntryId, sets: m.sets }));
    const order = (z.tieDraw as { order?: string[] } | null)?.order;
    return { zone: z, entryIds: ids, matches: ms, standings: zoneStandings(z.size as 3 | 4, ids, results, { draw: order }) };
  });
}

export async function zoneStates(tx: Tx, ctx: { clubId: string }, tournamentId: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  return zoneStatesRaw(tx, tournamentId);
}
