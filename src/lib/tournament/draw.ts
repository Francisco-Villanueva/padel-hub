import { planZones, type ZonePlan } from './zones';
import { shuffle, type Rng } from './rng';

export interface DrawEntry { id: string; /** 1 = mejor cabeza de serie; null/undefined = sin serie. */ seed?: number | null }
export interface DrawnZone { index: number; size: 3 | 4; entryIds: string[] }

/**
 * Reparte las parejas en zonas. Las cabezas de serie van en serpentina (1ª vuelta de izquierda a derecha, 2ª al revés…)
 * respetando el tamaño de cada zona; el resto se sortea sobre los lugares libres.
 */
export function drawZones(entries: readonly DrawEntry[], plan: ZonePlan = planZones(entries.length), opts: { rng: Rng }): DrawnZone[] {
  if (entries.length !== plan.sizes.reduce((a, b) => a + b, 0)) throw new RangeError('plan_mismatch');
  const zones: DrawnZone[] = plan.sizes.map((size, index) => ({ index, size, entryIds: [] }));
  const seeded = entries.filter((e) => e.seed != null).sort((a, b) => a.seed! - b.seed! || a.id.localeCompare(b.id));
  let i = 0;
  let forward = true;
  while (i < seeded.length) {
    const order = forward ? zones : [...zones].reverse();
    for (const z of order) {
      if (i >= seeded.length) break;
      if (z.entryIds.length < z.size) z.entryIds.push(seeded[i++].id);
    }
    forward = !forward;
  }
  const rest = shuffle(entries.filter((e) => e.seed == null).map((e) => e.id), opts.rng);
  const slots = shuffle(zones.flatMap((z) => Array<number>(z.size - z.entryIds.length).fill(z.index)), opts.rng);
  slots.forEach((zi, k) => zones[zi].entryIds.push(rest[k]));
  return zones;
}

export interface ZoneMatchSpec {
  round: number;
  position: number;
  a: string | null;
  b: string | null;
  /** Solo en zonas de 4, 2ª ronda. */
  bracket?: 'winners' | 'losers';
}

/**
 * Partidos de una zona. Zona de 3: todos contra todos (A-B, A-C, B-C). Zona de 4: la 1ª ronda queda definida
 * y la 2ª (ganadores vs ganadores, perdedores vs perdedores) se completa con resolveFourZoneRound2().
 */
export function zoneMatchPlan(entryIds: readonly string[]): ZoneMatchSpec[] {
  if (entryIds.length === 3) {
    const [A, B, C] = entryIds;
    return [{ round: 1, position: 1, a: A, b: B }, { round: 2, position: 1, a: A, b: C }, { round: 3, position: 1, a: B, b: C }];
  }
  if (entryIds.length === 4) {
    const [p1, p2, p3, p4] = entryIds;
    return [
      { round: 1, position: 1, a: p1, b: p2 }, { round: 1, position: 2, a: p3, b: p4 },
      { round: 2, position: 1, a: null, b: null, bracket: 'winners' }, { round: 2, position: 2, a: null, b: null, bracket: 'losers' },
    ];
  }
  throw new RangeError('zone_size');
}

/** Con los resultados de la 1ª ronda de una zona de 4, define los dos partidos de la 2ª (a la misma hora). */
export function resolveFourZoneRound2(r1: [{ winner: string; loser: string }, { winner: string; loser: string }]): ZoneMatchSpec[] {
  return [
    { round: 2, position: 1, a: r1[0].winner, b: r1[1].winner, bracket: 'winners' },
    { round: 2, position: 2, a: r1[0].loser, b: r1[1].loser, bracket: 'losers' },
  ];
}
