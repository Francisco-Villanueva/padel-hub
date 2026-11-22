// Torneo de ejemplo para el club demo (solo desarrollo): "6ta libre" con 8 parejas, jugado y cerrado, para ver el ranking y las
// pantallas con datos. Usa los mismos servicios que la aplicación. Datos ficticios. Si el club ya tiene torneos, no hace nada.
import { and, asc, eq, isNull } from 'drizzle-orm';
import { tournamentInputSchema } from '../src/lib/tournament-schema';
import { tournamentMatches, tournaments } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { createPlayer } from '../src/server/services/players';
import { registerPair } from '../src/server/services/tournament-entries';
import { recordResult, resolveTie } from '../src/server/services/tournament-matches';
import { closeTournament, createTournament, openRegistration, startTournament, zoneStates } from '../src/server/services/tournaments';
import type { runners } from './_db';

const FIRST = ['Mauro', 'Ezequiel', 'Bruno', 'Ramiro', 'Joaquín', 'Lautaro', 'Franco', 'Ignacio', 'Pablo', 'Sergio', 'Hernán', 'Maximiliano', 'Cristian', 'Emiliano', 'Leandro', 'Rodrigo'];
const LAST = ['Aguirre', 'Barrios', 'Cabrera', 'Domínguez', 'Escobar', 'Funes', 'Giménez', 'Herrera', 'Ibarra', 'Juárez', 'Lagos', 'Medina', 'Navarro', 'Ortiz', 'Peralta', 'Quiroga'];

type R = ReturnType<typeof runners>;

export async function seedExampleTournament(r: R, clubId: string, country = 'AR') {
  const t = <T>(fn: (tx: Tx) => Promise<T>) => r.withTenant(clubId, fn);
  if ((await t((tx) => tx.select({ id: tournaments.id }).from(tournaments).limit(1))).length) return false;
  const ctx = { clubId };

  const ids: string[] = [];
  for (let i = 0; i < 16; i++) {
    ids.push(await t((tx) => createPlayer(tx, { clubId, country }, {
      firstName: FIRST[i], lastName: LAST[i], gender: 'male', category: 6, slots: ['noche'], phone: `29147000${String(10 + i)}`,
    }, { textVersion: 'seed-demo', locale: 'es' })));
  }

  const input = tournamentInputSchema.parse({
    name: '6ta libre · ejemplo', modality: 'libre', ruleKind: 'single', ruleValue: 6, isRanked: true, minPairs: 6,
    championPoints: 1000, participationPoints: 5, startsOn: new Date().toISOString().slice(0, 10),
  });
  const id = await t((tx) => createTournament(tx, ctx, input));
  await t((tx) => openRegistration(tx, ctx, id));
  for (let i = 0; i < 16; i += 2) await t((tx) => registerPair(tx, ctx, id, { player1Id: ids[i], player2Id: ids[i + 1] }));
  await t((tx) => startTournament(tx, ctx, id, { seed: 7 }));

  const playAll = async (stage: 'zona' | 'llave') => {
    for (let guard = 0; guard < 100; guard++) {
      const pending = await t((tx) => tx.select().from(tournamentMatches).where(and(
        eq(tournamentMatches.tournamentId, id), eq(tournamentMatches.stage, stage), isNull(tournamentMatches.winnerEntryId), eq(tournamentMatches.status, 'pendiente'),
      )).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.position)));
      const m = pending.find((x) => x.entryAId && x.entryBId);
      if (!m) return;
      await t((tx) => recordResult(tx, ctx, m.id, [[6, 3 + (guard % 3)], [6, 4]]));
    }
  };
  await playAll('zona');
  for (const z of await t((tx) => zoneStates(tx, ctx, id))) if (z.standings.needsDraw.length) await t((tx) => resolveTie(tx, ctx, z.zone.id, { seed: 3 }));
  await playAll('llave');
  await t((tx) => closeTournament(tx, ctx, id));
  return true;
}
