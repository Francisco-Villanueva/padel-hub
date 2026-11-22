import { shuffle, type Rng } from './rng';

export interface Qualifier {
  entryId: string;
  zoneId: string;
  /** Posición en su zona (1 = primero). */
  zonePosition: number;
  /** Cabeza de serie del torneo (ranking); null = sin serie. */
  rankingSeed?: number | null;
  gameDiff?: number;
}

/** Ordena a los clasificados de mejor a peor: primeros de zona, luego segundos…; dentro, ranking, diferencia de games y sorteo. */
export function seedQualifiers(qs: readonly Qualifier[], rng: Rng): Qualifier[] {
  const tie = new Map(shuffle(qs.map((q) => q.entryId), rng).map((id, i) => [id, i]));
  return [...qs].sort((a, b) =>
    a.zonePosition - b.zonePosition
    || (a.rankingSeed ?? Infinity) - (b.rankingSeed ?? Infinity)
    || (b.gameDiff ?? 0) - (a.gameDiff ?? 0)
    || tie.get(a.entryId)! - tie.get(b.entryId)!);
}

export interface BracketMatch {
  /** 1 = primera ronda. */
  round: number;
  position: number;
  a: string | null;
  b: string | null;
  bye: boolean;
  winner: string | null;
  next: { round: number; position: number; slot: 'a' | 'b' } | null;
}
export interface Bracket { size: number; rounds: number; matches: BracketMatch[] }

const nextPow2 = (n: number) => { let s = 2; while (s < n) s *= 2; return s; };

/** Orden estándar de cruces: 1 vs último, 2 vs penúltimo…, con los mejores seeds en mitades opuestas. */
export function seedOrder(size: number): number[] {
  let o = [1];
  while (o.length < size) { const n = o.length * 2; o = o.flatMap((s) => [s, n + 1 - s]); }
  return o;
}

/** Cantidad de participantes de una ronda (2 = final, 4 = semifinal…). */
export const participantsInRound = (b: Bracket, round: number) => b.size / 2 ** (round - 1);

type Slot = { entryId: string; zoneId: string; seed: number };

/**
 * Arma la llave con `seeded` ordenado de mejor a peor. Tamaño = próxima potencia de 2; los mejores seeds reciben los byes
 * (que avanzan solos). En 1ª ronda se evita enfrentar parejas de la misma zona intercambiando con otro cruce.
 */
export function buildBracket(seeded: readonly { entryId: string; zoneId: string }[]): Bracket {
  const n = seeded.length;
  if (n < 2) throw new RangeError('bracket_min');
  const size = nextPow2(n);
  const rounds = Math.log2(size);
  const slots: (Slot | null)[] = seedOrder(size).map((s) => (s <= n ? { ...seeded[s - 1], seed: s } : null));
  const pairs = size / 2;
  const real = (p: number) => slots[2 * p] !== null && slots[2 * p + 1] !== null;
  const clash = (p: number) => real(p) && slots[2 * p]!.zoneId === slots[2 * p + 1]!.zoneId;
  const mate = (i: number) => (i % 2 === 0 ? i + 1 : i - 1);

  for (let p = 0; p < pairs; p++) {
    if (!clash(p)) continue;
    let done = false;
    for (const mine of [2 * p + 1, 2 * p]) {
      const partner = slots[mate(mine)]!;
      const cands: number[] = [];
      for (let q = 0; q < pairs; q++) if (q !== p && real(q)) cands.push(2 * q, 2 * q + 1);
      cands.sort((x, y) => Math.abs(slots[x]!.seed - slots[mine]!.seed) - Math.abs(slots[y]!.seed - slots[mine]!.seed) || x - y);
      for (const c of cands) {
        const other = slots[mate(c)]!;
        if (slots[c]!.zoneId !== partner.zoneId && slots[mine]!.zoneId !== other.zoneId) {
          [slots[mine], slots[c]] = [slots[c], slots[mine]];
          done = true;
          break;
        }
      }
      if (done) break;
    }
  }

  const matches: BracketMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    for (let p = 0; p < size / 2 ** r; p++) {
      matches.push({
        round: r, position: p, a: null, b: null, bye: false, winner: null,
        next: r < rounds ? { round: r + 1, position: Math.floor(p / 2), slot: p % 2 === 0 ? 'a' : 'b' } : null,
      });
    }
  }
  let bracket: Bracket = { size, rounds, matches };
  for (let p = 0; p < pairs; p++) {
    const m = matches.find((x) => x.round === 1 && x.position === p)!;
    m.a = slots[2 * p]?.entryId ?? null;
    m.b = slots[2 * p + 1]?.entryId ?? null;
    m.bye = (m.a === null) !== (m.b === null);
  }
  for (let p = 0; p < pairs; p++) {
    const m = bracket.matches.find((x) => x.round === 1 && x.position === p)!;
    if (m.bye) bracket = advance(bracket, 1, p, (m.a ?? m.b)!);
  }
  return bracket;
}

/** Registra el ganador de un cruce y lo pasa al siguiente. Devuelve una llave nueva. */
export function advance(bracket: Bracket, round: number, position: number, winnerId: string): Bracket {
  const next = structuredClone(bracket);
  const m = next.matches.find((x) => x.round === round && x.position === position);
  if (!m) throw new RangeError('match_not_found');
  if (winnerId !== m.a && winnerId !== m.b) throw new RangeError('winner_not_in_match');
  m.winner = winnerId;
  if (m.next) {
    const target = next.matches.find((x) => x.round === m.next!.round && x.position === m.next!.position)!;
    target[m.next.slot] = winnerId;
  }
  return next;
}
