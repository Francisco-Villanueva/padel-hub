// Tablero público de un torneo (televisor del club y jugadores). Va por withPlatform() y funciones SECURITY DEFINER (0011):
// nunca toca las tablas, no devuelve nada si el club está suspendido, sin el flag, o el torneo no está en juego / cerrado,
// y solo expone apellidos de la pareja, zona, horario, estado y resultado.
import { sql } from 'drizzle-orm';
import type { BoardMatch } from '../../lib/tournament/board';
import type { Tx } from '../db/tenant';

const rowsOf = <T>(res: unknown) => (res as { rows: T[] }).rows;
const SLUG = /^[a-z0-9-]{3,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type { BoardMatch };

export interface BoardInfo { name: string; status: 'zonas' | 'llave' | 'cerrado'; modality: string; ruleKind: string; ruleValue: number; startsOn: string; timezone: string }
export async function publicTournamentInfo(tx: Tx, slug: string, id: string): Promise<BoardInfo | null> {
  if (!SLUG.test(slug) || !UUID.test(id)) return null;
  const r = rowsOf<{ name: string; status: BoardInfo['status']; modality: string; rule_kind: string; rule_value: number; starts_on: string | Date; timezone: string }>(
    await tx.execute(sql`select * from public_tournament_info(${slug}, ${id}::uuid)`))[0];
  if (!r) return null;
  const startsOn = r.starts_on instanceof Date ? r.starts_on.toISOString().slice(0, 10) : String(r.starts_on).slice(0, 10);
  return { name: r.name, status: r.status, modality: r.modality, ruleKind: r.rule_kind, ruleValue: Number(r.rule_value), startsOn, timezone: r.timezone };
}

export async function publicTournamentBoard(tx: Tx, slug: string, id: string): Promise<BoardMatch[]> {
  if (!SLUG.test(slug) || !UUID.test(id)) return [];
  const rows = rowsOf<{
    stage: 'zona' | 'llave'; zone_name: string | null; round: number; match_position: number; max_round: number | null; scheduled_at: string | Date | null;
    status: BoardMatch['status']; name_a: string | null; name_b: string | null; sets: [number, number][] | null; winner: 'a' | 'b' | null;
    src_a_zone: string | null; src_a_pos: number | null; src_b_zone: string | null; src_b_pos: number | null;
  }>(await tx.execute(sql`select * from public_tournament_board(${slug}, ${id}::uuid)`));
  return rows.map((r) => ({
    stage: r.stage, zoneName: r.zone_name, round: Number(r.round), position: Number(r.match_position), maxRound: r.max_round === null ? null : Number(r.max_round),
    scheduledAt: r.scheduled_at ? new Date(r.scheduled_at) : null, status: r.status, nameA: r.name_a, nameB: r.name_b, sets: r.sets, winner: r.winner,
    srcA: r.src_a_zone && r.src_a_pos ? { zone: r.src_a_zone, position: Number(r.src_a_pos) } : null,
    srcB: r.src_b_zone && r.src_b_pos ? { zone: r.src_b_zone, position: Number(r.src_b_pos) } : null,
  }));
}
