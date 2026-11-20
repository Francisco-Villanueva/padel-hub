export type RankingWindow = 'month' | '6months' | 'year' | 'all';
export const RANKING_WINDOWS: readonly RankingWindow[] = ['month', '6months', 'year', 'all'];
/** Supuestos 1 y 2: ventanas móviles; por defecto y para sembrar, histórico. */
export const DEFAULT_RANKING_WINDOW: RankingWindow = 'all';

const MONTHS: Record<Exclude<RankingWindow, 'all'>, number> = { month: 1, '6months': 6, year: 12 };

/** Inicio (YYYY-MM-DD, inclusive) de la ventana móvil que termina en `now`; null = histórico. Usa UTC y ajusta fin de mes. */
export function windowStart(now: Date, window: RankingWindow): string | null {
  if (window === 'all') return null;
  const y = now.getUTCFullYear(), m = now.getUTCMonth() - MONTHS[window], d = now.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** `endedOn`: fecha de fin del torneo (YYYY-MM-DD). Compara como texto ISO. */
export const filterByWindow = <T extends { endedOn: string }>(rows: readonly T[], start: string | null): T[] =>
  start ? rows.filter((r) => r.endedOn >= start) : [...rows];
