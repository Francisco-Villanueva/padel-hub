import { describe, expect, it } from 'vitest';
import { buildTemplate, decodeSlot, encodeSlot, seedSlots, type SlotRef } from '../src/lib/tournament/template';
import { MIN_PAIRS_FLOOR, planZones } from '../src/lib/tournament';

const L = (i: number) => String.fromCharCode(65 + i);
const label = (s: SlotRef | null) => (s ? `${s.position}${L(s.zone)}` : null);
/** Cruces de primera ronda como conjuntos de etiquetas ("2B-2C"), sin importar el orden dentro del cruce. */
const r1 = (sizes: (3 | 4)[]) => buildTemplate(sizes).matches.filter((m) => m.round === 1 && !m.bye).map((m) => [label(m.a)!, label(m.b)!].sort().join('-')).sort();
const byes = (sizes: (3 | 4)[]) => buildTemplate(sizes).matches.filter((m) => m.round === 1 && m.bye).map((m) => label(m.a ?? m.b)!).sort();

describe('siembra en serpentina', () => {
  it('primeros en orden, segundos al revés, terceros en orden', () => {
    expect(seedSlots([4, 4, 3, 3, 3]).map(label)).toEqual(['1A', '1B', '1C', '1D', '1E', '2E', '2D', '2C', '2B', '2A', '3A', '3B']);
  });
});

describe('plantilla de llave: casos de Zonea', () => {
  it('7ma libre: 7 zonas de 3 → 14 clasificados, llave de 16, 2 libres (1A y 1B)', () => {
    const sizes = Array(7).fill(3) as 3[];
    expect(buildTemplate(sizes).size).toBe(16);
    expect(byes(sizes)).toEqual(['1A', '1B']);
    expect(r1(sizes)).toEqual(['1C-2A', '1D-2B', '1E-2C', '1F-2D', '1G-2E', '2F-2G']);
  });
  it('5ta damas: zonas A y B de 4, C, D y E de 3 → 12 clasificados, 4 libres', () => {
    const sizes: (3 | 4)[] = [4, 4, 3, 3, 3];
    expect(byes(sizes)).toEqual(['1A', '1B', '1C', '1D']);
    expect(r1(sizes)).toEqual(['1E-3B', '2B-2C', '2D-2A'.split('-').sort().join('-'), '2E-3A'].sort());
  });
  it('las capturas ubican 1A y 1B en lados opuestos', () => {
    for (const sizes of [[3, 3, 3, 3, 3, 3, 3], [4, 4, 3, 3, 3]] as (3 | 4)[][]) {
      const t = buildTemplate(sizes);
      const flat = t.matches.filter((m) => m.round === 1).flatMap((m) => [m.a, m.b]);
      const half = flat.length / 2;
      const idx = (l: string) => flat.findIndex((s) => label(s) === l);
      expect(idx('1A') < half).not.toBe(idx('1B') < half);
    }
  });
});

describe('plantilla de llave: propiedades para cualquier cantidad de zonas', () => {
  // Zonas de 4 primero (A, B…) y después de 3, de 2 a 14 zonas; solo configuraciones con al menos 6 parejas.
  const configs: (3 | 4)[][] = [];
  for (let z = 2; z <= 14; z++) for (let f = 0; f <= z; f++) {
    const sizes = [...Array(f).fill(4), ...Array(z - f).fill(3)] as (3 | 4)[];
    if (sizes.reduce((a, b) => a + b, 0) >= MIN_PAIRS_FLOOR) configs.push(sizes);
  }

  it.each(configs.map((c) => [c.join(','), c] as const))('zonas %s', (_n, sizes) => {
    const t = buildTemplate(sizes);
    const q = sizes.reduce((n, s) => n + (s === 3 ? 2 : 3), 0);
    const r1m = t.matches.filter((m) => m.round === 1);
    const flat = r1m.flatMap((m) => [m.a, m.b]);
    // Tamaño: próxima potencia de 2; todos los puestos aparecen una sola vez; libres = tamaño − clasificados.
    expect(t.size).toBe(2 ** Math.ceil(Math.log2(q)));
    const labels = flat.filter(Boolean).map(label);
    expect(labels).toHaveLength(q);
    expect(new Set(labels).size).toBe(q);
    expect(r1m.filter((m) => m.bye)).toHaveLength(t.size - q);
    // Los libres son de los mejores puestos de la siembra.
    const bye = r1m.filter((m) => m.bye).map((m) => (m.a ?? m.b)!);
    const rank = new Map(t.seeds.map((s, i) => [label(s), i]));
    const worstBye = Math.max(-1, ...bye.map((s) => rank.get(label(s))!));
    const bestNonBye = Math.min(Infinity, ...r1m.filter((m) => !m.bye).flatMap((m) => [m.a!, m.b!]).filter((s) => s.position === 1).map((s) => rank.get(label(s))!));
    expect(worstBye).toBeLessThan(Math.max(bestNonBye, t.size));
    // Nadie se cruza con su propia zona en primera ronda.
    for (const m of r1m) if (m.a && m.b) expect(m.a.zone).not.toBe(m.b.zone);
    // El 1º y el 2º de cada zona quedan en mitades opuestas.
    const half = flat.length / 2;
    for (let z = 0; z < sizes.length; z++) {
      const i1 = flat.findIndex((s) => s && s.zone === z && s.position === 1), i2 = flat.findIndex((s) => s && s.zone === z && s.position === 2);
      expect(i1 < half).not.toBe(i2 < half);
    }
    // 1A y 1B (las mejores cabezas de serie) en mitades opuestas.
    if (sizes.length >= 2) expect(flat.findIndex((s) => label(s) === '1A') < half).not.toBe(flat.findIndex((s) => label(s) === '1B') < half);
  });

  it('es determinística y cada cruce apunta al siguiente', () => {
    const a = buildTemplate([4, 3, 3, 3, 3, 3]), b = buildTemplate([4, 3, 3, 3, 3, 3]);
    expect(a).toEqual(b);
    const last = a.matches.find((m) => m.round === a.rounds)!;
    expect(last.next).toBeNull();
    for (const m of a.matches.filter((x) => x.round < a.rounds)) expect(a.matches.some((n) => n.round === m.next!.round && n.position === m.next!.position)).toBe(true);
  });

  it('coincide con el sorteo de zonas: con 8 zonas de 3 ninguna se cruza consigo misma', () => {
    expect(r1(Array(8).fill(3) as 3[])).toHaveLength(8);
  });
});

describe('zonas de 4 primero', () => {
  it('planZones deja las zonas de 4 al principio (A, B…)', () => {
    expect(planZones(7).sizes).toEqual([4, 3]);
    expect(planZones(10).sizes).toEqual([4, 3, 3]);
    expect(planZones(11).sizes).toEqual([4, 4, 3]);
    expect(planZones(13).sizes).toEqual([4, 3, 3, 3]);
  });
});

describe('códigos de origen', () => {
  it('ida y vuelta', () => {
    expect(encodeSlot({ zone: 0, position: 1 })).toBe('1:1');
    expect(decodeSlot(encodeSlot({ zone: 4, position: 3 }))).toEqual({ zone: 4, position: 3 });
    expect(decodeSlot(null)).toBeNull();
    expect(decodeSlot('x')).toBeNull();
  });
});
