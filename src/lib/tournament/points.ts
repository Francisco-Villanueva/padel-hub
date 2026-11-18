import { DEFAULT_ROUND_PERCENTS, HALVE_BELOW, ROUND_KEYS, type RoundKey } from './constants';
import { participantsInRound, type Bracket } from './bracket';

export type RoundPoints = Record<RoundKey, number>;
export type RoundPercents = Record<RoundKey, number>;

/** Porcentajes por ronda: los de la tabla y, más profundo que 16vos, la mitad por ronda. */
export function defaultPercents(): RoundPercents {
  const out = {} as RoundPercents;
  let last = DEFAULT_ROUND_PERCENTS.round_of_32;
  for (const k of ROUND_KEYS) {
    if (k in DEFAULT_ROUND_PERCENTS) out[k] = DEFAULT_ROUND_PERCENTS[k as keyof typeof DEFAULT_ROUND_PERCENTS];
    else { last = HALVE_BELOW ? last / 2 : last; out[k] = last; }
  }
  return out;
}

/** Tabla de puntos por ronda: enteros (redondeo al más cercano). `overrides` = puntos absolutos que ajusta el club. */
export function roundPoints(champion: number, opts: { percents?: Partial<RoundPercents>; overrides?: Partial<RoundPoints> } = {}): RoundPoints {
  const pct = { ...defaultPercents(), ...opts.percents };
  const out = {} as RoundPoints;
  for (const k of ROUND_KEYS) out[k] = opts.overrides?.[k] ?? Math.round((champion * pct[k]) / 100);
  return out;
}

/** Piso: cada jugador recibe max(participación, puntos de la ronda alcanzada). Sin ronda (cayó en zona) = participación. */
export const playerPoints = (table: RoundPoints, participation: number, roundReached: RoundKey | null) =>
  Math.max(participation, roundReached ? table[roundReached] : 0);

export function roundKeyForParticipants(p: number): RoundKey {
  const i = Math.log2(p);
  if (!Number.isInteger(i) || i >= ROUND_KEYS.length) throw new RangeError('participants');
  return ROUND_KEYS[i];
}

/** Ronda alcanzada por cada pareja: la ronda donde perdió (perder la final = finalista) o 'champion'. Las que siguen en juego no aparecen. */
export function roundsReached(bracket: Bracket): Map<string, RoundKey> {
  const out = new Map<string, RoundKey>();
  for (const m of bracket.matches) {
    if (m.bye || !m.winner) continue;
    const loser = m.winner === m.a ? m.b : m.a;
    if (loser) out.set(loser, roundKeyForParticipants(participantsInRound(bracket, m.round)));
    if (m.round === bracket.rounds) out.set(m.winner, 'champion');
  }
  return out;
}
