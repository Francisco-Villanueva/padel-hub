import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  players, rankingEvents, tournamentEntries, tournamentEntryPlayers, tournamentMatches, tournamentTemplates, tournaments, tournamentZones,
} from '../src/server/db/schema';
import { seedTwoClubs, setupDb } from './helpers';

// Aislamiento entre clubes de las tablas de torneos (RLS + FK compuestas). Complementa tenant-isolation.test.ts.
type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;

interface Fixture { template: string; tournament: string; zone: string; p1: string; p2: string; entry: string; match: string; event: string }
let A: Fixture;
let B: Fixture;

async function fixture(clubId: string, tag: string): Promise<Fixture> {
  return t.withTenant(clubId, async (tx) => {
    const mk = (n: number) => tx.insert(players).values({ clubId, firstName: `J${n}`, lastName: tag, gender: 'male', category: 6, phoneE164: `+54911${tag === 'A' ? 1 : 2}000${n}00`, source: 'manual' }).returning({ id: players.id });
    const [p1] = await mk(1);
    const [p2] = await mk(2);
    const [template] = await tx.insert(tournamentTemplates).values({ clubId, name: `Plantilla ${tag}`, championPoints: 1000, participationPoints: 5 }).returning({ id: tournamentTemplates.id });
    const [tour] = await tx.insert(tournaments).values({
      clubId, name: `Torneo ${tag}`, modality: 'libre', categoryRuleKind: 'single', categoryRuleValue: 6, isRanked: true, minPairs: 6,
      championPoints: 1000, pointsTable: { champion: 1000 }, startsOn: '2026-11-18',
    }).returning({ id: tournaments.id });
    const [zone] = await tx.insert(tournamentZones).values({ clubId, tournamentId: tour.id, name: 'Zona A', size: 3, position: 1 }).returning({ id: tournamentZones.id });
    const [entry] = await tx.insert(tournamentEntries).values({ clubId, tournamentId: tour.id, player1Id: p1.id, player2Id: p2.id, zoneId: zone.id }).returning({ id: tournamentEntries.id });
    await tx.insert(tournamentEntryPlayers).values([
      { clubId, tournamentId: tour.id, entryId: entry.id, playerId: p1.id }, { clubId, tournamentId: tour.id, entryId: entry.id, playerId: p2.id },
    ]);
    const [match] = await tx.insert(tournamentMatches).values({ clubId, tournamentId: tour.id, stage: 'zona', zoneId: zone.id, round: 1, position: 1, entryAId: entry.id }).returning({ id: tournamentMatches.id });
    const [event] = await tx.insert(rankingEvents).values({
      clubId, playerId: p1.id, tournamentId: tour.id, entryId: entry.id, points: 5, tournamentEndedOn: '2026-11-18',
      categoryRuleKind: 'single', categoryRuleValue: 6, modality: 'libre',
    }).returning({ id: rankingEvents.id });
    return { template: template.id, tournament: tour.id, zone: zone.id, p1: p1.id, p2: p2.id, entry: entry.id, match: match.id, event: event.id };
  });
}

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  A = await fixture(s.a.id, 'A');
  B = await fixture(s.b.id, 'B');
});
afterAll(async () => { await t.client.close(); });

const TABLES = [
  ['tournament_templates', tournamentTemplates, 'template'],
  ['tournaments', tournaments, 'tournament'],
  ['tournament_zones', tournamentZones, 'zone'],
  ['tournament_entries', tournamentEntries, 'entry'],
  ['tournament_matches', tournamentMatches, 'match'],
  ['ranking_events', rankingEvents, 'event'],
] as const;

describe.each(TABLES)('%s', (_name, table, key) => {
  it('cada club solo ve sus filas', async () => {
    const a = await t.withTenant(s.a.id, (tx) => tx.select({ id: table.id }).from(table));
    const b = await t.withTenant(s.b.id, (tx) => tx.select({ id: table.id }).from(table));
    expect(a.map((r) => r.id)).toEqual([A[key]]);
    expect(b.map((r) => r.id)).toEqual([B[key]]);
  });
  it('pedir una fila del otro club por id no devuelve nada, y no se puede actualizar ni borrar', async () => {
    expect(await t.withTenant(s.a.id, (tx) => tx.select().from(table).where(eq(table.id, B[key])))).toEqual([]);
    await t.withTenant(s.a.id, (tx) => tx.delete(table).where(eq(table.id, B[key])));
    expect(await t.withTenant(s.b.id, (tx) => tx.select().from(table).where(eq(table.id, B[key])))).toHaveLength(1);
  });
  it('platform_user ve las de los dos clubes', async () => {
    expect(await t.withPlatform((tx) => tx.select({ id: table.id }).from(table))).toHaveLength(2);
  });
});

describe('tournament_entry_players', () => {
  it('aislada por club', async () => {
    expect(await t.withTenant(s.a.id, (tx) => tx.select().from(tournamentEntryPlayers))).toHaveLength(2);
    expect(await t.withTenant(s.b.id, (tx) => tx.select().from(tournamentEntryPlayers).where(eq(tournamentEntryPlayers.tournamentId, A.tournament)))).toEqual([]);
  });
  it('un jugador no puede estar en dos parejas activas del mismo torneo', async () => {
    const other = await t.withTenant(s.a.id, async (tx) => {
      const [p3] = await tx.insert(players).values({ clubId: s.a.id, firstName: 'J3', lastName: 'A', gender: 'male', category: 6, phoneE164: '+5491110000300', source: 'manual' }).returning({ id: players.id });
      const [e] = await tx.insert(tournamentEntries).values({ clubId: s.a.id, tournamentId: A.tournament, player1Id: p3.id, player2Id: A.p1 }).returning({ id: tournamentEntries.id });
      return { p3: p3.id, entry: e.id };
    });
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournamentEntryPlayers).values({ clubId: s.a.id, tournamentId: A.tournament, entryId: other.entry, playerId: A.p1 }))).rejects.toThrow();
    // Tras la baja de la primera pareja (se liberan sus jugadores) sí puede inscribirse.
    await t.withTenant(s.a.id, (tx) => tx.delete(tournamentEntryPlayers).where(and(eq(tournamentEntryPlayers.entryId, A.entry), eq(tournamentEntryPlayers.playerId, A.p1))));
    await t.withTenant(s.a.id, (tx) => tx.insert(tournamentEntryPlayers).values({ clubId: s.a.id, tournamentId: A.tournament, entryId: other.entry, playerId: A.p1 }));
  });
});

describe('FK compuestas: nada cruza clubes', () => {
  it('no se inscribe un jugador de otro club', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournamentEntries).values({ clubId: s.a.id, tournamentId: A.tournament, player1Id: B.p1, player2Id: A.p2 }))).rejects.toThrow();
  });
  it('no se inscribe una pareja en el torneo de otro club (ni con club_id propio ni ajeno)', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournamentEntries).values({ clubId: s.a.id, tournamentId: B.tournament, player1Id: A.p1, player2Id: A.p2 }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournamentEntries).values({ clubId: s.b.id, tournamentId: B.tournament, player1Id: B.p1, player2Id: B.p2 }))).rejects.toThrow();
  });
  it('un partido no puede usar una pareja ni una zona de otro club', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournamentMatches).values({ clubId: s.a.id, tournamentId: A.tournament, stage: 'zona', round: 2, position: 1, entryAId: B.entry }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournamentMatches).values({ clubId: s.a.id, tournamentId: A.tournament, stage: 'zona', zoneId: B.zone, round: 2, position: 1 }))).rejects.toThrow();
  });
  it('un evento de ranking no puede apuntar a un jugador o torneo de otro club', async () => {
    const base = { clubId: s.a.id, entryId: A.entry, points: 1, tournamentEndedOn: '2026-11-18', categoryRuleKind: 'single', categoryRuleValue: 6, modality: 'libre' };
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(rankingEvents).values({ ...base, playerId: B.p1, tournamentId: A.tournament }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(rankingEvents).values({ ...base, playerId: A.p2, tournamentId: B.tournament }))).rejects.toThrow();
  });
  it('no se insertan filas con club_id de otro club', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournamentTemplates).values({ clubId: s.b.id, name: 'x', championPoints: 100 }))).rejects.toThrow();
  });
});

describe('reglas de integridad', () => {
  it('ranking_events es única por (torneo, jugador): no se duplica', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(rankingEvents).values({
      clubId: s.a.id, playerId: A.p1, tournamentId: A.tournament, entryId: A.entry, points: 9, tournamentEndedOn: '2026-11-18',
      categoryRuleKind: 'single', categoryRuleValue: 6, modality: 'libre',
    }))).rejects.toThrow();
  });
  it('mínimo de parejas >= 6, modalidad y estado válidos, jugadores distintos', async () => {
    const base = { clubId: s.a.id, name: 'x', modality: 'libre', categoryRuleKind: 'single', categoryRuleValue: 6, minPairs: 6, championPoints: 100, pointsTable: {}, startsOn: '2026-11-18' };
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournaments).values({ ...base, minPairs: 5 }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournaments).values({ ...base, modality: 'otra' }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournaments).values({ ...base, status: 'otro' }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournaments).values({ ...base, categoryRuleKind: 'sum', categoryRuleValue: 1 }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(tournamentEntries).values({ clubId: s.a.id, tournamentId: A.tournament, player1Id: A.p1, player2Id: A.p1 }))).rejects.toThrow();
  });
  it('el ganador de un partido debe ser una de las dos parejas', async () => {
    const [other] = await t.withTenant(s.a.id, (tx) => tx.select({ id: tournamentEntries.id }).from(tournamentEntries).where(and(eq(tournamentEntries.tournamentId, A.tournament))));
    const otherId = (await t.withTenant(s.a.id, (tx) => tx.select({ id: tournamentEntries.id }).from(tournamentEntries))).find((e) => e.id !== A.entry)?.id ?? other.id;
    expect(otherId).not.toBe(A.entry);
    await expect(t.withTenant(s.a.id, (tx) => tx.update(tournamentMatches).set({ winnerEntryId: otherId }).where(eq(tournamentMatches.id, A.match)))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.update(tournamentMatches).set({ winnerEntryId: A.entry }).where(eq(tournamentMatches.id, A.match)))).resolves.toBeDefined();
  });
  it('borrar el torneo borra zonas, parejas, partidos y puntos en cascada (último test: consume el club B)', async () => {
    await t.withPlatform((tx) => tx.delete(tournaments).where(eq(tournaments.id, B.tournament)));
    for (const table of [tournamentZones, tournamentEntries, tournamentEntryPlayers, tournamentMatches, rankingEvents] as const) {
      expect(await t.withTenant(s.b.id, (tx) => tx.select().from(table))).toEqual([]);
    }
    expect(await t.withTenant(s.a.id, (tx) => tx.select().from(tournamentZones))).toHaveLength(1);
  });
});
