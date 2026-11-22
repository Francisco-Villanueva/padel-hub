import 'server-only';
import { cacheLife } from 'next/cache';
import { CATEGORY_RULE_KINDS, MODALITIES } from '../../lib/tournament/constants';
import { DEFAULT_RANKING_WINDOW, RANKING_WINDOWS, type RankingWindow } from '../../lib/tournament/ranking-window';
import { withPlatform } from '../db/client';
import { publicRanking, publicRankingBuckets, publicRankingClub, type PublicBucket } from './public-ranking';
import { publicTournamentBoard, publicTournamentInfo } from './public-board';

// Datos de las páginas públicas (ranking y tablero del televisor). Son iguales para todos los visitantes y se piden mucho
// (cada televisor se actualiza solo), así que se cachean unos segundos en el servidor en vez de ir a la base en cada request.
// Solo reciben valores primitivos ya validados: son la clave de caché. Nunca se lee nada de la sesión acá adentro.

export const bucketKey = (g: PublicBucket) => `${g.ruleKind}-${g.ruleValue}-${g.modality}`;

/** Normaliza el grupo pedido en la URL ("sum-12-masculino"): lo que no es válido queda vacío (y se usa el primero). */
export function wantedGroup(raw: string | undefined): string {
  const [kind, value, modality] = (raw ?? '').split('-');
  const n = Number(value);
  return CATEGORY_RULE_KINDS.some((k) => k === kind) && MODALITIES.some((m) => m === modality) && Number.isInteger(n) && n >= 0 && n <= 99 ? `${kind}-${n}-${modality}` : '';
}

export function wantedWindow(raw: string | undefined): RankingWindow {
  return RANKING_WINDOWS.find((w) => w === raw) ?? DEFAULT_RANKING_WINDOW;
}

export async function loadPublicRanking(slug: string, wanted: string, window: RankingWindow) {
  'use cache';
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  // 404 si el club no existe, está suspendido o no tiene torneos activados (lo decide la función SQL).
  const [club, buckets] = await Promise.all([
    withPlatform((tx) => publicRankingClub(tx, slug)),
    withPlatform((tx) => publicRankingBuckets(tx, slug)),
  ]);
  if (!club) return null;
  const group = buckets.find((b) => bucketKey(b) === wanted) ?? buckets[0] ?? null;
  const rows = group ? await withPlatform((tx) => publicRanking(tx, slug, group, window)) : [];
  return { club, buckets, group, rows };
}

export async function loadPublicBoard(slug: string, id: string) {
  'use cache';
  // El club carga resultados en vivo: el tablero se renueva cada pocos segundos.
  cacheLife({ stale: 10, revalidate: 10, expire: 120 });
  const [club, info] = await Promise.all([
    withPlatform((tx) => publicRankingClub(tx, slug)),
    withPlatform((tx) => publicTournamentInfo(tx, slug, id)),
  ]);
  if (!club || !info) return null;
  const matches = await withPlatform((tx) => publicTournamentBoard(tx, slug, id));
  return { club, info, matches };
}
