import { MIN_PAIRS_FLOOR } from './constants';

export interface ZonePlan { threes: number; fours: number; sizes: (3 | 4)[] }

/** N = 3a + 4b con la menor cantidad de zonas de 4. Las de 3 van primero. Falla bajo el piso técnico. */
export function planZones(n: number): ZonePlan {
  if (!Number.isInteger(n) || n < MIN_PAIRS_FLOOR) throw new RangeError(`min_pairs:${MIN_PAIRS_FLOOR}`);
  // n%3 = 0 → ninguna de 4; 1 → una (n≥7); 2 → dos (n≥8). Con n≥6 siempre alcanza.
  const fours = n % 3 === 0 ? 0 : n % 3 === 1 ? 1 : 2;
  const threes = (n - 4 * fours) / 3;
  return { threes, fours, sizes: [...Array<3>(threes).fill(3), ...Array<4>(fours).fill(4)] };
}

export const qualifiersPerZone = (size: 3 | 4) => (size === 3 ? 2 : 3);
export const zoneName = (index: number) => `Zona ${String.fromCharCode(65 + (index % 26))}${index >= 26 ? Math.floor(index / 26) : ''}`;
