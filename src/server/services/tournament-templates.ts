// Plantillas de torneo del club (p. ej. "Torneo de 1000 ptos"). Dueño y empleado pueden gestionarlas.
import { asc, eq } from 'drizzle-orm';
import type { TemplateInput } from '../../lib/tournament-schema';
import { tournamentTemplates } from '../db/schema';
import type { Tx } from '../db/tenant';
import { assertFeature } from './features';
import { TournamentError } from './tournament-errors';

type Ctx = { clubId: string };

export async function listTemplates(tx: Tx, ctx: Ctx) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  return tx.select().from(tournamentTemplates).orderBy(asc(tournamentTemplates.name), asc(tournamentTemplates.id));
}

export async function getTemplate(tx: Tx, ctx: Ctx, id: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const [t] = await tx.select().from(tournamentTemplates).where(eq(tournamentTemplates.id, id));
  return t ?? null;
}

export async function createTemplate(tx: Tx, ctx: Ctx, input: TemplateInput) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const [t] = await tx.insert(tournamentTemplates).values({
    clubId: ctx.clubId, name: input.name, championPoints: input.championPoints,
    participationPoints: input.participationPoints, roundPercents: input.roundPercents ?? null,
  }).returning({ id: tournamentTemplates.id });
  return t.id;
}

/** Editar una plantilla no cambia los torneos ya creados: cada uno guarda su propia tabla de puntos. */
export async function updateTemplate(tx: Tx, ctx: Ctx, id: string, input: TemplateInput) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const res = await tx.update(tournamentTemplates).set({
    name: input.name, championPoints: input.championPoints, participationPoints: input.participationPoints, roundPercents: input.roundPercents ?? null,
  }).where(eq(tournamentTemplates.id, id)).returning({ id: tournamentTemplates.id });
  if (res.length === 0) throw new TournamentError('template_not_found');
}

export async function deleteTemplate(tx: Tx, ctx: Ctx, id: string) {
  await assertFeature(tx, ctx.clubId, 'tournaments');
  const res = await tx.delete(tournamentTemplates).where(eq(tournamentTemplates.id, id)).returning({ id: tournamentTemplates.id });
  if (res.length === 0) throw new TournamentError('template_not_found');
}
