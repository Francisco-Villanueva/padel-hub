// Dos torneos EN PROGRESO en el club demo (solo desarrollo), para probar cómo se maneja un torneo en marcha:
//   - "6ta libre": 15 parejas → 5 zonas de 3.   - "7ma libre": 24 parejas → 8 zonas de 3.
// Algunas zonas quedan completas, otras a medias y otras sin jugar. Datos ficticios. Si ya existen, no hace nada.
//   npx tsx --conditions=react-server scripts/seed-live-tournaments.ts
import { eq } from 'drizzle-orm';
import { tournamentInputSchema } from '../src/lib/tournament-schema';
import { clubs, tournaments } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { createPlayer } from '../src/server/services/players';
import { registerPair } from '../src/server/services/tournament-entries';
import { recordResult } from '../src/server/services/tournament-matches';
import { createTournament, openRegistration, startTournament, zoneStates } from '../src/server/services/tournaments';
import { runners } from './_db';

const FIRST_M = ['Mauro', 'Ezequiel', 'Bruno', 'Ramiro', 'Joaquín', 'Lautaro', 'Franco', 'Ignacio', 'Pablo', 'Sergio', 'Hernán', 'Maximiliano', 'Cristian', 'Emiliano', 'Leandro', 'Rodrigo', 'Axel', 'Gastón', 'Iván', 'Nahuel'];
const FIRST_F = ['Abril', 'Belén', 'Candela', 'Delfina', 'Eugenia', 'Fiorella', 'Guadalupe', 'Helena', 'Ivana', 'Jimena', 'Karina', 'Lara', 'Milagros', 'Noelia', 'Oriana', 'Pilar', 'Rocío', 'Selena', 'Tamara', 'Ursula'];
const LAST = ['Acuña', 'Bustos', 'Campos', 'Duarte', 'Ferrari', 'Godoy', 'Hidalgo', 'Iglesias', 'Luna', 'Molina', 'Núñez', 'Olivera', 'Paz', 'Rivas', 'Salinas', 'Toledo', 'Urquiza', 'Vera', 'Weber', 'Zapata', 'Arce', 'Bravo', 'Cano', 'Dávila'];

const SETS: [number, number][][] = [[[6, 3], [6, 4]], [[7, 5], [6, 4]], [[6, 2], [3, 6], [6, 4]], [[6, 4], [6, 1]], [[4, 6], [6, 3], [7, 6]], [[6, 0], [6, 2]]];

async function main() {
  const r = runners();
  try {
    const [club] = await r.withPlatform((tx) => tx.select({ id: clubs.id, country: clubs.country }).from(clubs).where(eq(clubs.slug, 'demo-padel')));
    if (!club) throw new Error('No existe el club demo-padel (corré seed-demo.ts).');
    const clubId = club.id, ctx = { clubId };
    const t = <T>(fn: (tx: Tx) => Promise<T>) => r.withTenant(clubId, fn);

    let phone = 0;
    const make = async (category: 6 | 7, pairs: number) => {
      const ids: string[] = [];
      for (let i = 0; i < pairs * 2; i++) {
        const female = i % 2 === 1;
        const first = (female ? FIRST_F : FIRST_M)[(i >> 1) % 20];
        const last = LAST[(i * 7 + category) % LAST.length];
        ids.push(await t((tx) => createPlayer(tx, { clubId, country: club.country }, {
          firstName: first, lastName: last, gender: female ? 'female' : 'male', category, slots: ['noche'], phone: `29148${String(10000 + ++phone)}`,
        }, { textVersion: 'seed-demo', locale: 'es' })));
      }
      return ids;
    };

    const build = async (name: string, category: 6 | 7, pairs: number, plan: (zoneIdx: number) => number | 'cycle') => {
      if ((await t((tx) => tx.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.name, name)))).length) return console.log(`"${name}" ya existe; no se hizo nada.`);
      const ids = await make(category, pairs);
      const input = tournamentInputSchema.parse({
        name, modality: 'libre', ruleKind: 'single', ruleValue: category, isRanked: true, minPairs: 6,
        championPoints: 1000, participationPoints: 5, startsOn: new Date().toISOString().slice(0, 10),
      });
      const id = await t((tx) => createTournament(tx, ctx, input));
      await t((tx) => openRegistration(tx, ctx, id));
      for (let i = 0; i < ids.length; i += 2) await t((tx) => registerPair(tx, ctx, id, { player1Id: ids[i], player2Id: ids[i + 1] }));
      await t((tx) => startTournament(tx, ctx, id, { seed: category * 11 }));

      let n = 0;
      const states = await t((tx) => zoneStates(tx, ctx, id));
      for (const [zi, z] of states.entries()) {
        const todo = plan(zi);
        const ms = z.matches;
        if (todo === 'cycle') {
          // Ciclo A>B, C>A, B>C todos por 6-4: empate de tres que solo se resuelve por sorteo (queda pendiente a propósito).
          const cyc: [number, [number, number][]][] = [[0, [[6, 4]]], [1, [[4, 6]]], [2, [[6, 4]]]];
          for (const [k, sets] of cyc) await t((tx) => recordResult(tx, ctx, ms[k].id, sets));
          n += 3;
          continue;
        }
        for (let k = 0; k < todo; k++) { await t((tx) => recordResult(tx, ctx, ms[k].id, SETS[(zi + k) % SETS.length])); n++; }
      }
      console.log(`"${name}": ${pairs} parejas, ${states.length} zonas, ${n} de ${states.length * 3} partidos de zona jugados.`);
    };

    // 6ta: Zona A completa, B con empate de tres (pide sorteo), C con 1 partido, D con 2, E sin jugar.
    await build('6ta libre · en juego', 6, 15, (z) => [3, 'cycle' as const, 1, 2, 0][z]);
    // 7ma: zonas A-C completas, D con 2, E con 1, F-H sin jugar.
    await build('7ma libre · en juego', 7, 24, (z) => [3, 3, 3, 2, 1, 0, 0, 0][z]);
  } finally { await r.close(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
