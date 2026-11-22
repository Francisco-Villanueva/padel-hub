import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tournamentInputSchema } from '../src/lib/tournament-schema';
import { players, tournamentEntries, tournamentEntryPlayers, tournamentMatches, tournaments } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { setClubFeature } from '../src/server/services/features';
import { replacePlayer, restoreSlot, setSlotEntry, swapSlots, swapZoneEntries } from '../src/server/services/tournament-adjust';
import { publicTournamentBoard } from '../src/server/services/public-board';
import { rebuildBracket } from '../src/server/services/tournament-bracket';
import { registerPair } from '../src/server/services/tournament-entries';
import { clearResult, recordResult } from '../src/server/services/tournament-matches';
import { closeTournament, createTournament, getTournament, openRegistration, startTournamentWithZones, zoneStates } from '../src/server/services/tournaments';
import { seedTwoClubs, setupDb } from './helpers';

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
let ca: { clubId: string; userId: string };
let phoneN = 0;
const A = <T>(fn: (tx: Tx) => Promise<T>) => t.withTenant(s.a.id, fn);

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  ca = { clubId: s.a.id, userId: s.ownerA };
  await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerA }, s.a.id, 'tournaments', true));
});
afterAll(async () => { await t.client.close(); });

async function mkPlayer(last: string) {
  const [p] = await A((tx) => tx.insert(players).values({ clubId: s.a.id, firstName: 'Nombre', lastName: last, gender: 'male', category: 7, phoneE164: `+5491170${String(++phoneN).padStart(6, '0')}`, source: 'manual' }).returning({ id: players.id }));
  return p.id;
}
const input = () => tournamentInputSchema.parse({ name: '7ma libre', modality: 'libre', ruleKind: 'single', ruleValue: 7, isRanked: true, minPairs: 6, championPoints: 1000, participationPoints: 5, startsOn: '2026-11-20' });

/** Torneo con `zones` zonas de 3 ya iniciado (pareja i = "Pi"). Devuelve los ids de pareja por zona. */
async function started(zones: number) {
  const id = await A((tx) => createTournament(tx, ca, input()));
  await A((tx) => openRegistration(tx, ca, id));
  const ids: string[] = [];
  for (let i = 0; i < zones * 3; i++) {
    const [p1, p2] = [await mkPlayer(`P${i + 1}a`), await mkPlayer(`P${i + 1}b`)];
    ids.push(await A((tx) => registerPair(tx, ca, id, { player1Id: p1, player2Id: p2 })));
  }
  const z = Array.from({ length: zones }, (_, k) => ids.slice(k * 3, k * 3 + 3));
  await A((tx) => startTournamentWithZones(tx, ca, id, z));
  return { id, ids, z };
}

const llave = (id: string) => A((tx) => tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, id), eq(tournamentMatches.stage, 'llave'))).orderBy(tournamentMatches.round, tournamentMatches.position));
const status = async (id: string) => (await A((tx) => getTournament(tx, ca, id)))!.status;
/** Juega todos los partidos de una zona: gana siempre la pareja A del cruce (1º, 2º y 3º quedan en el orden de la zona). */
async function playZone(id: string, zoneIndex: number) {
  const z = (await A((tx) => zoneStates(tx, ca, id)))[zoneIndex];
  for (const m of z.matches) await A((tx) => recordResult(tx, ca, m.id, [[6, 3], [6, 3]]));
}
const r1 = async (id: string) => (await llave(id)).filter((m) => m.round === 1);

describe('plantilla de llave al iniciar', () => {
  it('se crea con los lugares vacíos y su origen: 2 zonas de 3 → 1A vs 2B y 1B vs 2A', async () => {
    const { id } = await started(2);
    const ms = await llave(id);
    expect(ms).toHaveLength(3); // 2 semifinales + final
    const sources = (await r1(id)).map((m) => [m.sourceA, m.sourceB].sort().join('-')).sort();
    expect(sources).toEqual(['1:1-2:2', '1:2-2:1']);
    expect(ms.every((m) => !m.entryAId && !m.entryBId)).toBe(true);
    expect(await status(id)).toBe('zonas');
  });

  it('con 9 parejas (3 zonas de 3): 6 clasificados, llave de 8 con 2 libres para 1A y 1B', async () => {
    const { id } = await started(3);
    const ms = await llave(id);
    expect(ms).toHaveLength(7);
    const byes = ms.filter((m) => m.status === 'bye');
    expect(byes.map((m) => m.sourceA).sort()).toEqual(['1:1', '2:1']);
    expect(byes.every((m) => m.sourceB === null)).toBe(true);
  });
});

describe('tablero público de la llave', () => {
  it('muestra de dónde sale cada lugar sin definir, también el de los libres en la 2ª ronda', async () => {
    const { id } = await started(3);
    const rows = await t.withPlatform((tx) => publicTournamentBoard(tx, 'club-a', id));
    const lab = (x: { zone: string; position: number } | null) => (x ? `${x.position}${x.zone.slice(-1)}` : null);
    const r1p = rows.filter((r) => r.stage === 'llave' && r.round === 1).flatMap((r) => [lab(r.srcA), lab(r.srcB)]);
    const r2p = rows.filter((r) => r.stage === 'llave' && r.round === 2).flatMap((r) => [lab(r.srcA), lab(r.srcB)]);
    // Los libres (1A y 1B) no aparecen como cruce, pero sí como lugar de la 2ª ronda.
    expect(r1p.filter(Boolean).sort()).toEqual(['1C', '2A', '2B', '2C']);
    expect(r2p.filter(Boolean).sort()).toEqual(['1A', '1B']);
    expect(rows.find((r) => r.stage === 'llave' && r.round === 3)).toMatchObject({ srcA: null, srcB: null });
  });
});

describe('llenado progresivo', () => {
  it('cada zona que termina pone a sus clasificados; el libre avanza solo', async () => {
    const { id, z } = await started(3);
    await playZone(id, 0);
    let first = await r1(id);
    const bye1 = first.find((m) => m.sourceA === '1:1')!;
    expect(bye1).toMatchObject({ status: 'bye', entryAId: z[0][0], winnerEntryId: z[0][0] });
    // El 2º de la zona A entró a su cruce; el resto de los lugares sigue vacío.
    const with2A = first.find((m) => m.sourceA === '1:2' || m.sourceB === '1:2')!;
    expect([with2A.entryAId, with2A.entryBId]).toContain(z[0][1]);
    expect(first.filter((m) => m.status !== 'bye').flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean)).toEqual([z[0][1]]);
    // El libre ya está en el cruce siguiente.
    const next = (await llave(id)).find((m) => m.id === bye1.nextMatchId)!;
    expect([next.entryAId, next.entryBId]).toContain(z[0][0]);
    expect(await status(id)).toBe('zonas');

    await playZone(id, 1);
    await playZone(id, 2);
    expect(await status(id)).toBe('llave');
    first = await r1(id);
    expect(first.filter((m) => m.status !== 'bye').every((m) => m.entryAId && m.entryBId)).toBe(true);
    // Cada primero y segundo de zona aparece exactamente una vez en la primera ronda.
    const placed = first.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean).sort();
    expect(placed).toEqual([...z.flatMap((e) => [e[0], e[1]])].sort());
  });

  it('corregir una zona antes de que empiece la llave actualiza los lugares; empezada, no se deja', async () => {
    const { id, z } = await started(3);
    await playZone(id, 0);
    const zs = await A((tx) => zoneStates(tx, ca, id));
    // Deshacer un partido de la zona A: la zona deja de estar completa y sus lugares vuelven a "a definir".
    await A((tx) => clearResult(tx, ca, zs[0].matches[0].id));
    expect((await r1(id)).flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean)).toEqual([]);
    expect((await llave(id)).filter((m) => m.round === 2).flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean)).toEqual([]);
    await A((tx) => recordResult(tx, ca, zs[0].matches[0].id, [[6, 3], [6, 3]]));
    expect((await r1(id)).flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean)).toContain(z[0][0]);

    // Se completa todo y se juega un cruce de la llave.
    await playZone(id, 1);
    await playZone(id, 2);
    // Se juega el cruce donde entró el 2º de la zona A.
    const real = (await r1(id)).find((m) => m.sourceA === '1:2' || m.sourceB === '1:2')!;
    await A((tx) => recordResult(tx, ca, real.id, [[6, 1], [6, 1]]));
    // Ahora no se puede deshacer un resultado de la zona que alimenta ese cruce, y no queda nada a medias.
    const before = JSON.stringify(await r1(id));
    const feed = zs.flatMap((x) => x.matches)[0];
    await expect(A((tx) => clearResult(tx, ca, feed.id))).rejects.toMatchObject({ code: 'next_played' });
    expect(JSON.stringify(await r1(id))).toBe(before);
  });

  it('un empate sin sortear deja esos lugares sin definir y el torneo en zonas', async () => {
    const { id } = await started(2);
    const zs = await A((tx) => zoneStates(tx, ca, id));
    const [m1, m2, m3] = zs[0].matches;
    await A((tx) => recordResult(tx, ca, m1.id, [[6, 4]]));
    await A((tx) => recordResult(tx, ca, m2.id, [[4, 6]]));
    await A((tx) => recordResult(tx, ca, m3.id, [[6, 4]]));
    await playZone(id, 1);
    expect(await status(id)).toBe('zonas');
    expect((await r1(id)).flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean)).toHaveLength(2); // solo la zona B
  });

  it('se puede cerrar con la final jugada aunque el torneo esté en zonas (llave armada a mano)', async () => {
    const { id } = await started(2);
    // Sin zonas terminadas: se arma toda la primera ronda a mano.
    const ms = await r1(id);
    const es = (await A((tx) => tx.select().from(tournamentEntries).where(eq(tournamentEntries.tournamentId, id)))).map((e) => e.id);
    const slots = ms.flatMap((m) => [{ matchId: m.id, side: 'a' as const }, { matchId: m.id, side: 'b' as const }]);
    for (const [i, ref] of slots.entries()) await A((tx) => setSlotEntry(tx, ca, ref, es[i]));
    for (const m of await r1(id)) await A((tx) => recordResult(tx, ca, m.id, [[6, 2], [6, 2]]));
    const final = (await llave(id)).find((m) => m.round === 2)!;
    await A((tx) => recordResult(tx, ca, final.id, [[6, 2], [6, 2]]));
    expect(await status(id)).toBe('zonas');
    await A((tx) => closeTournament(tx, ca, id));
    expect(await status(id)).toBe('cerrado');
  });
});

describe('ajustes a mano', () => {
  it('poner una pareja a mano en un lugar: queda fijada y la llave automática no la toca', async () => {
    const { id, z } = await started(3);
    const m = (await r1(id)).find((x) => x.status !== 'bye')!;
    const third = z[1][2]; // un tercero: no clasifica, así que no está en la llave
    await A((tx) => setSlotEntry(tx, ca, { matchId: m.id, side: 'a' }, third));
    let cur = (await r1(id)).find((x) => x.id === m.id)!;
    expect(cur).toMatchObject({ entryAId: third, lockA: true });
    // Terminan todas las zonas: ese lugar sigue como se puso, el resto se completa solo.
    await playZone(id, 0); await playZone(id, 1); await playZone(id, 2);
    cur = (await r1(id)).find((x) => x.id === m.id)!;
    expect(cur.entryAId).toBe(third);
    // Volver a automático toma la pareja que le corresponde por su zona.
    await A((tx) => restoreSlot(tx, ca, { matchId: m.id, side: 'a' }));
    cur = (await r1(id)).find((x) => x.id === m.id)!;
    expect(cur).toMatchObject({ lockA: false });
    expect(cur.entryAId).not.toBe(third);
    expect(cur.entryAId).not.toBeNull();
  });

  it('una pareja ya ubicada no se puede poner en otro lugar (hay que intercambiar); el lado vacío de un libre no se edita', async () => {
    const { id, z } = await started(3);
    await playZone(id, 0); await playZone(id, 1); await playZone(id, 2);
    const ms = await r1(id);
    const real = ms.filter((x) => x.status !== 'bye');
    await expect(A((tx) => setSlotEntry(tx, ca, { matchId: real[0].id, side: 'a' }, real[1].entryAId!))).rejects.toMatchObject({ code: 'slot_taken' });
    const bye = ms.find((x) => x.status === 'bye')!;
    await expect(A((tx) => setSlotEntry(tx, ca, { matchId: bye.id, side: 'b' }, z[0][2]))).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('intercambiar dos lugares mueve pareja, origen y fijación; con un libre, también el avance', async () => {
    const { id, z } = await started(3);
    await playZone(id, 0); await playZone(id, 1); await playZone(id, 2);
    const ms = await r1(id);
    const bye = ms.find((x) => x.status === 'bye' && x.sourceA === '1:1')!; // el 1º de la zona A tiene libre
    const real = ms.find((x) => x.status !== 'bye')!;
    const [a, b] = [bye.entryAId!, real.entryAId!];
    await A((tx) => swapSlots(tx, ca, { matchId: bye.id, side: 'a' }, { matchId: real.id, side: 'a' }));
    const after = await r1(id);
    expect(after.find((x) => x.id === bye.id)).toMatchObject({ entryAId: b, winnerEntryId: b, sourceA: real.sourceA });
    expect(after.find((x) => x.id === real.id)).toMatchObject({ entryAId: a, sourceA: bye.sourceA });
    // El libre avanzó con la nueva pareja.
    const next = (await llave(id)).find((x) => x.id === bye.nextMatchId)!;
    expect([next.entryAId, next.entryBId]).toContain(b);
    expect([next.entryAId, next.entryBId]).not.toContain(a);
    void z;
  });

  it('no se cambia un cruce que ya empezó', async () => {
    const { id } = await started(2);
    await playZone(id, 0); await playZone(id, 1);
    const [m1, m2] = await r1(id);
    await A((tx) => recordResult(tx, ca, m1.id, [[6, 1], [6, 1]]));
    await expect(A((tx) => swapSlots(tx, ca, { matchId: m1.id, side: 'a' }, { matchId: m2.id, side: 'a' }))).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(A((tx) => setSlotEntry(tx, ca, { matchId: m1.id, side: 'a' }, null))).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('cambiar de zona a dos parejas: se reescriben sus partidos; con partidos jugados no se deja', async () => {
    const { id, z } = await started(2);
    await A((tx) => swapZoneEntries(tx, ca, z[0][0], z[1][0]));
    const zs = await A((tx) => zoneStates(tx, ca, id));
    expect(zs[0].entryIds).toContain(z[1][0]);
    expect(zs[1].entryIds).toContain(z[0][0]);
    const inZone0 = zs[0].matches.flatMap((m) => [m.entryAId, m.entryBId]);
    expect(inZone0).toContain(z[1][0]);
    expect(inZone0).not.toContain(z[0][0]);
    // Una vez jugado un partido de alguna de las dos zonas, ya no.
    await A((tx) => recordResult(tx, ca, zs[0].matches[0].id, [[6, 3], [6, 3]]));
    await expect(A((tx) => swapZoneEntries(tx, ca, z[0][1], z[1][1]))).rejects.toMatchObject({ code: 'zone_started' });
    await expect(A((tx) => swapZoneEntries(tx, ca, z[0][1], z[0][2]))).rejects.toMatchObject({ code: 'invalid_state' }); // misma zona
  });

  it('cambiar a un jugador de una pareja: el nuevo queda ocupado y el anterior libre; no se acepta uno ya inscripto', async () => {
    const { id, ids } = await started(2);
    const [e] = await A((tx) => tx.select().from(tournamentEntries).where(eq(tournamentEntries.id, ids[0])));
    const fresh = await mkPlayer('Suplente');
    await A((tx) => replacePlayer(tx, ca, ids[0], e.player2Id, fresh));
    const [after] = await A((tx) => tx.select().from(tournamentEntries).where(eq(tournamentEntries.id, ids[0])));
    expect([after.player1Id, after.player2Id].sort()).toEqual([e.player1Id, fresh].sort());
    const aux = await A((tx) => tx.select().from(tournamentEntryPlayers).where(eq(tournamentEntryPlayers.entryId, ids[0])));
    expect(aux.map((r) => r.playerId).sort()).toEqual([e.player1Id, fresh].sort());
    // El anterior quedó libre; el nuevo ya no se puede usar en otra pareja; uno inscripto en otra pareja tampoco.
    const [other] = await A((tx) => tx.select().from(tournamentEntries).where(eq(tournamentEntries.id, ids[1])));
    await expect(A((tx) => replacePlayer(tx, ca, ids[0], e.player1Id, other.player1Id))).rejects.toMatchObject({ code: 'player_taken' });
    await expect(A((tx) => replacePlayer(tx, ca, ids[1], other.player1Id, e.player2Id))).resolves.toBeUndefined();
    await expect(A((tx) => replacePlayer(tx, ca, ids[0], 'no-es-de-la-pareja', fresh))).rejects.toBeTruthy();
    void id;
  });

  it('regenerar la llave borra lo puesto a mano, y no se puede con un cruce empezado', async () => {
    const { id, z } = await started(3);
    const m = (await r1(id)).find((x) => x.status !== 'bye')!;
    await A((tx) => setSlotEntry(tx, ca, { matchId: m.id, side: 'a' }, z[0][2]));
    await A((tx) => rebuildBracket(tx, ca, id));
    expect((await r1(id)).every((x) => !x.lockA && !x.lockB)).toBe(true);
    await playZone(id, 0); await playZone(id, 1); await playZone(id, 2);
    const real = (await r1(id)).find((x) => x.status !== 'bye')!;
    await A((tx) => recordResult(tx, ca, real.id, [[6, 1], [6, 1]]));
    await expect(A((tx) => rebuildBracket(tx, ca, id))).rejects.toMatchObject({ code: 'next_played' });
  });

  it('un torneo de otro club no se toca: not_found', async () => {
    const { id } = await started(2);
    const m = (await r1(id))[0];
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', true));
    const B = <T>(fn: (tx: Tx) => Promise<T>) => t.withTenant(s.b.id, fn);
    await expect(B((tx) => setSlotEntry(tx, { clubId: s.b.id }, { matchId: m.id, side: 'a' }, null))).rejects.toMatchObject({ code: 'not_found' });
    await expect(B((tx) => rebuildBracket(tx, { clubId: s.b.id }, id))).rejects.toMatchObject({ code: 'not_found' });
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', false));
    await expect(A((tx) => tx.select().from(tournaments).where(eq(tournaments.id, id)))).resolves.toHaveLength(1);
  });
});
