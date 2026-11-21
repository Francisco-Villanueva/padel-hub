import { describe, expect, it } from 'vitest';
import { drawZones, mulberry32, planZones, resolveFourZoneRound2, zoneMatchPlan, zoneStandings, drawTieOrder, type ZoneMatchResult } from '../src/lib/tournament';

describe('planZones', () => {
  it('casos conocidos', () => {
    expect(planZones(6).sizes).toEqual([3, 3]);
    expect(planZones(7).sizes).toEqual([4, 3]);
    expect(planZones(8).sizes).toEqual([4, 4]);
    expect(planZones(9).sizes).toEqual([3, 3, 3]);
    expect(planZones(10).sizes).toEqual([4, 3, 3]);
    expect(planZones(11).sizes).toEqual([4, 4, 3]);
    expect(planZones(12)).toMatchObject({ threes: 4, fours: 0 });
    expect(planZones(13)).toMatchObject({ threes: 3, fours: 1 });
  });
  it('de 6 a 60: suma exacta y mínima cantidad de zonas de 4', () => {
    for (let n = 6; n <= 60; n++) {
      const p = planZones(n);
      expect(3 * p.threes + 4 * p.fours).toBe(n);
      // Ningún otro plan válido tiene menos zonas de 4.
      for (let b = 0; b < p.fours; b++) expect((n - 4 * b) % 3 === 0).toBe(false);
    }
  });
  it('falla bajo el piso técnico', () => {
    for (const n of [0, 1, 5]) expect(() => planZones(n)).toThrow();
  });
});

describe('drawZones', () => {
  const entries = (n: number, seeds = 0) => Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, seed: i < seeds ? i + 1 : null }));
  it('reparte a todos exactamente una vez y respeta los tamaños', () => {
    const z = drawZones(entries(10), planZones(10), { rng: mulberry32(1) });
    expect(z.map((x) => x.entryIds.length)).toEqual([4, 3, 3]);
    expect(z.flatMap((x) => x.entryIds).sort()).toEqual(entries(10).map((e) => e.id).sort());
  });
  it('las cabezas de serie van en serpentina', () => {
    const z = drawZones(entries(12, 8), planZones(12), { rng: mulberry32(7) }); // 4 zonas de 3
    expect(z.map((x) => x.entryIds[0])).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(z.map((x) => x.entryIds[1])).toEqual(['e8', 'e7', 'e6', 'e5']);
  });
  it('es reproducible con la misma semilla y cambia con otra', () => {
    const a = drawZones(entries(13), planZones(13), { rng: mulberry32(42) });
    expect(drawZones(entries(13), planZones(13), { rng: mulberry32(42) })).toEqual(a);
    expect(drawZones(entries(13), planZones(13), { rng: mulberry32(43) })).not.toEqual(a);
  });
});

describe('partidos de zona', () => {
  it('zona de 3: todos contra todos', () => {
    const m = zoneMatchPlan(['A', 'B', 'C']);
    expect(m.map((x) => [x.a, x.b])).toEqual([['A', 'B'], ['A', 'C'], ['B', 'C']]);
  });
  it('zona de 4: 4 partidos; la 2ª ronda cruza ganadores y perdedores', () => {
    const m = zoneMatchPlan(['A', 'B', 'C', 'D']);
    expect(m).toHaveLength(4);
    const r2 = resolveFourZoneRound2([{ winner: 'A', loser: 'B' }, { winner: 'D', loser: 'C' }]);
    expect(r2).toEqual([
      { round: 2, position: 1, a: 'A', b: 'D', bracket: 'winners' },
      { round: 2, position: 2, a: 'B', b: 'C', bracket: 'losers' },
    ]);
  });
});

const m = (round: number, position: number, a: string, b: string, winner: string, sets: [number, number][]): ZoneMatchResult => ({ round, position, a, b, winner, sets });

describe('posiciones de zona de 3', () => {
  const ids = ['A', 'B', 'C'];
  it('por victorias; pasan 2', () => {
    const s = zoneStandings(3, ids, [m(1, 1, 'A', 'B', 'A', [[6, 0]]), m(2, 1, 'A', 'C', 'A', [[6, 0]]), m(3, 1, 'B', 'C', 'B', [[6, 4]])]);
    expect(s.rows.map((r) => [r.entryId, r.position, r.qualified])).toEqual([['A', 1, true], ['B', 2, true], ['C', 3, false]]);
    expect(s.needsDraw).toEqual([]);
  });
  it('empate de tres (1 victoria c/u) se resuelve por diferencia de games', () => {
    // Ciclo A>B, B>C, C>A con diferencias distintas.
    const s = zoneStandings(3, ids, [m(1, 1, 'A', 'B', 'A', [[6, 0]]), m(2, 1, 'A', 'C', 'C', [[4, 6]]), m(3, 1, 'B', 'C', 'B', [[6, 3]])]);
    // A: +4 ; C: -1 ; B: -3.
    expect(s.rows.map((r) => r.entryId)).toEqual(['A', 'C', 'B']);
    expect(s.needsDraw).toEqual([]);
  });
  it('empate de tres y misma diferencia: va a sorteo (no desempata el partido entre ellas)', () => {
    const s = zoneStandings(3, ids, [m(1, 1, 'A', 'B', 'A', [[6, 4]]), m(2, 1, 'A', 'C', 'C', [[4, 6]]), m(3, 1, 'B', 'C', 'B', [[6, 4]])]);
    expect(s.needsDraw).toHaveLength(1);
    expect(s.needsDraw[0]).toHaveLength(3);
    expect(s.rows.every((r) => r.position === null)).toBe(true);
    const draw = drawTieOrder(s.needsDraw[0], mulberry32(5));
    const solved = zoneStandings(3, ids, [m(1, 1, 'A', 'B', 'A', [[6, 4]]), m(2, 1, 'A', 'C', 'C', [[4, 6]]), m(3, 1, 'B', 'C', 'B', [[6, 4]])], { draw });
    expect(solved.needsDraw).toEqual([]);
    expect(solved.rows.map((r) => r.entryId)).toEqual(draw);
    expect(solved.rows.filter((r) => r.qualified)).toHaveLength(2);
  });
  it('mientras falten partidos no hay posiciones ni sorteo', () => {
    const s = zoneStandings(3, ids, [m(1, 1, 'A', 'B', 'A', [[6, 0]]), { round: 2, position: 1, a: 'A', b: 'C', winner: null, sets: null }, { round: 3, position: 1, a: 'B', b: 'C', winner: null, sets: null }]);
    expect(s.complete).toBe(false);
    expect(s.rows.every((r) => !r.qualified)).toBe(true);
  });
});

describe('posiciones de zona de 4', () => {
  const ids = ['A', 'B', 'C', 'D'];
  it('pasan 3: queda afuera quien pierde el partido de perdedores', () => {
    const s = zoneStandings(4, ids, [
      m(1, 1, 'A', 'B', 'A', [[6, 2]]), m(1, 2, 'C', 'D', 'D', [[3, 6]]),
      m(2, 1, 'A', 'D', 'A', [[6, 3]]), m(2, 2, 'B', 'C', 'B', [[6, 4]]),
    ]);
    expect(s.rows[0].entryId).toBe('A');
    expect(s.rows.filter((r) => r.qualified)).toHaveLength(3);
    expect(s.rows[3]).toMatchObject({ entryId: 'C', qualified: false });
  });
  it('2º y 3º se ordenan por diferencia de games; si empatan, sorteo', () => {
    const base = (diffSet: [number, number]): ZoneMatchResult[] => [
      m(1, 1, 'A', 'B', 'A', [[6, 3]]), m(1, 2, 'C', 'D', 'C', [[6, 3]]),
      m(2, 1, 'A', 'C', 'A', [[6, 4]]), m(2, 2, 'B', 'D', 'B', [diffSet]),
    ];
    // C (perdedor de ganadores): +3 -2 = +1 ; B (ganador de perdedores): -3 + diff
    expect(zoneStandings(4, ids, base([6, 0])).rows.map((r) => r.entryId).slice(1, 3)).toEqual(['B', 'C']);
    expect(zoneStandings(4, ids, base([6, 4])).rows.map((r) => r.entryId).slice(1, 3)).toEqual(['C', 'B']);
    const eq = zoneStandings(4, ids, base([6, 2])); // B: -3+4 = +1 = C
    expect(eq.needsDraw).toEqual([['B', 'C']]);
  });
});

describe('desempate entre dos parejas', () => {
  it('con igual diferencia de games gana el partido entre ellas', () => {
    // Ciclo A>B, B>C, C>A. A: +4 (6-0, 4-6). B: -6+4 = -2. C: -4+2 = -2 → B y C empatan en diferencia y B le ganó a C.
    const s = zoneStandings(3, ['A', 'B', 'C'], [
      m(1, 1, 'A', 'B', 'A', [[6, 0]]), m(2, 1, 'A', 'C', 'C', [[4, 6]]), m(3, 1, 'B', 'C', 'B', [[6, 2]]),
    ]);
    expect(s.rows.map((r) => [r.entryId, r.gameDiff])).toEqual([['A', 4], ['B', -2], ['C', -2]]);
    expect(s.needsDraw).toEqual([]);
    expect(s.rows.filter((r) => r.qualified).map((r) => r.entryId)).toEqual(['A', 'B']);
  });
});
