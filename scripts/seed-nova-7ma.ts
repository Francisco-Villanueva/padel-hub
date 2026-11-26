// Carga el torneo "7ma libre" del Circuito Nova, fecha 9 (27, 28 y 29 de noviembre de 2026), tal como lo publicó la
// organización: 11 zonas de 3 parejas con sus horarios y los cruces de la llave (16vos a la final) con los suyos.
// Solo se conocen los apellidos (y algunas iniciales): sin inicial, el nombre queda como "Nombre"; sin teléfono.
// Todo va en una sola transacción: si algo falla no queda nada a medias. Si el torneo ya existe, no hace nada.
//   npx tsx --conditions=react-server scripts/seed-nova-7ma.ts
// Corre sobre la base de .env.local (dev) e imprime el host antes de actuar.
import { and, asc, eq } from 'drizzle-orm';
import { tournamentInputSchema } from '../src/lib/tournament-schema';
import { localToUtc } from '../src/lib/tz';
import { clubs, tournamentMatches, tournaments } from '../src/server/db/schema';
import { setBracketSources } from '../src/server/services/tournament-bracket';
import { createPlayerWithoutPhone } from '../src/server/services/players';
import { PLACEHOLDER_FIRST_NAME, registerPair } from '../src/server/services/tournament-entries';
import { setMatchSchedule } from '../src/server/services/tournament-matches';
import { createTournament, openRegistration, startTournamentWithZones, zoneStates } from '../src/server/services/tournaments';
import { runners } from './_db';

const NAME = '7ma libre · Circuito Nova, fecha 9';
const DAYS = { V: '2026-11-27', S: '2026-11-28', D: '2026-11-29' } as const;

/** "V20" = viernes 20:00, "S13" = sábado 13:00, "D09" = domingo 09:00. */
type When = `${keyof typeof DAYS}${string}`;
/** Jugador: apellido, o [apellido, inicial] cuando la planilla trae la inicial del nombre. */
type P = string | [string, string];

// Por zona: las tres parejas en el orden de la planilla y los horarios de 1 vs 2, 1 vs 3 y 2 vs 3.
const ZONES: { pairs: [P, P][]; when: [When, When, When] }[] = [
  { pairs: [['Igartua', 'Castro'], ['Torres', 'Cola'], ['Capparuccini', 'Santucho']], when: ['V20', 'S12', 'S14'] }, // A
  { pairs: [['Sosa', 'Jimenez'], ['Bergaz', 'Vidal'], ['Rashid', 'Fernández']], when: ['V22', 'S14', 'S17'] }, // B
  { pairs: [['Navarrete', 'Trombetta'], ['Renzi', 'Navarro'], ['Vera', 'Herrero']], when: ['S13', 'S15', 'V20'] }, // C
  { pairs: [['Centeno', 'Herlein'], ['Liebana', 'Ponce'], ['Cornou', 'Izarriaga']], when: ['V23', 'V20', 'V18'] }, // D
  { pairs: [['Cabrera', 'Charbonnier'], ['Martini', 'Denari'], ['Teves', 'Iannito']], when: ['V23', 'V19', 'V21'] }, // E
  { pairs: [['Magyar', 'Monárdez'], ['Centeno', 'Uriarte'], ['Reschini', 'De Charras']], when: ['V21', 'V17', 'V19'] }, // F
  { pairs: [['Weber', 'Cardoso'], ['Rigo', 'Puentes'], ['Deluster', 'Magliolo']], when: ['V19', 'S14', 'V17'] }, // G
  { pairs: [['De La Vega', 'Dekak'], ['Alonqueo', 'Gutierrez'], ['Calvo', 'Rubio']], when: ['V18', 'V22', 'S15'] }, // H
  { pairs: [[['Boisselier', 'C'], ['Boisselier', 'F']], [['Arrechea', 'F'], ['Arrechea', 'T']], ['De Battista', 'Braganza']], when: ['V21', 'S12', 'V23'] }, // I
  { pairs: [['Nicosiano', 'Villanueva'], [['Pérez', 'M'], ['Pérez', 'M']], [['Velázquez', 'F'], ['Velázquez', 'H']]], when: ['S15', 'S13', 'V22'] }, // J
  { pairs: [['Ramírez', 'Lomáscolo'], ['Walter', 'Montenegro'], ['Ilacqua', 'Gatti']], when: ['S13', 'V21', 'V17'] }, // K
];

// Cruces de 16vos de arriba hacia abajo ("zona:puesto", 1 = A). Un solo lado = libre, pasa directo a octavos.
const slot = (zone: string, place: 1 | 2) => `${zone.charCodeAt(0) - 64}:${place}`;
const bye = (a: string) => ({ a, b: null });
const vs = (a: string, b: string) => ({ a, b });
const R32: { cross: { a: string; b: string | null }; when?: When }[] = [
  { cross: bye(slot('A', 1)) }, { cross: vs(slot('F', 2), slot('G', 2)), when: 'S17' },
  { cross: bye(slot('I', 1)) }, { cross: bye(slot('H', 1)) },
  { cross: bye(slot('E', 1)) }, { cross: vs(slot('B', 2), slot('K', 2)), when: 'S19' },
  { cross: vs(slot('J', 2), slot('C', 2)), when: 'S18' }, { cross: bye(slot('D', 1)) },
  { cross: bye(slot('C', 1)) }, { cross: vs(slot('D', 2), slot('I', 2)), when: 'S17' },
  { cross: vs(slot('K', 1), slot('A', 2)), when: 'S18' }, { cross: bye(slot('F', 1)) },
  { cross: bye(slot('G', 1)) }, { cross: bye(slot('J', 1)) },
  { cross: vs(slot('H', 2), slot('E', 2)), when: 'S18' }, { cross: bye(slot('B', 1)) },
];
// Octavos (sábado), cuartos, semifinales y final (domingo), de arriba hacia abajo.
const LATER: Record<number, When[]> = {
  2: ['S20', 'S20', 'S22', 'S21', 'S21', 'S21', 'S20', 'S22'],
  3: ['D10', 'D09', 'D09', 'D09'],
  4: ['D13', 'D13'],
  5: ['D15'],
};

async function main() {
  const r = runners();
  try {
    const [club] = await r.withPlatform((tx) => tx.select({ id: clubs.id, timezone: clubs.timezone, locale: clubs.locale }).from(clubs).where(eq(clubs.slug, 'nova-padel-center')));
    if (!club) throw new Error('No existe el club nova-padel-center en esta base.');
    const clubId = club.id, ctx = { clubId };
    const at = (w: When) => {
      const d = localToUtc(DAYS[w[0] as keyof typeof DAYS], `${w.slice(1)}:00`, club.timezone);
      if (!d) throw new Error(`horario inválido: ${w}`);
      return d;
    };

    const out = await r.withTenant(clubId, async (tx) => {
      if ((await tx.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.name, NAME))).length) return null;
      const id = await createTournament(tx, ctx, tournamentInputSchema.parse({
        name: NAME, modality: 'libre', ruleKind: 'single', ruleValue: 7, isRanked: true, minPairs: 6, championPoints: 100, participationPoints: 5, startsOn: DAYS.V,
      }));
      await openRegistration(tx, ctx, id);

      const player = (p: P) => {
        const [lastName, initial] = Array.isArray(p) ? p : [p, undefined];
        return createPlayerWithoutPhone(tx, ctx, { firstName: initial ?? PLACEHOLDER_FIRST_NAME, lastName, gender: 'male', category: 7 }, { textVersion: 'club-attested-v1', locale: club.locale, source: 'manual' });
      };
      const zones: string[][] = [];
      for (const [i, z] of ZONES.entries()) {
        const ids: string[] = [];
        for (const [a, b] of z.pairs) {
          const p1 = await player(a), p2 = await player(b);
          ids.push(await registerPair(tx, ctx, id, { player1Id: p1, player2Id: p2 }));
        }
        zones.push(ids);
        console.log(`  zona ${String.fromCharCode(65 + i)} inscripta`);
      }
      await startTournamentWithZones(tx, ctx, id, zones);

      let scheduled = 0;
      for (const [zi, z] of (await zoneStates(tx, ctx, id)).entries()) {
        // Los partidos de una zona de 3 salen en orden 1v2, 1v3, 2v3: el mismo de la planilla (se verifica contra las parejas).
        const expected = [[0, 1], [0, 2], [1, 2]];
        for (const [k, m] of z.matches.entries()) {
          if (m.entryAId !== zones[zi][expected[k][0]] || m.entryBId !== zones[zi][expected[k][1]]) throw new Error(`orden inesperado en la zona ${zi + 1}`);
          await setMatchSchedule(tx, ctx, m.id, at(ZONES[zi].when[k]));
          scheduled++;
        }
      }
      console.log(`  ${scheduled} partidos de zona con horario`);

      await setBracketSources(tx, ctx, id, R32.map((x) => x.cross));
      const llave = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, id), eq(tournamentMatches.stage, 'llave')))
        .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.position));
      let cross = 0;
      for (const m of llave) {
        const when = m.round === 1 ? R32[m.position].when : LATER[m.round][m.position];
        if (m.status === 'bye') continue;
        if (!when) throw new Error(`falta el horario del cruce ${m.round}:${m.position}`);
        await setMatchSchedule(tx, ctx, m.id, at(when));
        cross++;
      }
      console.log(`  ${cross} cruces de llave con horario`);
      return id;
    });

    console.log(out ? `"${NAME}" cargado.\nTorneo: /es/app/torneos/${out}\nTablero público: /es/c/nova-padel-center/torneo/${out}` : 'El torneo ya existe; no se hizo nada.');
  } finally { await r.close(); }
}
main().catch((e) => { console.error(e.message, e.code ?? ''); process.exit(1); });
