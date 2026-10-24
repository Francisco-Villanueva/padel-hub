// Exportación de jugadores a CSV. Solo el dueño (se valida en la acción) y siempre queda en audit_log.
import { and, asc, isNull } from 'drizzle-orm';
import type { PlayerFilters } from '../../lib/player-schema';
import { auditLog, players } from '../db/schema';
import type { Tx } from '../db/tenant';
import { whereFor } from './players';

export interface ExportRow {
  firstName: string; lastName: string; gender: string; category: string; position: string; slots: string;
  phone: string; instagram: string; locality: string; source: string; createdAt: string;
}

/** Celdas que Excel o Sheets interpretarían como fórmula se neutralizan con un apóstrofo (inyección de fórmulas). */
export function csvCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV con BOM (para que Excel respete los acentos) y saltos CRLF. `labels` son los encabezados ya traducidos. */
export function buildCsv(rows: ExportRow[], includePhones: boolean, labels: Record<keyof ExportRow, string>): string {
  const cols = (Object.keys(labels) as (keyof ExportRow)[]).filter((k) => includePhones || k !== 'phone');
  const lines = [cols.map((c) => csvCell(labels[c])).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export interface ExportScope { filters?: Partial<PlayerFilters>; includePhones: boolean }

/** Va dentro de withTenant(). Registra quién exportó, cuántos y con qué alcance. */
export async function exportPlayers(
  tx: Tx,
  ctx: { clubId: string; userId: string },
  scope: ExportScope,
  describe: { category: (level: number) => string; enums: (kind: 'gender' | 'position' | 'slot' | 'source', v: string) => string },
): Promise<ExportRow[]> {
  const w = scope.filters ? whereFor(scope.filters) : and(isNull(players.deletedAt))!;
  const rows = await tx.select().from(players).where(w)
    .orderBy(asc(players.lastName), asc(players.firstName), asc(players.id));

  await tx.insert(auditLog).values({
    clubId: ctx.clubId, userId: ctx.userId, action: 'players.export',
    detail: { count: rows.length, includePhones: scope.includePhones, filtered: Boolean(scope.filters) },
  });

  return rows.map((p) => ({
    firstName: p.firstName, lastName: p.lastName, gender: describe.enums('gender', p.gender),
    category: p.category !== null ? describe.category(p.category) : '',
    position: p.position ? describe.enums('position', p.position) : '',
    slots: p.slots.map((s) => describe.enums('slot', s)).join(' / '),
    phone: p.phoneE164, instagram: p.instagram ?? '', locality: p.locality ?? '',
    source: describe.enums('source', p.source), createdAt: p.createdAt.toISOString().slice(0, 10),
  }));
}
