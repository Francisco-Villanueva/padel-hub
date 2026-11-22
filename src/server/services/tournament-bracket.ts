// Llave del torneo como plantilla: se crea al iniciar las zonas con lugares "1º de la Zona A", "2º de la Zona B"… (lib/tournament/template)
// y se completa sola, zona por zona, a medida que cada una termina. Todo se puede ajustar a mano (tournament-adjust.ts).
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { buildTemplate, encodeSlot } from '../../lib/tournament/template';
import { tournamentMatches, tournaments, tournamentZones } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';
import { TournamentError } from './tournament-errors';
import { zoneStatesRaw } from './tournament-zones';

type Ctx = { clubId: string };
type Match = typeof tournamentMatches.$inferSelect;

/** El partido ya empezó o se jugó: no se le pueden cambiar las parejas sin deshacerlo primero. */
export const isStarted = (m: Pick<Match, 'status' | 'winnerEntryId'>) => m.status === 'jugado' || m.status === 'en_juego' || (m.status !== 'bye' && Boolean(m.winnerEntryId));

/** Crea los partidos de la llave (vacíos, con su origen) según el tamaño de las zonas ya creadas. */
export async function createBracketTemplate(tx: Tx, ctx: Ctx, tournamentId: string) {
  const zones = await tx.select().from(tournamentZones).where(eq(tournamentZones.tournamentId, tournamentId)).orderBy(asc(tournamentZones.position));
  if (zones.length < 2) return null;
  const tpl = buildTemplate(zones.map((z) => z.size as 3 | 4));
  const key = (r: number, p: number) => `${r}:${p}`;
  const ids = new Map(tpl.matches.map((m) => [key(m.round, m.position), randomUUID()]));
  await tx.insert(tournamentMatches).values(tpl.matches.map((m) => {
    // En un cruce libre el lugar real va siempre en el lado A.
    const [a, b] = m.a === null && m.b !== null ? [m.b, m.a] : [m.a, m.b];
    return {
      id: ids.get(key(m.round, m.position))!, clubId: ctx.clubId, tournamentId, stage: 'llave', round: m.round, position: m.position,
      sourceA: a ? encodeSlot(a) : null, sourceB: b ? encodeSlot(b) : null, status: m.bye ? 'bye' : 'pendiente',
      nextMatchId: m.next ? ids.get(key(m.next.round, m.next.position))! : null, nextSlot: m.next?.slot ?? null,
    };
  }));
  return { size: tpl.size };
}

/**
 * Pone en la llave a las parejas de las zonas que ya terminaron (sin empates pendientes de sorteo), respeta lo puesto a mano, hace
 * avanzar a los libres y ajusta el estado del torneo (zonas ⇄ llave). Si un cambio tocaría un partido ya empezado, falla con
 * `next_played` y no se guarda nada. Se llama después de cada cambio que pueda mover posiciones.
 */
export async function refreshBracket(tx: Tx, tournamentId: string) {
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t || (t.status !== 'zonas' && t.status !== 'llave')) return;
  const states = await zoneStatesRaw(tx, tournamentId);
  const resolved = new Map<string, string>();
  for (const s of states) for (const r of s.standings.rows) if (s.standings.complete && r.position !== null) resolved.set(`${s.zone.position}:${r.position}`, r.entryId);

  const ms = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.stage, 'llave')))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.position));
  if (ms.length > 0) {
    const byId = new Map(ms.map((m) => [m.id, m]));
    // 1. Primera ronda: cada lado sin fijar a mano toma la pareja que le corresponde (o queda "a definir").
    for (const m of ms.filter((x) => x.round === 1)) {
      for (const side of ['a', 'b'] as const) {
        const src = side === 'a' ? m.sourceA : m.sourceB, locked = side === 'a' ? m.lockA : m.lockB;
        if (!src || locked) continue;
        const want = resolved.get(src) ?? null, cur = side === 'a' ? m.entryAId : m.entryBId;
        if (want === cur) continue;
        if (isStarted(m)) throw new TournamentError('next_played');
        // En un cruce libre el ganador es la pareja del lado A: se cambia junto con ella (la restricción del ganador lo exige).
        await tx.update(tournamentMatches).set(side === 'a' ? { entryAId: want, ...(m.status === 'bye' ? { winnerEntryId: want } : {}) } : { entryBId: want }).where(eq(tournamentMatches.id, m.id));
        if (side === 'a') { m.entryAId = want; if (m.status === 'bye') m.winnerEntryId = want; } else m.entryBId = want;
      }
    }
    // 2. Libres: la pareja única pasa sola al cruce siguiente.
    for (const m of ms.filter((x) => x.status === 'bye')) {
      const winner = m.entryAId ?? m.entryBId ?? null;
      if (winner !== m.winnerEntryId) await tx.update(tournamentMatches).set({ winnerEntryId: winner }).where(eq(tournamentMatches.id, m.id));
      const next = m.nextMatchId ? byId.get(m.nextMatchId) : null;
      if (!next || !m.nextSlot) continue;
      const cur = m.nextSlot === 'a' ? next.entryAId : next.entryBId;
      if (cur === winner) continue;
      if (isStarted(next)) throw new TournamentError('next_played');
      await tx.update(tournamentMatches).set(m.nextSlot === 'a' ? { entryAId: winner } : { entryBId: winner }).where(eq(tournamentMatches.id, next.id));
      if (m.nextSlot === 'a') next.entryAId = winner; else next.entryBId = winner;
    }
  }

  // 3. Estado: `llave` cuando todas las zonas terminaron; si se corrige alguna, vuelve a `zonas`.
  const done = states.length > 0 && states.every((s) => s.standings.complete && s.standings.needsDraw.length === 0);
  if (t.status === 'zonas' && done) await tx.update(tournaments).set({ status: 'llave' }).where(eq(tournaments.id, tournamentId));
  if (t.status === 'llave' && !done) await tx.update(tournaments).set({ status: 'zonas' }).where(eq(tournaments.id, tournamentId));
}

/**
 * Vuelve a generar la llave desde cero a partir de las zonas actuales (por ejemplo si se cambió el tamaño de las zonas o la llave quedó
 * de una versión anterior). Pierde lo puesto a mano y los horarios de la llave. Solo si ningún cruce de la llave empezó.
 */
export async function rebuildBracket(tx: Tx, ctx: Ctx, tournamentId: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t) throw new TournamentError('not_found');
  if (t.status !== 'zonas' && t.status !== 'llave') throw new TournamentError('invalid_state', { status: t.status });
  const ms = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.stage, 'llave')));
  if (ms.some(isStarted)) throw new TournamentError('next_played');
  await tx.delete(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.stage, 'llave')));
  const res = await createBracketTemplate(tx, ctx, tournamentId);
  await refreshBracket(tx, tournamentId);
  return res;
}
