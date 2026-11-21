import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clubs, players, rankingEvents, tournamentEntries, tournaments } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { setClubFeature } from '../src/server/services/features';
import { publicRanking, publicRankingBuckets, publicRankingClub } from '../src/server/services/public-ranking';
import { seedTwoClubs, setupDb } from './helpers';

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
const group = { ruleKind: 'single' as const, ruleValue: 6, modality: 'libre' as const };
let nameA: string;

async function giveEvent(clubId: string, first: string, last: string, points: number, endedOn: string, phone: string) {
  await t.withTenant(clubId, async (tx: Tx) => {
    const [p1] = await tx.insert(players).values({ clubId, firstName: first, lastName: last, gender: 'male', category: 6, phoneE164: phone, instagram: 'secreto', source: 'manual' }).returning({ id: players.id });
    const [p2] = await tx.insert(players).values({ clubId, firstName: 'Otro', lastName: 'Jugador', gender: 'male', category: 6, phoneE164: phone.replace("+54911500", "+54911600"), source: 'manual' }).returning({ id: players.id });
    const [tr] = await tx.insert(tournaments).values({ clubId, name: `T ${first}`, modality: 'libre', categoryRuleKind: 'single', categoryRuleValue: 6, isRanked: true, minPairs: 6, championPoints: 100, pointsTable: {}, startsOn: endedOn, status: 'cerrado' }).returning({ id: tournaments.id });
    const [e] = await tx.insert(tournamentEntries).values({ clubId, tournamentId: tr.id, player1Id: p1.id, player2Id: p2.id }).returning({ id: tournamentEntries.id });
    await tx.insert(rankingEvents).values({ clubId, playerId: p1.id, tournamentId: tr.id, entryId: e.id, points, tournamentEndedOn: endedOn, categoryRuleKind: 'single', categoryRuleValue: 6, modality: 'libre' });
  });
}

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  nameA = 'club-a';
  await giveEvent(s.a.id, 'Ana', 'Zárate', 100, '2026-11-01', '+5491150000001');
  await giveEvent(s.a.id, 'Beto', 'Pérez', 100, '2026-05-01', '+5491150000002');
  await giveEvent(s.a.id, 'Caro', 'Gómez', 40, '2026-11-02', '+5491150000003');
  await giveEvent(s.b.id, 'Dani', 'Ríos', 500, '2026-11-01', '+5491150000004');
});
afterAll(async () => { await t.client.close(); });

const flag = (clubId: string, on: boolean) => t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerA }, clubId, 'tournaments', on));
const rank = (slug: string, w: 'all' | 'month' = 'all', now = new Date('2026-11-10T00:00:00Z')) => t.withPlatform((tx) => publicRanking(tx, slug, group, w, now));

describe('ranking público', () => {
  it('con el flag apagado no devuelve nada (la página responde 404)', async () => {
    expect(await t.withPlatform((tx) => publicRankingClub(tx, nameA))).toBeNull();
    expect(await rank(nameA)).toEqual([]);
    expect(await t.withPlatform((tx) => publicRankingBuckets(tx, nameA))).toEqual([]);
  });

  it('con el flag activo muestra el club y su ranking, con empates en la misma posición', async () => {
    await flag(s.a.id, true);
    expect(await t.withPlatform((tx) => publicRankingClub(tx, nameA))).toMatchObject({ slug: 'club-a', name: 'Club club-a' });
    expect(await t.withPlatform((tx) => publicRankingBuckets(tx, nameA))).toEqual([group]);
    const rows = await rank(nameA);
    expect(rows.map((r) => [r.position, r.firstName, r.lastInitial, r.points])).toEqual([[1, 'Beto', 'P', 100], [1, 'Ana', 'Z', 100], [3, 'Caro', 'G', 40]]);
  });

  it('respeta la ventana móvil', async () => {
    const month = await rank(nameA, 'month');
    expect(month.map((r) => r.firstName)).toEqual(['Ana', 'Caro']);
  });

  it('no expone teléfono ni datos de contacto, ni el apellido completo', async () => {
    const rows = await rank(nameA);
    expect(Object.keys(rows[0]).sort()).toEqual(['category', 'firstName', 'lastInitial', 'points', 'position', 'tournaments']);
    const json = JSON.stringify(rows);
    for (const secret of ['+549115', 'secreto', 'Zárate', 'Pérez']) expect(json).not.toContain(secret);
  });

  it('el club B (flag apagado) no aparece, y el ranking de A no mezcla puntos de B', async () => {
    expect(await rank('club-b')).toEqual([]);
    expect((await rank(nameA)).map((r) => r.firstName)).not.toContain('Dani');
    await flag(s.b.id, true);
    expect((await rank('club-b')).map((r) => r.firstName)).toEqual(['Dani']);
    await flag(s.b.id, false);
  });

  it('un club suspendido no se muestra', async () => {
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, s.a.id)));
    expect(await t.withPlatform((tx) => publicRankingClub(tx, nameA))).toBeNull();
    expect(await rank(nameA)).toEqual([]);
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'active' }).where(eq(clubs.id, s.a.id)));
    expect((await rank(nameA)).length).toBe(3);
  });

  it('jugadores dados de baja salen del ranking y los slugs inválidos no consultan', async () => {
    await t.withPlatform((tx) => tx.update(players).set({ deletedAt: new Date() }).where(eq(players.firstName, 'Caro')));
    expect((await rank(nameA)).map((r) => r.firstName)).toEqual(['Beto', 'Ana']);
    expect(await rank("x'; drop table clubs;--")).toEqual([]);
    expect(await t.withPlatform((tx) => publicRankingClub(tx, 'A B'))).toBeNull();
  });

  it('el rol del club (app_user) también puede ejecutar las funciones, pero solo ve lo que ellas devuelven', async () => {
    const viaApp = await t.withTenant(s.b.id, (tx) => publicRanking(tx, nameA, group, 'all'));
    expect(viaApp.every((r) => !('phone' in r))).toBe(true);
    expect(viaApp.map((r) => r.firstName)).toEqual(['Beto', 'Ana']);
  });
});
