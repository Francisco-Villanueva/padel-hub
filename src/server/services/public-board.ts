// Vista pública de un torneo (televisor del club y jugadores). Va por withPlatform() y funciones SECURITY DEFINER (0011, 0016):
// nunca toca las tablas, no devuelve nada si el club está suspendido, sin el flag, o el torneo no está en juego / cerrado,
// y solo expone apellidos de la pareja, zona, horario, estado y resultado.
import { sql } from 'drizzle-orm';
import type { BoardMatch, DrawMatch, PublicDraw } from '../../lib/tournament/board';
import { zoneStandings } from '../../lib/tournament/standings';
import { decodeSlot } from '../../lib/tournament/template';
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

const NO_DRAW: PublicDraw = { zones: [], bracket: [] };

/** Zonas (con sus posiciones, calculadas igual que en el panel del club) y cuadro de cruces, para la vista pública (0016). */
export async function publicTournamentDraw(tx: Tx, slug: string, id: string): Promise<PublicDraw> {
  if (!SLUG.test(slug) || !UUID.test(id)) return NO_DRAW;
  const pairs = rowsOf<{ entry_ref: number; pair_name: string; zone_position: number | null; zone_name: string | null; zone_size: number | null; draw_position: number | null }>(
    await tx.execute(sql`select * from public_tournament_pairs(${slug}, ${id}::uuid)`));
  const matches = rowsOf<{
    stage: 'zona' | 'llave'; zone_position: number | null; round: number; match_position: number; scheduled_at: string | Date | null; status: DrawMatch['status'];
    ref_a: number | null; ref_b: number | null; sets: [number, number][] | null; winner: 'a' | 'b' | null; source_a: string | null; source_b: string | null;
  }>(await tx.execute(sql`select * from public_tournament_matches(${slug}, ${id}::uuid)`));

  // La referencia con ceros a la izquierda ordena igual que el id original: el orden provisorio de la tabla queda como en el panel.
  const key = (ref: number | null) => (ref === null ? null : String(ref).padStart(5, '0'));
  const names = new Map(pairs.map((p) => [key(Number(p.entry_ref))!, p.pair_name]));
  const nameOf = (ref: number | null) => (ref === null ? null : names.get(key(ref)!) ?? null);
  const zoneNames = new Map(pairs.filter((p) => p.zone_position !== null).map((p) => [Number(p.zone_position), p.zone_name!]));
  const slot = (ref: number | null, src: string | null) => {
    const d = ref === null ? decodeSlot(src) : null;
    const zone = d ? zoneNames.get(d.zone + 1) : null;
    return d && zone ? { zone, position: d.position } : null;
  };
  const toMatch = (m: (typeof matches)[number]): DrawMatch => ({
    id: `${m.stage}-${m.zone_position ?? 0}-${m.round}-${m.match_position}`, round: Number(m.round), position: Number(m.match_position),
    scheduledAt: m.scheduled_at ? new Date(m.scheduled_at) : null, status: m.status, sets: m.sets, winner: m.winner,
    nameA: nameOf(m.ref_a), nameB: nameOf(m.ref_b), srcA: slot(m.ref_a, m.source_a), srcB: slot(m.ref_b, m.source_b),
  });

  const zones = [...zoneNames.keys()].sort((a, b) => a - b).map((position) => {
    const members = pairs.filter((p) => p.zone_position !== null && Number(p.zone_position) === position);
    const rows = matches.filter((m) => m.stage === 'zona' && Number(m.zone_position) === position);
    const draw = members.filter((p) => p.draw_position !== null).sort((a, b) => Number(a.draw_position) - Number(b.draw_position)).map((p) => key(Number(p.entry_ref))!);
    const standings = zoneStandings(
      Number(members[0].zone_size) as 3 | 4,
      members.map((p) => key(Number(p.entry_ref))!),
      rows.map((m) => ({
        round: Number(m.round), position: Number(m.match_position), a: key(m.ref_a), b: key(m.ref_b), sets: m.sets,
        winner: m.winner ? key(m.winner === 'a' ? m.ref_a : m.ref_b) : null,
      })),
      { draw: draw.length ? draw : undefined },
    );
    return {
      name: zoneNames.get(position)!, complete: standings.complete, drawn: draw.length > 0,
      standings: standings.rows.map((r) => ({ ...r, name: names.get(r.entryId)! })),
      matches: rows.map(toMatch),
    };
  });
  return { zones, bracket: matches.filter((m) => m.stage === 'llave').map(toMatch) };
}
