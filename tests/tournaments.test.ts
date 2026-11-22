import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tournamentInputSchema, templateInputSchema } from '../src/lib/tournament-schema';
import { playerConsents, players, rankingEvents, tournamentEntries, tournamentMatches, tournamentZones } from '../src/server/db/schema';
import type { Tx } from '../src/server/db/tenant';
import { FeatureDisabledError, setClubFeature } from '../src/server/services/features';
import { getRanking, listRankingBuckets } from '../src/server/services/ranking';
import { listEntries, quickCreatePlayer, registerPair, removePair } from '../src/server/services/tournament-entries';
import { TournamentError } from '../src/server/services/tournament-errors';
import { clearResult, recordResult, resolveTie } from '../src/server/services/tournament-matches';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from '../src/server/services/tournament-templates';
import {
  cancelTournament, closeTournament, createTournament, generateBracket, getTournament, openRegistration, reopenTournament, startTournament,
  updateTournament, zoneStates,
} from '../src/server/services/tournaments';
import { seedTwoClubs, setupDb } from './helpers';

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
let ca: { clubId: string; userId: string };
let cb: { clubId: string; userId: string };
let phoneN = 0;

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  ca = { clubId: s.a.id, userId: s.ownerA };
  cb = { clubId: s.b.id, userId: s.ownerB };
  await t.withPlatform(async (tx) => { await setClubFeature(tx, { userId: s.ownerA }, s.a.id, 'tournaments', true); });
});
afterAll(async () => { await t.client.close(); });

const A = <T>(fn: (tx: Tx) => Promise<T>) => t.withTenant(s.a.id, fn);
const B = <T>(fn: (tx: Tx) => Promise<T>) => t.withTenant(s.b.id, fn);

async function mkPlayer(clubId: string, category = 6, gender: 'male' | 'female' = 'male') {
  const phone = `+5491150${String(++phoneN).padStart(6, '0')}`;
  const [p] = await t.withTenant(clubId, (tx) => tx.insert(players).values({ clubId, firstName: `J${phoneN}`, lastName: 'Test', gender, category, phoneE164: phone, source: 'manual' }).returning({ id: players.id }));
  return p.id;
}

const input = (over: Record<string, unknown> = {}) => tournamentInputSchema.parse({
  name: '6ta libre', modality: 'libre', ruleKind: 'single', ruleValue: 6, isRanked: true, minPairs: 6, championPoints: 1000, participationPoints: 5,
  startsOn: '2026-11-18', ...over,
});

/** Torneo en inscripción con n parejas de 6ta. */
async function openTournament(n: number, over: Record<string, unknown> = {}) {
  const id = await A((tx) => createTournament(tx, ca, input(over)));
  await A((tx) => openRegistration(tx, ca, id));
  const entries: string[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = await mkPlayer(s.a.id), p2 = await mkPlayer(s.a.id);
    entries.push(await A((tx) => registerPair(tx, ca, id, { player1Id: p1, player2Id: p2 })));
  }
  return { id, entries };
}

/** Carga resultados hasta que no queden partidos jugables; gana siempre el lado A (o el que decida `pick`). */
async function playAll(stage: 'zona' | 'llave', id: string, pick: (m: typeof tournamentMatches.$inferSelect) => 'a' | 'b' = () => 'a') {
  for (let guard = 0; guard < 200; guard++) {
    const [m] = await A((tx) => tx.select().from(tournamentMatches).where(and(
      eq(tournamentMatches.tournamentId, id), eq(tournamentMatches.stage, stage), isNull(tournamentMatches.winnerEntryId), eq(tournamentMatches.status, 'pendiente'),
    )).orderBy(tournamentMatches.round, tournamentMatches.position));
    if (!m || !m.entryAId || !m.entryBId) {
      const playable = await A((tx) => tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, id), eq(tournamentMatches.stage, stage), isNull(tournamentMatches.winnerEntryId), eq(tournamentMatches.status, 'pendiente'))));
      const next = playable.find((x) => x.entryAId && x.entryBId);
      if (!next) return;
      await A((tx) => recordResult(tx, ca, next.id, pick(next) === 'a' ? [[6, 3], [6, 3]] : [[3, 6], [3, 6]]));
      continue;
    }
    await A((tx) => recordResult(tx, ca, m.id, pick(m) === 'a' ? [[6, 3], [6, 3]] : [[3, 6], [3, 6]]));
  }
  throw new Error('playAll no terminó');
}

describe('feature flag en los servicios', () => {
  it('con el flag apagado (club B) todo se rechaza', async () => {
    await expect(B((tx) => createTournament(tx, cb, input()))).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(B((tx) => listTemplates(tx, cb))).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(B((tx) => getRanking(tx, cb, { ruleKind: 'single', ruleValue: 6, modality: 'libre' }))).rejects.toBeInstanceOf(FeatureDisabledError);
  });
});

describe('plantillas y puntos', () => {
  it('el torneo guarda su propia tabla: editar o borrar la plantilla no la cambia', async () => {
    const tpl = await A((tx) => createTemplate(tx, ca, templateInputSchema.parse({ name: 'Torneo de 1000 ptos', championPoints: 1000, participationPoints: 5 })));
    const id = await A((tx) => createTournament(tx, ca, input({ templateId: tpl, championPoints: undefined, participationPoints: undefined })));
    const before = await A((tx) => getTournament(tx, ca, id));
    expect(before).toMatchObject({ championPoints: 1000, participationPoints: 5, templateId: tpl });
    expect(before!.pointsTable).toMatchObject({ champion: 1000, final: 600, semifinal: 360, quarterfinal: 180, round_of_16: 90, round_of_32: 45 });
    await A((tx) => updateTemplate(tx, ca, tpl, templateInputSchema.parse({ name: 'Otro', championPoints: 200 })));
    await A((tx) => deleteTemplate(tx, ca, tpl));
    expect((await A((tx) => getTournament(tx, ca, id)))!.pointsTable).toEqual(before!.pointsTable);
    expect(await A((tx) => listTemplates(tx, ca))).toHaveLength(0);
  });
  it('el club ajusta los puntos de una ronda', async () => {
    const id = await A((tx) => createTournament(tx, ca, input({ roundOverrides: { semifinal: 400 } })));
    expect((await A((tx) => getTournament(tx, ca, id)))!.pointsTable).toMatchObject({ semifinal: 400, final: 600 });
  });
  it('plantillas y torneos de otro club no se ven ni se usan', async () => {
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', true));
    const tplB = await B((tx) => createTemplate(tx, cb, templateInputSchema.parse({ name: 'B', championPoints: 100 })));
    await expect(A((tx) => createTournament(tx, ca, input({ templateId: tplB })))).rejects.toMatchObject({ code: 'template_not_found' });
    const idB = await B((tx) => createTournament(tx, cb, input()));
    expect(await A((tx) => getTournament(tx, ca, idB))).toBeNull();
    await expect(A((tx) => openRegistration(tx, ca, idB))).rejects.toMatchObject({ code: 'not_found' });
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', false));
  });
  it('un torneo exige campeón si no hay plantilla, y el mínimo de 6 parejas', async () => {
    await expect(A((tx) => createTournament(tx, ca, input({ championPoints: undefined })))).rejects.toMatchObject({ code: 'champion_required' });
    expect(() => input({ minPairs: 5 })).toThrow();
    expect(() => input({ ruleKind: 'sum', ruleValue: 1 })).toThrow();
  });
});

describe('inscripción', () => {
  it('valida categoría, modalidad, jugador repetido y jugador de otro club', async () => {
    const id = await A((tx) => createTournament(tx, ca, input({ modality: 'mixto' })));
    const p6m = await mkPlayer(s.a.id, 6, 'male'), p6f = await mkPlayer(s.a.id, 6, 'female'), p7 = await mkPlayer(s.a.id, 7, 'female'), p6m2 = await mkPlayer(s.a.id, 6, 'male');
    // En borrador todavía no se inscribe.
    await expect(A((tx) => registerPair(tx, ca, id, { player1Id: p6m, player2Id: p6f }))).rejects.toMatchObject({ code: 'invalid_state' });
    await A((tx) => openRegistration(tx, ca, id));
    await expect(A((tx) => registerPair(tx, ca, id, { player1Id: p6m, player2Id: p7 }))).rejects.toMatchObject({ code: 'pair_invalid', detail: { reason: 'category_mismatch' } });
    await expect(A((tx) => registerPair(tx, ca, id, { player1Id: p6m, player2Id: p6m2 }))).rejects.toMatchObject({ code: 'pair_invalid', detail: { reason: 'modality_mismatch' } });
    await expect(A((tx) => registerPair(tx, ca, id, { player1Id: p6m, player2Id: p6m }))).rejects.toMatchObject({ code: 'pair_invalid' });
    const other = await mkPlayer(s.b.id, 6, 'female');
    await expect(A((tx) => registerPair(tx, ca, id, { player1Id: p6m, player2Id: other }))).rejects.toMatchObject({ code: 'player_not_found' });
    const e = await A((tx) => registerPair(tx, ca, id, { player1Id: p6m, player2Id: p6f }));
    // Ya inscripto: no puede estar en otra pareja activa.
    await expect(A((tx) => registerPair(tx, ca, id, { player1Id: p6m2, player2Id: p6f }))).rejects.toMatchObject({ code: 'player_taken' });
    // Baja y reinscripción en otra pareja.
    await A((tx) => removePair(tx, ca, e));
    expect(await A((tx) => listEntries(tx, ca, id))).toHaveLength(0);
    await A((tx) => registerPair(tx, ca, id, { player1Id: p6m2, player2Id: p6f }));
    expect(await A((tx) => listEntries(tx, ca, id))).toHaveLength(1);
  });
  it('suma 13: 6ta + 7ma entra; 5ta + 7ma no', async () => {
    const id = await A((tx) => createTournament(tx, ca, input({ ruleKind: 'sum', ruleValue: 13 })));
    await A((tx) => openRegistration(tx, ca, id));
    const [p5, p6, p7] = [await mkPlayer(s.a.id, 5), await mkPlayer(s.a.id, 6), await mkPlayer(s.a.id, 7)];
    await A((tx) => registerPair(tx, ca, id, { player1Id: p6, player2Id: p7 }));
    const p7b = await mkPlayer(s.a.id, 7);
    await expect(A((tx) => registerPair(tx, ca, id, { player1Id: p5, player2Id: p7b }))).rejects.toMatchObject({ code: 'pair_invalid', detail: { reason: 'sum_too_low' } });
  });
  it('alta en el momento: crea con consentimiento y dedupea por teléfono', async () => {
    const q = { firstName: 'Nuevo', lastName: 'Jugador', gender: 'male' as const, category: 6, phone: '2914559900' };
    const first = await A((tx) => quickCreatePlayer(tx, { clubId: s.a.id, country: 'AR' }, q));
    expect('created' in first).toBe(true);
    if (!('created' in first) || !first.created) throw new Error('no se creó');
    const id = first.created.id;
    const consents = await A((tx) => tx.select().from(playerConsents).where(eq(playerConsents.playerId, id)));
    expect(consents).toHaveLength(1);
    expect((await A((tx) => tx.select().from(players).where(eq(players.id, id))))[0].source).toBe('manual');
    const again = await A((tx) => quickCreatePlayer(tx, { clubId: s.a.id, country: 'AR' }, { ...q, firstName: 'Otro' }));
    expect(again).toMatchObject({ existing: { id } });
    await expect(A((tx) => quickCreatePlayer(tx, { clubId: s.a.id, country: 'AR' }, { ...q, phone: 'abc' }))).rejects.toMatchObject({ code: 'invalid_phone' });
    // El mismo teléfono en el otro club es otro jugador.
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', true));
    expect('created' in (await B((tx) => quickCreatePlayer(tx, { clubId: s.b.id, country: 'AR' }, q)))).toBe(true);
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', false));
  });
});

describe('iniciar torneo', () => {
  it('falla bajo el mínimo y dice cuántas parejas faltan', async () => {
    const { id } = await openTournament(7, { minPairs: 8 });
    await expect(A((tx) => startTournament(tx, ca, id))).rejects.toMatchObject({ code: 'below_min', detail: { missing: 1, minPairs: 8 } });
    expect((await A((tx) => getTournament(tx, ca, id)))!.status).toBe('inscripcion');
  });
  it('con 7 parejas arma zonas 3 + 4 y reparte a todas', async () => {
    const { id, entries } = await openTournament(7);
    await A((tx) => startTournament(tx, ca, id, { seed: 99 }));
    const zones = await A((tx) => tx.select().from(tournamentZones).where(eq(tournamentZones.tournamentId, id)).orderBy(tournamentZones.position));
    expect(zones.map((z) => z.size)).toEqual([3, 4]);
    const es = await A((tx) => tx.select().from(tournamentEntries).where(eq(tournamentEntries.tournamentId, id)));
    expect(es.every((e) => e.zoneId)).toBe(true);
    expect(es.map((e) => e.id).sort()).toEqual([...entries].sort());
    const ms = await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id)));
    expect(ms).toHaveLength(3 + 4);
    // Ya iniciado: no se inscribe más ni se vuelve a iniciar.
    await expect(A((tx) => startTournament(tx, ca, id))).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(A((tx) => updateTournament(tx, ca, id, input()))).rejects.toMatchObject({ code: 'invalid_state' });
  });
  it('mismo sorteo con la misma semilla', async () => {
    const a = await openTournament(9), b = await openTournament(9);
    await A((tx) => startTournament(tx, ca, a.id, { seed: 5 }));
    await A((tx) => startTournament(tx, ca, b.id, { seed: 5 }));
    const sizes = async (id: string) => (await A((tx) => zoneStates(tx, ca, id))).map((z) => z.entryIds.length);
    expect(await sizes(a.id)).toEqual([3, 3, 3]);
    expect(await sizes(b.id)).toEqual([3, 3, 3]);
  });
  it('no se cambia la regla con parejas inscriptas', async () => {
    const { id } = await openTournament(1);
    await expect(A((tx) => updateTournament(tx, ca, id, input({ modality: 'masculino' })))).rejects.toMatchObject({ code: 'has_entries' });
    await A((tx) => updateTournament(tx, ca, id, input({ name: 'Nuevo nombre' })));
  });
});

describe('resultados', () => {
  it('valida los sets y el ganador; permite corregir y borrar', async () => {
    const { id } = await openTournament(6);
    await A((tx) => startTournament(tx, ca, id, { seed: 1 }));
    const [m] = await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id)).orderBy(tournamentMatches.round, tournamentMatches.position));
    for (const bad of [[], [[6, 6]], [[6, 4], [4, 6]], 'x', [[6, 4], [6, 4], [6, 4], [6, 4]]]) {
      await expect(A((tx) => recordResult(tx, ca, m.id, bad))).rejects.toMatchObject({ code: 'result_invalid' });
    }
    await A((tx) => recordResult(tx, ca, m.id, [[6, 4], [3, 6], [7, 5]]));
    const done = (await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m.id))))[0];
    expect(done).toMatchObject({ status: 'jugado', winnerEntryId: m.entryAId });
    await A((tx) => recordResult(tx, ca, m.id, [[2, 6], [3, 6]])); // corrección: ahora gana B
    expect((await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m.id))))[0].winnerEntryId).toBe(m.entryBId);
    await A((tx) => clearResult(tx, ca, m.id));
    expect((await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, m.id))))[0]).toMatchObject({ status: 'pendiente', winnerEntryId: null, sets: null });
    await expect(A((tx) => clearResult(tx, ca, m.id))).rejects.toMatchObject({ code: 'invalid_state' });
  });
  it('un resultado de otro club no se puede cargar', async () => {
    const { id } = await openTournament(6);
    await A((tx) => startTournament(tx, ca, id, { seed: 1 }));
    const [m] = await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id)));
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', true));
    await expect(B((tx) => recordResult(tx, cb, m.id, [[6, 4], [6, 4]]))).rejects.toMatchObject({ code: 'not_found' });
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', false));
  });
  it('zona de 4: la 2ª ronda se completa sola con los resultados de la 1ª; no se corrige si ya se jugó', async () => {
    const { id } = await openTournament(8);
    await A((tx) => startTournament(tx, ca, id, { seed: 3 })); // 4 + 4
    const zone = (await A((tx) => zoneStates(tx, ca, id)))[0];
    const r1 = zone.matches.filter((m) => m.round === 1);
    const r2 = () => A((tx) => tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.zoneId, zone.zone.id), eq(tournamentMatches.round, 2))).orderBy(tournamentMatches.position));
    expect((await r2()).every((m) => !m.entryAId)).toBe(true);
    await A((tx) => recordResult(tx, ca, r1[0].id, [[6, 1], [6, 1]]));
    await A((tx) => recordResult(tx, ca, r1[1].id, [[6, 1], [6, 1]]));
    const [w, l] = await r2();
    expect(w).toMatchObject({ entryAId: r1[0].entryAId, entryBId: r1[1].entryAId });
    expect(l).toMatchObject({ entryAId: r1[0].entryBId, entryBId: r1[1].entryBId });
    await A((tx) => recordResult(tx, ca, w.id, [[6, 1], [6, 1]]));
    await expect(A((tx) => recordResult(tx, ca, r1[0].id, [[1, 6], [1, 6]]))).rejects.toMatchObject({ code: 'next_played' });
  });
});

describe('torneo de punta a punta', () => {
  it('10 parejas: zonas → resultados → llave → final → cierre → ranking', async () => {
    const { id, entries } = await openTournament(10);
    await A((tx) => startTournament(tx, ca, id, { seed: 11 }));
    // La llave no se arma con zonas incompletas.
    await expect(A((tx) => generateBracket(tx, ca, id))).rejects.toMatchObject({ code: 'zones_incomplete' });
    await playAll('zona', id);
    let states = await A((tx) => zoneStates(tx, ca, id));
    expect(states.every((z) => z.standings.complete)).toBe(true);
    // En la zona de 4 el 2º y el 3º llegan igualados (diferencia 0, no se enfrentaron): corresponde el sorteo.
    await expect(A((tx) => generateBracket(tx, ca, id))).rejects.toMatchObject({ code: 'tie_unresolved' });
    for (const z of states.filter((x) => x.standings.needsDraw.length)) await A((tx) => resolveTie(tx, ca, z.zone.id, { seed: 5 }));
    states = await A((tx) => zoneStates(tx, ca, id));
    expect(states.every((z) => z.standings.needsDraw.length === 0)).toBe(true);
    // 3 + 3 + 4 zonas → 2 + 2 + 3 = 7 clasificados → llave de 8 con 1 bye.
    const { size } = await A((tx) => generateBracket(tx, ca, id));
    expect(size).toBe(8);
    const bracket = await A((tx) => tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, id), eq(tournamentMatches.stage, 'llave'))));
    expect(bracket).toHaveLength(7);
    expect(bracket.filter((m) => m.status === 'bye')).toHaveLength(1);
    await expect(A((tx) => closeTournament(tx, ca, id))).rejects.toMatchObject({ code: 'final_pending' });
    await playAll('llave', id);

    await A((tx) => closeTournament(tx, ca, id, { now: new Date('2026-11-20T12:00:00Z') }));
    const t0 = await A((tx) => getTournament(tx, ca, id));
    expect(t0).toMatchObject({ status: 'cerrado', endsOn: '2026-11-20' });

    const events = () => A((tx) => tx.select().from(rankingEvents).where(eq(rankingEvents.tournamentId, id)));
    const ev = await events();
    expect(ev).toHaveLength(20);
    const by = new Map<string | null, number[]>();
    for (const e of ev) by.set(e.roundReached, [...(by.get(e.roundReached) ?? []), e.points]);
    expect(by.get('champion')).toEqual([1000, 1000]);
    expect(by.get('final')).toEqual([600, 600]);
    expect(by.get('semifinal')).toEqual([360, 360, 360, 360]);
    // 3 que no pasaron la zona (3 zonas: 10 − 7) → solo participación; los de cuartos pierden con 180.
    expect(by.get(null)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(by.get('quarterfinal')!.every((p) => p === 180)).toBe(true);
    expect(entries).toHaveLength(10);

    // Idempotencia: reabrir saca los puntos; volver a cerrar no duplica.
    await A((tx) => reopenTournament(tx, ca, id));
    expect(await events()).toHaveLength(0);
    await A((tx) => closeTournament(tx, ca, id));
    expect(await events()).toHaveLength(20);
    await expect(A((tx) => closeTournament(tx, ca, id))).rejects.toMatchObject({ code: 'invalid_state' });

    // Ranking: el campeón arriba, con ambos jugadores empatados en el 1º puesto.
    const group = { ruleKind: 'single' as const, ruleValue: 6, modality: 'libre' as const };
    const rk = await A((tx) => getRanking(tx, ca, group));
    expect(rk.length).toBeGreaterThanOrEqual(20);
    expect(rk.slice(0, 2).map((r) => [r.position, r.points])).toEqual([[1, 1000], [1, 1000]]);
    expect(rk[2]).toMatchObject({ position: 3, points: 600 });
    expect(await A((tx) => listRankingBuckets(tx, ca))).toContainEqual(group);
  });

  it('ranking: ventanas móviles, sin mezclar modalidades, reglas ni clubes', async () => {
    const group = { ruleKind: 'single' as const, ruleValue: 6, modality: 'libre' as const };
    // Torneo 2020: fuera de la ventana de un año. Se simula adelantando "now" del ranking.
    const total = (await A((tx) => getRanking(tx, ca, group, 'all'))).reduce((n, r) => n + r.points, 0);
    expect(total).toBeGreaterThan(0);
    const now = new Date('2026-11-25T00:00:00Z'); // el torneo cerró el 2026-11-20
    expect((await A((tx) => getRanking(tx, ca, group, 'month', now))).length).toBeGreaterThan(0);
    expect(await A((tx) => getRanking(tx, ca, group, 'month', new Date('2027-01-15T00:00:00Z')))).toEqual([]);
    expect(await A((tx) => getRanking(tx, ca, group, '6months', new Date('2027-01-15T00:00:00Z')))).not.toEqual([]);
    expect(await A((tx) => getRanking(tx, ca, group, 'year', new Date('2028-01-15T00:00:00Z')))).toEqual([]);
    // Otra modalidad u otra regla: vacío.
    expect(await A((tx) => getRanking(tx, ca, { ...group, modality: 'femenino' }))).toEqual([]);
    expect(await A((tx) => getRanking(tx, ca, { ...group, ruleValue: 5 }))).toEqual([]);
    // Otro club (con flag activo pero sin torneos): vacío.
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', true));
    expect(await B((tx) => getRanking(tx, cb, group))).toEqual([]);
    await t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerB }, s.b.id, 'tournaments', false));
  });

  it('un torneo no puntuable no escribe puntos', async () => {
    const { id } = await openTournament(6, { isRanked: false });
    await A((tx) => startTournament(tx, ca, id, { seed: 2 }));
    await playAll('zona', id);
    await A((tx) => generateBracket(tx, ca, id));
    await playAll('llave', id);
    await A((tx) => closeTournament(tx, ca, id));
    expect(await A((tx) => tx.select().from(rankingEvents).where(eq(rankingEvents.tournamentId, id)))).toHaveLength(0);
    expect((await A((tx) => getTournament(tx, ca, id)))!.status).toBe('cerrado');
  });

  it('un torneo cancelado no escribe puntos y queda en solo lectura', async () => {
    const { id } = await openTournament(6);
    await A((tx) => startTournament(tx, ca, id, { seed: 2 }));
    await A((tx) => cancelTournament(tx, ca, id));
    expect((await A((tx) => getTournament(tx, ca, id)))).toMatchObject({ status: 'cancelado' });
    expect(await A((tx) => tx.select().from(rankingEvents).where(eq(rankingEvents.tournamentId, id)))).toHaveLength(0);
    const [m] = await A((tx) => tx.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id)));
    await expect(A((tx) => recordResult(tx, ca, m.id, [[6, 4], [6, 4]]))).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(A((tx) => cancelTournament(tx, ca, id))).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(A((tx) => closeTournament(tx, ca, id))).rejects.toBeInstanceOf(TournamentError);
  });

  it('cabezas de serie por ranking: la pareja con más puntos queda sembrada', async () => {
    // Los jugadores del campeón del primer torneo se inscriben en uno nuevo del mismo grupo.
    const [champ] = await A((tx) => tx.select({ p: rankingEvents.playerId, e: rankingEvents.entryId }).from(rankingEvents).where(eq(rankingEvents.roundReached, 'champion')).limit(1));
    const [entry] = await A((tx) => tx.select().from(tournamentEntries).where(eq(tournamentEntries.id, champ.e)));
    const id = await A((tx) => createTournament(tx, ca, input({ name: 'Segundo' })));
    await A((tx) => openRegistration(tx, ca, id));
    await A((tx) => registerPair(tx, ca, id, { player1Id: entry.player1Id, player2Id: entry.player2Id }));
    for (let i = 0; i < 5; i++) await A(async (tx) => { await registerPair(tx, ca, id, { player1Id: await mkPlayerTx(tx), player2Id: await mkPlayerTx(tx) }); });
    await A((tx) => startTournament(tx, ca, id, { seed: 8 }));
    const seeded = await A((tx) => tx.select().from(tournamentEntries).where(eq(tournamentEntries.tournamentId, id)));
    expect(seeded.filter((e) => e.seed != null).map((e) => [e.player1Id, e.seed])).toEqual([[entry.player1Id, 1]]);
  });
});

async function mkPlayerTx(tx: Tx) {
  const phone = `+5491150${String(++phoneN).padStart(6, '0')}`;
  const [p] = await tx.insert(players).values({ clubId: s.a.id, firstName: `J${phoneN}`, lastName: 'Test', gender: 'male', category: 6, phoneE164: phone, source: 'manual' }).returning({ id: players.id });
  return p.id;
}

describe('desempate por sorteo', () => {
  it('empate de tres con la misma diferencia: la llave exige el sorteo, que queda registrado y reproducible', async () => {
    const { id } = await openTournament(6);
    await A((tx) => startTournament(tx, ca, id, { seed: 4 }));
    const [z1, z2] = await A((tx) => zoneStates(tx, ca, id));
    // Zona 1 en ciclo A>B, C>A, B>C, todos por 6-4: 1 victoria y diferencia 0 cada una.
    const cyc = [z1.matches.find((m) => m.round === 1)!, z1.matches.find((m) => m.round === 2)!, z1.matches.find((m) => m.round === 3)!];
    await A((tx) => recordResult(tx, ca, cyc[0].id, [[6, 4]])); // a gana
    await A((tx) => recordResult(tx, ca, cyc[1].id, [[4, 6]])); // b gana
    await A((tx) => recordResult(tx, ca, cyc[2].id, [[6, 4]])); // a gana
    for (const m of z2.matches) await A((tx) => recordResult(tx, ca, m.id, [[6, 3], [6, 3]]));
    await expect(A((tx) => generateBracket(tx, ca, id))).rejects.toMatchObject({ code: 'tie_unresolved' });
    const draw = await A((tx) => resolveTie(tx, ca, z1.zone.id, { seed: 77 }));
    expect(draw.order).toHaveLength(3);
    const stored = (await A((tx) => tx.select().from(tournamentZones).where(eq(tournamentZones.id, z1.zone.id))))[0].tieDraw;
    expect(stored).toEqual({ seed: 77, order: draw.order });
    expect((await A((tx) => zoneStates(tx, ca, id)))[0].standings.rows.map((r) => r.entryId)).toEqual(draw.order);
    await expect(A((tx) => resolveTie(tx, ca, z1.zone.id))).rejects.toMatchObject({ code: 'draw_invalid' }); // ya no hay empate pendiente
    await A((tx) => generateBracket(tx, ca, id));
    // Corregir un resultado invalida el sorteo (aunque ya hay llave, la zona ya no admite cargas: estado `llave`).
    await expect(A((tx) => recordResult(tx, ca, cyc[0].id, [[6, 0]]))).rejects.toMatchObject({ code: 'invalid_state' });
  });
});
