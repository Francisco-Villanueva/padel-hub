import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tournamentInputSchema } from '../src/lib/tournament-schema';
import { clubs, players } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { setClubFeature } from '../src/server/services/features';
import { publicTournamentDraw } from '../src/server/services/public-board';
import { registerPair } from '../src/server/services/tournament-entries';
import { recordResult, resolveTie } from '../src/server/services/tournament-matches';
import { createTournament, openRegistration, startTournamentWithZones, zoneStates } from '../src/server/services/tournaments';
import { seedTwoClubs, setupDb } from './helpers';

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
let ca: { clubId: string; userId: string };
let phoneN = 0;
const A = <T>(fn: (tx: Tx) => Promise<T>) => t.withTenant(s.a.id, fn);
const draw = (id: string, slug = 'club-a') => t.withPlatform((tx) => publicTournamentDraw(tx, slug, id));
const flag = (on: boolean) => t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerA }, s.a.id, 'tournaments', on));
const EMPTY = { zones: [], bracket: [] };

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  ca = { clubId: s.a.id, userId: s.ownerA };
  await flag(true);
});
afterAll(async () => { await t.client.close(); });

const input = () => tournamentInputSchema.parse({ name: '7ma libre', modality: 'libre', ruleKind: 'single', ruleValue: 7, isRanked: true, minPairs: 6, championPoints: 1000, participationPoints: 5, startsOn: '2026-11-20' });

/** n parejas (apellidos Pn-a / Pn-b) inscriptas; devuelve los ids de pareja. */
async function entries(n: number) {
  const id = await A((tx) => createTournament(tx, ca, input()));
  await A((tx) => openRegistration(tx, ca, id));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const mk = async (last: string) => (await A((tx) => tx.insert(players).values({ clubId: s.a.id, firstName: 'Secreto', lastName: last, gender: 'male', category: 7, phoneE164: `+5491161${String(++phoneN).padStart(6, '0')}`, source: 'manual' }).returning({ id: players.id })))[0].id;
    const p1 = await mk(`P${i + 1}a`), p2 = await mk(`P${i + 1}b`);
    ids.push(await A((tx) => registerPair(tx, ca, id, { player1Id: p1, player2Id: p2 })));
  }
  return { id, ids };
}

describe('zonas y cruces públicos', () => {
  it('muestra las mismas posiciones que el panel, los partidos y el cuadro con sus libres', async () => {
    const { id, ids } = await entries(9);
    await A((tx) => startTournamentWithZones(tx, ca, id, [ids.slice(0, 3), ids.slice(3, 6), ids.slice(6, 9)]));
    const [za] = await A((tx) => zoneStates(tx, ca, id));
    for (const m of za.matches) await A((tx) => recordResult(tx, ca, m.id, [[6, 2], [6, 3]]));
    const panel = await A((tx) => zoneStates(tx, ca, id));
    const pub = await draw(id);

    expect(pub.zones.map((z) => [z.name, z.complete, z.drawn, z.matches.length])).toEqual([['Zona A', true, false, 3], ['Zona B', false, false, 3], ['Zona C', false, false, 3]]);
    expect(pub.zones[0].standings.map((r) => [r.name, r.position, r.played, r.wins, r.gameDiff, r.qualified])).toEqual([
      ['P1a / P1b', 1, 2, 2, 14, true], ['P2a / P2b', 2, 2, 1, 0, true], ['P3a / P3b', 3, 2, 0, -14, false],
    ]);
    // El mismo orden que ve el club, también en las zonas sin resultados.
    const surnames = (ids2: string[]) => ids2.map((e) => `P${ids.indexOf(e) + 1}a / P${ids.indexOf(e) + 1}b`);
    expect(pub.zones.map((z) => z.standings.map((r) => r.name))).toEqual(panel.map((z) => surnames(z.standings.rows.map((r) => r.entryId))));
    expect(pub.zones[0].matches[0]).toMatchObject({ round: 1, status: 'jugado', winner: 'a', nameA: 'P1a / P1b', sets: [[6, 2], [6, 3]] });

    // 3 zonas de 3 = 6 clasificados en un cuadro de 8: 2 libres en la primera ronda.
    const first = pub.bracket.filter((m) => m.round === 1);
    expect(pub.bracket).toHaveLength(7);
    expect(first.filter((m) => m.status === 'bye')).toHaveLength(2);
    // Los clasificados de la zona terminada ya están; los demás lugares dicen de qué zona y puesto salen.
    const names = first.flatMap((m) => [m.nameA, m.nameB]).filter(Boolean).sort();
    expect(names).toEqual(['P1a / P1b', 'P2a / P2b']);
    expect(first.flatMap((m) => [m.srcA, m.srcB]).filter(Boolean).map((x) => `${x!.position}${x!.zone.slice(-1)}`).sort()).toEqual(['1B', '1C', '2B', '2C']);
    expect(new Set(pub.bracket.map((m) => m.id)).size).toBe(7);

    // Ni nombres de pila, ni teléfonos, ni ids de la base.
    const json = JSON.stringify(pub);
    expect(json).not.toContain('Secreto');
    expect(json).not.toContain('+549116');
    for (const entry of ids) expect(json).not.toContain(entry);
  });

  it('respeta el sorteo de desempate de una zona', async () => {
    const { id, ids } = await entries(6);
    await A((tx) => startTournamentWithZones(tx, ca, id, [ids.slice(0, 3), ids.slice(3, 6)]));
    const [za] = await A((tx) => zoneStates(tx, ca, id));
    // Triple empate: cada una gana un partido por el mismo marcador (1v2 gana 1, 1v3 gana 3, 2v3 gana 2).
    const [m12, m13, m23] = za.matches;
    await A((tx) => recordResult(tx, ca, m12.id, [[6, 2], [6, 2]]));
    await A((tx) => recordResult(tx, ca, m13.id, [[2, 6], [2, 6]]));
    await A((tx) => recordResult(tx, ca, m23.id, [[6, 2], [6, 2]]));
    expect((await draw(id)).zones[0].standings.map((r) => r.position)).toEqual([null, null, null]);

    await A((tx) => resolveTie(tx, ca, za.zone.id, { seed: 7 }));
    const panel = (await A((tx) => zoneStates(tx, ca, id)))[0];
    const zone = (await draw(id)).zones[0];
    expect(zone.drawn).toBe(true);
    expect(zone.standings.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(zone.standings.map((r) => r.name)).toEqual(panel.standings.rows.map((r) => `P${ids.indexOf(r.entryId) + 1}a / P${ids.indexOf(r.entryId) + 1}b`));
  });

  it('no devuelve nada sin publicar, sin la función, con el club suspendido o con otro club', async () => {
    const pending = await entries(6);
    expect(await draw(pending.id)).toEqual(EMPTY);

    await A((tx) => startTournamentWithZones(tx, ca, pending.id, [pending.ids.slice(0, 3), pending.ids.slice(3, 6)]));
    expect((await draw(pending.id)).zones).toHaveLength(2);
    await flag(false);
    expect(await draw(pending.id)).toEqual(EMPTY);
    await flag(true);
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, s.a.id)));
    expect(await draw(pending.id)).toEqual(EMPTY);
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'active' }).where(eq(clubs.id, s.a.id)));
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', true));
    expect(await draw(pending.id, 'club-b')).toEqual(EMPTY);
    expect(await draw('no-es-uuid')).toEqual(EMPTY);
  });
});
