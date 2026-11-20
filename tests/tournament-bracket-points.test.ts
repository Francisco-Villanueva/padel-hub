import { describe, expect, it } from 'vitest';
import {
  advance, buildBracket, filterByWindow, mulberry32, playerPoints, roundPoints, roundsReached, seedOrder, seedQualifiers,
  validatePair, windowStart, type Bracket, type PairPlayer,
} from '../src/lib/tournament';

const quals = (n: number, zones: number) => Array.from({ length: n }, (_, i) => ({ entryId: `e${i + 1}`, zoneId: `z${i % zones}` }));

describe('seedOrder', () => {
  it('cruces estándar', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('buildBracket', () => {
  it.each([[4, 4], [5, 8], [6, 8], [7, 8], [8, 8], [9, 16], [12, 16], [16, 16], [17, 32], [32, 32]])('%i clasificados → llave de %i, byes a los mejores seeds', (n, size) => {
    const b = buildBracket(quals(n, 1000));
    expect(b.size).toBe(size);
    const r1 = b.matches.filter((m) => m.round === 1);
    expect(r1.filter((m) => m.bye)).toHaveLength(size - n);
    // Los byes los tienen los seeds 1..(size-n).
    const byeEntries = r1.filter((m) => m.bye).map((m) => m.a ?? m.b).sort();
    expect(byeEntries).toEqual(Array.from({ length: size - n }, (_, i) => `e${i + 1}`).sort());
    // Los bye ya avanzaron a la ronda 2.
    for (const m of r1.filter((x) => x.bye)) expect(m.winner).toBe(m.a ?? m.b);
  });

  it('no cruza parejas de la misma zona en primera ronda (varios tamaños)', () => {
    for (const [zones, perZone] of [[2, 2], [3, 2], [4, 2], [4, 3], [6, 2], [8, 2], [8, 3]] as const) {
      const qs = seedQualifiers(
        Array.from({ length: zones * perZone }, (_, i) => ({ entryId: `e${i}`, zoneId: `z${i % zones}`, zonePosition: Math.floor(i / zones) + 1 })),
        mulberry32(3),
      );
      const b = buildBracket(qs);
      for (const m of b.matches.filter((x) => x.round === 1 && x.a && x.b)) {
        const za = qs.find((q) => q.entryId === m.a)!.zoneId, zb = qs.find((q) => q.entryId === m.b)!.zoneId;
        expect(za, `${zones}x${perZone}`).not.toBe(zb);
      }
    }
  });

  it('avanza ganadores hasta el campeón y calcula la ronda alcanzada', () => {
    let b: Bracket = buildBracket(quals(6, 6)); // 8: e1 y e2 con bye
    const play = (round: number, position: number, w: string) => { b = advance(b, round, position, w); };
    const r1 = b.matches.filter((m) => m.round === 1 && !m.bye);
    for (const m of r1) play(1, m.position, m.a!); // gana el seed mejor ubicado
    for (const m of b.matches.filter((x) => x.round === 2)) play(2, m.position, m.a!);
    const final = b.matches.find((m) => m.round === 3)!;
    play(3, 0, final.a!);
    const reached = roundsReached(b);
    expect([...reached.values()].filter((v) => v === 'champion')).toHaveLength(1);
    expect([...reached.values()].filter((v) => v === 'final')).toHaveLength(1);
    expect([...reached.values()].filter((v) => v === 'semifinal')).toHaveLength(2);
    expect([...reached.values()].filter((v) => v === 'quarterfinal')).toHaveLength(2); // 8 → cuatro pares en 1ª ronda, 2 byes
  });

  it('un ganador que no juega ese cruce falla', () => {
    const b = buildBracket(quals(4, 4));
    expect(() => advance(b, 1, 0, 'nadie')).toThrow();
  });
});

describe('puntos', () => {
  it('100 → 60/36/18/9/4,5 redondeado a entero y mitad por ronda más atrás', () => {
    const t = roundPoints(100);
    expect([t.champion, t.final, t.semifinal, t.quarterfinal, t.round_of_16, t.round_of_32, t.round_of_64]).toEqual([100, 60, 36, 18, 9, 5, 2]);
  });
  it('200 y 1000', () => {
    expect(roundPoints(200)).toMatchObject({ final: 120, semifinal: 72, quarterfinal: 36, round_of_16: 18, round_of_32: 9 });
    expect(roundPoints(1000)).toMatchObject({ final: 600, semifinal: 360, quarterfinal: 180, round_of_16: 90, round_of_32: 45, round_of_64: 23 });
  });
  it('el club ajusta puntos de una ronda', () => {
    expect(roundPoints(100, { overrides: { semifinal: 40 } }).semifinal).toBe(40);
  });
  it('piso de participación: max(participación, ronda); sin ronda = participación', () => {
    const t = roundPoints(100);
    expect(playerPoints(t, 5, 'round_of_32')).toBe(5);
    expect(playerPoints(t, 10, 'round_of_32')).toBe(10);
    expect(playerPoints(t, 5, 'final')).toBe(60);
    expect(playerPoints(t, 5, null)).toBe(5);
    expect(playerPoints(t, 0, null)).toBe(0);
  });
});

const P = (category: number | null, gender: 'male' | 'female' = 'male'): PairPlayer => ({ category, gender });

describe('elegibilidad', () => {
  const single6 = { kind: 'single', value: 6 } as const;
  it('categoría única', () => {
    expect(validatePair({ rule: single6, modality: 'libre' }, P(6), P(6, 'female'))).toEqual({ ok: true });
    expect(validatePair({ rule: single6, modality: 'libre' }, P(6), P(7))).toEqual({ ok: false, reason: 'category_mismatch' });
  });
  it('suma 13: 6ta + 7ma entra, 5ta + 7ma no', () => {
    const r = { kind: 'sum', value: 13 } as const;
    expect(validatePair({ rule: r, modality: 'libre' }, P(6), P(7))).toEqual({ ok: true });
    expect(validatePair({ rule: r, modality: 'libre' }, P(5), P(7))).toEqual({ ok: false, reason: 'sum_too_low' });
    expect(validatePair({ rule: r, modality: 'libre' }, P(8), P(9))).toEqual({ ok: true });
  });
  it('jugador sin categoría no es elegible', () => {
    expect(validatePair({ rule: single6, modality: 'libre' }, P(null), P(6))).toEqual({ ok: false, reason: 'no_category' });
  });
  it('modalidades', () => {
    const rule = { kind: 'single', value: 6 } as const;
    expect(validatePair({ rule, modality: 'mixto' }, P(6, 'male'), P(6, 'female')).ok).toBe(true);
    expect(validatePair({ rule, modality: 'mixto' }, P(6, 'male'), P(6, 'male')).ok).toBe(false);
    expect(validatePair({ rule, modality: 'masculino' }, P(6, 'male'), P(6, 'male')).ok).toBe(true);
    expect(validatePair({ rule, modality: 'masculino' }, P(6, 'male'), P(6, 'female')).ok).toBe(false);
    expect(validatePair({ rule, modality: 'femenino' }, P(6, 'female'), P(6, 'female')).ok).toBe(true);
    expect(validatePair({ rule, modality: 'femenino' }, P(6, 'female'), P(6, 'male')).ok).toBe(false);
  });
});

describe('ventana del ranking', () => {
  const now = new Date('2026-08-31T15:00:00Z');
  it('móvil, con límites inclusivos y fin de mes', () => {
    expect(windowStart(now, 'month')).toBe('2026-07-31');
    expect(windowStart(new Date('2026-03-31T00:00:00Z'), 'month')).toBe('2026-02-28');
    expect(windowStart(now, '6months')).toBe('2026-02-28');
    expect(windowStart(now, 'year')).toBe('2025-08-31');
    expect(windowStart(now, 'all')).toBeNull();
  });
  it('filtra por fecha de fin del torneo', () => {
    const rows = [{ endedOn: '2026-07-30' }, { endedOn: '2026-07-31' }, { endedOn: '2026-08-15' }];
    expect(filterByWindow(rows, windowStart(now, 'month'))).toHaveLength(2);
    expect(filterByWindow(rows, null)).toHaveLength(3);
  });
});
