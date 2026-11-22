// Carga el torneo "7ma libre" de Bahía Pádel (20 al 22 de noviembre de 2026) tal como se publicó en Instagram:
// 6 zonas de 3 parejas, con sus horarios. Solo se conocen los apellidos: los nombres de pila quedan como "Nombre" y los teléfonos
// son ficticios y únicos. Sin resultados: el torneo queda en juego para simularlo desde la app.
//   npx tsx --conditions=react-server scripts/seed-bahia-7ma.ts
// Corre sobre la base de .env.local (dev); imprime el host antes de actuar. Si el torneo ya existe, no hace nada.
import { eq } from 'drizzle-orm';
import { tournamentInputSchema } from '../src/lib/tournament-schema';
import { localToUtc } from '../src/lib/tz';
import { clubs, tournaments } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { setClubFeature } from '../src/server/services/features';
import { createPlayer } from '../src/server/services/players';
import { registerPair } from '../src/server/services/tournament-entries';
import { setMatchSchedule } from '../src/server/services/tournament-matches';
import { createTournament, openRegistration, startTournamentWithZones, zoneStates } from '../src/server/services/tournaments';
import { runners } from './_db';

const NAME = '7ma libre · Bahía Pádel (20 al 22 de noviembre)';
const FRI = '2026-11-20', SAT = '2026-11-21';
type When = [string, string];

// Cada zona: tres parejas (dos apellidos cada una) y el horario de 1 vs 2, 1 vs 3 y 2 vs 3, como en el carrusel.
const ZONES: { pairs: [string, string][]; when: [When, When, When] }[] = [
  { pairs: [['Cardoso', 'Weber'], ['Lopez', 'De Dios'], ['Charbonier', 'Sosa']], when: [[SAT, '15:00'], [FRI, '20:00'], [SAT, '17:00']] },
  { pairs: [['Civalero', 'Vera'], ['Reschini', 'Parrota'], ['De Nari', 'Poloni']], when: [[FRI, '20:00'], [FRI, '18:00'], [SAT, '16:00']] },
  { pairs: [['Weth', 'Blanco'], ['Perez', 'Perez'], ['Igartua', 'Montenegro']], when: [[FRI, '21:00'], [SAT, '17:00'], [SAT, '18:00']] },
  { pairs: [['Lomascolo', 'Trombetta'], ['Oses', 'Suko'], ['Forestier', 'Mendez']], when: [[FRI, '16:00'], [FRI, '19:00'], [FRI, '17:00']] },
  { pairs: [['Navarrete', 'Villanueva'], ['Alonqueo', 'Gutierrez'], ['Braganza', 'Bresina']], when: [[SAT, '13:00'], [SAT, '15:00'], [SAT, '17:00']] },
  { pairs: [['Escudero', 'Compa'], ['Tomassini', 'Eberle'], ['Allende', 'Velazquez']], when: [[SAT, '15:00'], [FRI, '21:00'], [FRI, '18:00']] },
];
const FEMALE = new Set(['De Nari']);

async function main() {
  const r = runners();
  try {
    const [club] = await r.withPlatform((tx) => tx.select({ id: clubs.id, country: clubs.country, timezone: clubs.timezone, locale: clubs.locale }).from(clubs).where(eq(clubs.slug, 'bahia-padel')));
    if (!club) throw new Error('No existe el club bahia-padel en esta base.');
    const clubId = club.id, ctx = { clubId };
    const t = <T>(fn: (tx: Tx) => Promise<T>) => r.withTenant(clubId, fn);
    if ((await t((tx) => tx.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.name, NAME)))).length) return console.log('El torneo ya existe; no se hizo nada.');

    await r.withPlatform((tx) => setClubFeature(tx, { userId: null }, clubId, 'tournaments', true));

    let phone = 0;
    const player = (last: string) => t((tx) => createPlayer(tx, { clubId, country: club.country }, {
      firstName: 'Nombre', lastName: last, gender: FEMALE.has(last) ? 'female' : 'male', category: 7, slots: ['noche'], phone: `29149${String(10000 + ++phone)}`,
    }, { textVersion: 'seed-demo', locale: club.locale }));

    const id = await t((tx) => createTournament(tx, ctx, tournamentInputSchema.parse({
      name: NAME, modality: 'libre', ruleKind: 'single', ruleValue: 7, isRanked: true, minPairs: 6,
      championPoints: 1000, participationPoints: 5, startsOn: FRI,
    })));
    await t((tx) => openRegistration(tx, ctx, id));

    const zoneEntries: string[][] = [];
    for (const z of ZONES) {
      const ids: string[] = [];
      for (const [a, b] of z.pairs) {
        const [p1, p2] = [await player(a), await player(b)];
        ids.push(await t((tx) => registerPair(tx, ctx, id, { player1Id: p1, player2Id: p2 })));
      }
      zoneEntries.push(ids);
    }
    await t((tx) => startTournamentWithZones(tx, ctx, id, zoneEntries));

    const states = await t((tx) => zoneStates(tx, ctx, id));
    let n = 0;
    for (const [zi, z] of states.entries()) {
      for (const [k, m] of z.matches.entries()) {
        const [date, time] = ZONES[zi].when[k];
        await t((tx) => setMatchSchedule(tx, ctx, m.id, localToUtc(date, time, club.timezone)));
        n++;
      }
    }
    console.log(`"${NAME}": ${ZONES.length * 3} parejas, ${states.length} zonas, ${n} partidos con horario. Sin resultados.`);
    console.log(`Torneo: /es/app/torneos/${id}\nTablero público: /es/c/bahia-padel/torneo/${id}`);
  } finally { await r.close(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
