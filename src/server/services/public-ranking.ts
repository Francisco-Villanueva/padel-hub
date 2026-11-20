// Ranking público de un club. Va por withPlatform() y funciones SECURITY DEFINER (0009): nunca toca las tablas.
// Devuelve nada si el club está suspendido o no tiene activada la función de torneos.
import { sql } from 'drizzle-orm';
import type { CategoryRuleKind, Modality } from '../../lib/tournament/constants';
import { windowStart, type RankingWindow } from '../../lib/tournament/ranking-window';
import type { Tx } from '../db/tenant';

const rowsOf = <T>(res: unknown) => (res as { rows: T[] }).rows;
const SLUG = /^[a-z0-9-]{3,40}$/;

export interface PublicRankingClub { id: string; slug: string; name: string; locale: 'es' | 'en' | 'pt'; logoUrl: string | null; colorPrimary: string | null; colorAccent: string | null }
export interface PublicBucket { ruleKind: CategoryRuleKind; ruleValue: number; modality: Modality }
export interface PublicRankingRow { position: number; firstName: string; lastInitial: string; category: number | null; points: number; tournaments: number }

export async function publicRankingClub(tx: Tx, slug: string): Promise<PublicRankingClub | null> {
  if (!SLUG.test(slug)) return null;
  const r = rowsOf<{ id: string; slug: string; name: string; locale: 'es' | 'en' | 'pt'; logo_url: string | null; color_primary: string | null; color_accent: string | null }>(
    await tx.execute(sql`select * from public_ranking_club(${slug})`))[0];
  return r ? { id: r.id, slug: r.slug, name: r.name, locale: r.locale, logoUrl: r.logo_url, colorPrimary: r.color_primary, colorAccent: r.color_accent } : null;
}

export async function publicRankingBuckets(tx: Tx, slug: string): Promise<PublicBucket[]> {
  if (!SLUG.test(slug)) return [];
  const rows = rowsOf<{ rule_kind: CategoryRuleKind; rule_value: number; modality: Modality }>(await tx.execute(sql`select * from public_ranking_buckets(${slug})`));
  return rows.map((r) => ({ ruleKind: r.rule_kind, ruleValue: Number(r.rule_value), modality: r.modality }));
}

export async function publicRanking(tx: Tx, slug: string, g: PublicBucket, window: RankingWindow, now: Date = new Date()): Promise<PublicRankingRow[]> {
  if (!SLUG.test(slug)) return [];
  const since = windowStart(now, window);
  const rows = rowsOf<{ rank_pos: number; first_name: string; last_initial: string; category: number | null; points: number; tournaments: number }>(
    await tx.execute(sql`select * from public_ranking(${slug}, ${g.ruleKind}, ${g.ruleValue}::smallint, ${g.modality}, ${since}::date)`));
  return rows.map((r) => ({ position: Number(r.rank_pos), firstName: r.first_name, lastInitial: r.last_initial, category: r.category === null ? null : Number(r.category), points: Number(r.points), tournaments: Number(r.tournaments) }));
}
