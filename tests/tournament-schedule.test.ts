import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localToUtc, utcToLocalInputs } from '../src/lib/tz';
import { tournamentInputSchema } from '../src/lib/tournament-schema';
import { clubs, players, tournamentMatches } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { setClubFeature } from '../src/server/services/features';
import { publicTournamentBoard, publicTournamentInfo } from '../src/server/services/public-board';
import { registerPair } from '../src/server/services/tournament-entries';
import { clearResult, recordResult, setMatchLive, setMatchSchedule } from '../src/server/services/tournament-matches';
import { panelBoardMatches, tournamentView } from '../src/server/services/tournament-view';
import { cancelTournament, createTournament, openRegistration, startTournamentWithZones, zoneStates } from '../src/server/services/tournaments';
import { seedTwoClubs, setupDb } from './helpers';

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
let ca: { clubId: string; userId: string };
let phoneN = 0;
const A = <T>(fn: (tx: Tx) => Promise<T>) => t.withTenant(s.a.id, fn);
const TZ = 'America/Argentina/Buenos_Aires';

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  ca = { clubId: s.a.id, userId: s.ownerA };
  await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerA }, s.a.id, 'tournaments', true));
});
afterAll(async () => { await t.client.close(); });

async function mkPlayer(last: string) {
  const [p] = await A((tx) => tx.insert(players).values({ clubId: s.a.id, firstName: 'Nombre', lastName: last, gender: 'male', category: 7, phoneE164: `+5491160${String(++phoneN).padStart(6, '0')}`, source: 'manual' }).returning({ id: players.id }));
  return p.id;
}
const input = () => tournamentInputSchema.parse({ name: '7ma libre', modality: 'libre', ruleKind: 'single', ruleValue: 7, isRanked: true, minPairs: 6, championPoints: 1000, participationPoints: 5, startsOn: '2026-11-20' });

/** n parejas (apellidos Pn-a / Pn-b) inscriptas; devuelve los ids de pareja. */
async function entries(n: number) {
  const id = await A((tx) => createTournament(tx, ca, input()));
  await A((tx) => openRegistration(tx, ca, id));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = await mkPlayer(`P${i + 1}a`), p2 = await mkPlayer(`P${i + 1}b`);
    ids.push(await A((tx) => registerPair(tx, ca, id, { player1Id: p1, player2Id: p2 })));
  }
  return { id, ids };
}

describe('zona horaria', () => {
  it('día y hora locales ↔ UTC', () => {
    expect(localToUtc('2026-11-20', '20:00', TZ)?.toISOString()).toBe('2026-11-20T23:00:00.000Z');
    expect(localToUtc('2026-11-21', '00:30', TZ)?.toISOString()).toBe('2026-11-21T03:30:00.000Z');
    expect(utcToLocalInputs(new Date('2026-11-20T23:00:00Z'), TZ)).toEqual({ date: '2026-11-20', time: '20:00' });
    expect(utcToLocalInputs(new Date('2026-11-21T02:30:00Z'), TZ)).toEqual({ date: '2026-11-20', time: '23:30' });
    expect(localToUtc('2026-02-31', '10:00', TZ)).toBeNull();
    expect(localToUtc('2026-11-20', '25:00', TZ)).toBeNull();
    expect(localToUtc('hoy', '10:00', TZ)).toBeNull();
  });
});

describe('zonas definidas por el club', () => {
  it('respeta las zonas y el orden publicado; los partidos salen 1v2, 1v3, 2v3', async () => {
    const { id, ids } = await entries(6);
    const zones = [[ids[0], ids[1], ids[2]], [ids[3], ids[4], ids[5]]];
    await A((tx) => startTournamentWithZones(tx, ca, id, zones));
    const states = await A((tx) => zoneStates(tx, ca, id));
    expect(states.map((z) => z.zone.name)).toEqual(['Zona A', 'Zona B']);
    expect(states.map((z) => z.entryIds.sort())).toEqual(zones.map((z) => [...z].sort()));
    const first = states[0].matches.map((m) => [m.entryAId, m.entryBId]);
    expect(first).toEqual([[ids[0], ids[1]], [ids[0], ids[2]], [ids[1], ids[2]]]);
  });

  it('rechaza zonas que no cubren a todas las parejas, repetidas, de otro tamaño o con parejas ajenas', async () => {
    const { id, ids } = await entries(6);
    const bad = (zones: string[][]) => expect(A((tx) => startTournamentWithZones(tx, ca, id, zones))).rejects.toMatchObject({ code: 'zones_invalid' });
    await bad([[ids[0], ids[1], ids[2]], [ids[3], ids[4]]]);                          // falta una pareja
    await bad([[ids[0], ids[1], ids[2]], [ids[3], ids[4], ids[4]]]);                  // repetida
    await bad([[ids[0], ids[1]], [ids[2], ids[3]], [ids[4], ids[5]]]);                // zonas de 2
    await bad([[ids[0], ids[1], ids[2]], [ids[3], ids[4], '00000000-0000-4000-8000-000000000000']]);
    expect((await A((tx) => zoneStates(tx, ca, id)))).toHaveLength(0);                // no quedó nada a medias
  });

  it('exige el mínimo de parejas', async () => {
    const id = await A((tx) => createTournament(tx, ca, input()));
    await A((tx) => openRegistration(tx, ca, id));
    await expect(A((tx) => startTournamentWithZones(tx, ca, id, []))).rejects.toMatchObject({ code: 'below_min' });
  });
});

describe('horarios y partidos en juego', () => {
  it('programa, cambia y quita el horario; marca en juego; el resultado lo cierra', async () => {
    const { id, ids } = await entries(6);
    await A((tx) => startTournamentWithZones(tx, ca, id, [[ids[0], ids[1], ids[2]], [ids[3], ids[4], ids[5]]]));
    const [m1, m2] = (await A((tx) => zoneStates(tx, ca, id)))[0].matches;
    const at = localToUtc('2026-11-20', '20:00', TZ)!;
    await A((tx) => setMatchSchedule(tx, ca, m1.id, at));
    expect((await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m1.id))))[0].scheduledAt?.toISOString()).toBe(at.toISOString());
    await A((tx) => setMatchSchedule(tx, ca, m1.id, null));
    expect((await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m1.id))))[0].scheduledAt).toBeNull();
    await expect(A((tx) => setMatchSchedule(tx, ca, m1.id, new Date('x')))).rejects.toMatchObject({ code: 'schedule_invalid' });

    await A((tx) => setMatchLive(tx, ca, m1.id, true));
    expect((await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m1.id))))[0].status).toBe('en_juego');
    await A((tx) => setMatchLive(tx, ca, m1.id, false));
    await A((tx) => setMatchLive(tx, ca, m1.id, true));
    await A((tx) => recordResult(tx, ca, m1.id, [[6, 3], [6, 4]]));
    const done = (await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m1.id))))[0];
    expect(done.status).toBe('jugado');
    await expect(A((tx) => setMatchLive(tx, ca, m1.id, true))).rejects.toMatchObject({ code: 'invalid_state' }); // ya jugado
    await A((tx) => clearResult(tx, ca, m1.id));
    expect((await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m1.id))))[0].status).toBe('pendiente');
    void m2;
  });

  it('no se programa ni se marca en juego fuera de zonas/llave, ni un partido sin rivales', async () => {
    const { id, ids } = await entries(8);
    await A((tx) => startTournamentWithZones(tx, ca, id, [[ids[0], ids[1], ids[2], ids[3]], [ids[4], ids[5], ids[6], ids[7]]]));
    const z = (await A((tx) => zoneStates(tx, ca, id)))[0];
    const r2 = z.matches.find((m) => m.round === 2)!; // 2ª ronda de zona de 4: rivales aún sin definir
    await expect(A((tx) => setMatchLive(tx, ca, r2.id, true))).rejects.toMatchObject({ code: 'invalid_state' });
    await A((tx) => setMatchSchedule(tx, ca, r2.id, localToUtc('2026-11-21', '15:00', TZ))); // pero sí se puede programar
    await A((tx) => cancelTournament(tx, ca, id));
    await expect(A((tx) => setMatchSchedule(tx, ca, r2.id, null))).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('un partido de otro club no se puede programar', async () => {
    const { id, ids } = await entries(6);
    await A((tx) => startTournamentWithZones(tx, ca, id, [[ids[0], ids[1], ids[2]], [ids[3], ids[4], ids[5]]]));
    const [m] = (await A((tx) => zoneStates(tx, ca, id)))[0].matches;
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', true));
    await expect(t.withTenant(s.b.id, (tx) => setMatchSchedule(tx, { clubId: s.b.id }, m.id, new Date()))).rejects.toMatchObject({ code: 'not_found' });
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', false));
  });
});

describe('tablero público', () => {
  it('muestra los partidos en orden, con en juego, resultado y solo apellidos', async () => {
    const { id, ids } = await entries(6);
    await A((tx) => startTournamentWithZones(tx, ca, id, [[ids[0], ids[1], ids[2]], [ids[3], ids[4], ids[5]]]));
    const states = await A((tx) => zoneStates(tx, ca, id));
    const [a1, a2, a3] = states[0].matches, [b1] = states[1].matches;
    await A((tx) => setMatchSchedule(tx, ca, a1.id, localToUtc('2026-11-20', '20:00', TZ)));
    await A((tx) => setMatchSchedule(tx, ca, a2.id, localToUtc('2026-11-20', '18:00', TZ)));
    await A((tx) => setMatchSchedule(tx, ca, b1.id, localToUtc('2026-11-21', '15:00', TZ)));
    await A((tx) => setMatchLive(tx, ca, a2.id, true));
    await A((tx) => recordResult(tx, ca, a1.id, [[6, 2], [6, 2]]));

    const flag = (on: boolean) => t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerA }, s.a.id, 'tournaments', on));
    const board = () => t.withPlatform((tx) => publicTournamentBoard(tx, 'club-a', id));
    const rows = await board();
    expect(rows).toHaveLength(6 + 3); // 6 de zona + 3 de la llave (4 clasificados: 2 semifinales y la final)
    // Primero los que tienen horario (cronológico), después los que no.
    expect(rows.slice(0, 3).map((r) => r.scheduledAt?.toISOString())).toEqual(['2026-11-20T21:00:00.000Z', '2026-11-20T23:00:00.000Z', '2026-11-21T18:00:00.000Z']);
    expect(rows[0]).toMatchObject({ stage: 'zona', zoneName: 'Zona A', status: 'en_juego', nameA: 'P1a / P1b', nameB: 'P3a / P3b', winner: null });
    expect(rows[1]).toMatchObject({ status: 'jugado', winner: 'a', sets: [[6, 2], [6, 2]] });
    expect(rows[5].scheduledAt).toBeNull();
    expect(a3.id).toBeTruthy();
    // Los lugares de la llave todavía sin definir dicen de qué zona y puesto salen ("1º Zona A").
    const bracket = rows.filter((r) => r.stage === 'llave' && r.round === 1);
    expect(bracket.map((r) => [r.nameA, r.nameB])).toEqual([[null, null], [null, null]]);
    expect(bracket.flatMap((r) => [r.srcA, r.srcB]).map((x) => `${x!.position}${x!.zone.slice(-1)}`).sort()).toEqual(['1A', '1B', '2A', '2B']);
    expect(rows.find((r) => r.stage === 'llave' && r.round === 2)).toMatchObject({ srcA: null, srcB: null });
    expect(JSON.stringify(rows)).not.toContain('Nombre');
    expect(JSON.stringify(rows)).not.toContain('+549116');
    expect(await t.withPlatform((tx) => publicTournamentInfo(tx, 'club-a', id))).toMatchObject({ name: '7ma libre', status: 'zonas', timezone: TZ });

    // Flag apagado, club suspendido, otro slug o id inválido: nada.
    await flag(false);
    expect(await board()).toEqual([]);
    expect(await t.withPlatform((tx) => publicTournamentInfo(tx, 'club-a', id))).toBeNull();
    await flag(true);
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, s.a.id)));
    expect(await board()).toEqual([]);
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'active' }).where(eq(clubs.id, s.a.id)));
    expect((await board()).length).toBe(9);
    expect(await t.withPlatform((tx) => publicTournamentBoard(tx, 'club-b', id))).toEqual([]);
    expect(await t.withPlatform((tx) => publicTournamentBoard(tx, 'club-a', 'no-es-uuid'))).toEqual([]);
  });

  it('un torneo en borrador o inscripción no se publica', async () => {
    const { id } = await entries(6);
    expect(await t.withPlatform((tx) => publicTournamentInfo(tx, 'club-a', id))).toBeNull();
    expect(await t.withPlatform((tx) => publicTournamentBoard(tx, 'club-a', id))).toEqual([]);
  });
});

describe('tablero del club', () => {
  it('trae los mismos partidos y el mismo orden que el tablero público, con id y si están listos para jugar', async () => {
    const { id, ids } = await entries(8);
    await A((tx) => startTournamentWithZones(tx, ca, id, [[ids[0], ids[1], ids[2], ids[3]], [ids[4], ids[5], ids[6], ids[7]]]));
    const zs = await A((tx) => zoneStates(tx, ca, id));
    await A((tx) => setMatchSchedule(tx, ca, zs[1].matches[0].id, localToUtc('2026-11-20', '18:00', TZ)));
    await A((tx) => setMatchSchedule(tx, ca, zs[0].matches[0].id, localToUtc('2026-11-20', '20:00', TZ)));
    await A((tx) => setMatchLive(tx, ca, zs[1].matches[0].id, true));

    const view = (await A((tx) => tournamentView(tx, ca, id)))!;
    const panel = panelBoardMatches(view);
    const pub = await t.withPlatform((tx) => publicTournamentBoard(tx, 'club-a', id));
    expect(panel).toHaveLength(8 + 5); // 2 zonas de 4 = 4 partidos cada una + llave de 8 con 2 libres (5 partidos sin contar los libres)
    expect(panel.map((m) => [m.zoneName, m.round, m.position, m.status, m.nameA, m.nameB])).toEqual(pub.map((m) => [m.zoneName, m.round, m.position, m.status, m.nameA, m.nameB]));
    expect(panel[0]).toMatchObject({ zoneName: 'Zona B', status: 'en_juego', ready: true });
    expect(panel[0].id).toBe(zs[1].matches[0].id);
    // La 2ª ronda de una zona de 4 todavía no tiene rivales: no está lista.
    expect(panel.filter((m) => m.round === 2).every((m) => !m.ready && m.nameA === null)).toBe(true);
  });
});
