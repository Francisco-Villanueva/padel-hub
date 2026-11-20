import { shuffle, type Rng } from './rng';
import { qualifiersPerZone } from './zones';

export interface ZoneMatchResult {
  round: number;
  position: number;
  a: string | null;
  b: string | null;
  winner: string | null;
  /** Games por set, [A, B]. */
  sets: [number, number][] | null;
}

export interface StandingRow {
  entryId: string;
  played: number;
  wins: number;
  gamesFor: number;
  gamesAgainst: number;
  gameDiff: number;
  /** 1-based; null mientras la zona no esté completa o falte un sorteo. */
  position: number | null;
  qualified: boolean;
}

export interface ZoneStandings {
  rows: StandingRow[];
  complete: boolean;
  /** Grupos de parejas empatadas que solo un sorteo puede ordenar (el servicio lo hace y lo persiste). */
  needsDraw: string[][];
}

const expectedMatches = (size: 3 | 4) => (size === 3 ? 3 : 4);

/** Orden del sorteo de desempate (se guarda con la semilla). */
export const drawTieOrder = (entryIds: readonly string[], rng: Rng) => shuffle(entryIds, rng);

/**
 * Posiciones de una zona.
 * Zona de 3: victorias; empate → 1) diferencia de games, 2) partido entre las dos empatadas, 3) sorteo (con tres empatadas
 * el partido entre ellas no desempata). Zona de 4: ganador de ganadores 1º; perdedor de ganadores y ganador de perdedores
 * se ordenan por diferencia de games (luego sorteo); el perdedor del partido de perdedores queda afuera.
 * `draw` = orden ya sorteado de las parejas que lo necesitaban.
 */
export function zoneStandings(size: 3 | 4, entryIds: readonly string[], matches: readonly ZoneMatchResult[], opts: { draw?: readonly string[] } = {}): ZoneStandings {
  const stats = new Map<string, StandingRow>(entryIds.map((id) => [id, { entryId: id, played: 0, wins: 0, gamesFor: 0, gamesAgainst: 0, gameDiff: 0, position: null, qualified: false }]));
  const decided = matches.filter((m) => m.winner && m.a && m.b);
  for (const m of decided) {
    const a = stats.get(m.a!), b = stats.get(m.b!);
    if (!a || !b) continue;
    const ga = (m.sets ?? []).reduce((s, x) => s + x[0], 0), gb = (m.sets ?? []).reduce((s, x) => s + x[1], 0);
    a.played++; b.played++;
    a.gamesFor += ga; a.gamesAgainst += gb; b.gamesFor += gb; b.gamesAgainst += ga;
    (m.winner === m.a ? a : b).wins++;
  }
  for (const r of stats.values()) r.gameDiff = r.gamesFor - r.gamesAgainst;
  const complete = matches.length === expectedMatches(size) && decided.length === matches.length;
  const rows = [...stats.values()].sort((x, y) => y.wins - x.wins || y.gameDiff - x.gameDiff || x.entryId.localeCompare(y.entryId));
  const needsDraw: string[][] = [];
  if (!complete) return { rows, complete, needsDraw };

  const h2h = (x: string, y: string) => decided.find((m) => (m.a === x && m.b === y) || (m.a === y && m.b === x))?.winner ?? null;
  const drawIdx = (id: string) => (opts.draw ? opts.draw.indexOf(id) : -1);

  // Ordena un grupo ya empatado en el criterio anterior.
  const tieBreak = (group: StandingRow[]): StandingRow[] => {
    if (group.length === 1) return group;
    const byDiff = new Map<number, StandingRow[]>();
    for (const r of group) byDiff.set(r.gameDiff, [...(byDiff.get(r.gameDiff) ?? []), r]);
    return [...byDiff.entries()].sort((p, q) => q[0] - p[0]).flatMap(([, sub]) => {
      if (sub.length === 1) return sub;
      if (sub.length === 2) {
        const w = h2h(sub[0].entryId, sub[1].entryId);
        if (w) return w === sub[0].entryId ? sub : [sub[1], sub[0]];
      }
      const ids = sub.map((r) => r.entryId);
      if (ids.every((id) => drawIdx(id) >= 0)) return [...sub].sort((p, q) => drawIdx(p.entryId) - drawIdx(q.entryId));
      needsDraw.push([...ids].sort());
      return [...sub].sort((p, q) => p.entryId.localeCompare(q.entryId));
    });
  };

  let ordered: StandingRow[];
  if (size === 3) {
    const byWins = new Map<number, StandingRow[]>();
    for (const r of rows) byWins.set(r.wins, [...(byWins.get(r.wins) ?? []), r]);
    ordered = [...byWins.entries()].sort((p, q) => q[0] - p[0]).flatMap(([, g]) => tieBreak(g));
  } else {
    const wm = matches.find((m) => m.round === 2 && m.position === 1)!;
    const lm = matches.find((m) => m.round === 2 && m.position === 2)!;
    const wLoser = wm.winner === wm.a ? wm.b! : wm.a!;
    const lWinner = lm.winner!;
    const lLoser = lm.winner === lm.a ? lm.b! : lm.a!;
    const get = (id: string) => stats.get(id)!;
    ordered = [get(wm.winner!), ...tieBreak([get(wLoser), get(lWinner)]), get(lLoser)];
  }

  const tied = new Set(needsDraw.flat());
  const q = qualifiersPerZone(size);
  ordered.forEach((r, i) => {
    // Un empate pendiente de sorteo deja sin posición firme a las parejas involucradas.
    r.position = tied.has(r.entryId) ? null : i + 1;
    r.qualified = r.position !== null && r.position <= q;
  });
  return { rows: ordered, complete, needsDraw };
}
