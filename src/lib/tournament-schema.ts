// Validación compartida (formularios y servidor) de plantillas, torneos y resultados.
import { z } from 'zod';
import { CATEGORY_RULE_KINDS, MIN_PAIRS_FLOOR, MODALITIES, ROUND_KEYS } from './tournament/constants';
import { RANKING_WINDOWS } from './tournament/ranking-window';

const points = z.coerce.number().int().min(0).max(1_000_000);
const roundKey = z.enum(ROUND_KEYS);
const optionalNumber = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());

export const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  championPoints: points.min(1),
  participationPoints: points.default(0),
  /** Porcentaje del campeón por ronda; lo que falte usa el default del motor. */
  roundPercents: z.partialRecord(roundKey, z.number().min(0).max(1000)).optional(),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const tournamentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  modality: z.enum(MODALITIES),
  ruleKind: z.enum(CATEGORY_RULE_KINDS),
  ruleValue: z.coerce.number().int(),
  isRanked: z.coerce.boolean().default(false),
  minPairs: z.coerce.number().int().min(MIN_PAIRS_FLOOR).max(256),
  templateId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  /** Si hay plantilla y no se informan, se copian de ella. */
  championPoints: optionalNumber(points.min(1)),
  participationPoints: optionalNumber(points),
  /** Puntos absolutos que el club ajusta por ronda. */
  roundOverrides: z.partialRecord(roundKey, points).optional(),
  startsOn: z.string().regex(ISO_DATE),
  seedWindow: z.enum(RANKING_WINDOWS as [string, ...string[]]).default('all'),
}).superRefine((v, ctx) => {
  const ok = v.ruleKind === 'single' ? v.ruleValue >= 1 && v.ruleValue <= 9 : v.ruleValue >= 2 && v.ruleValue <= 18;
  if (!ok) ctx.addIssue({ code: 'custom', path: ['ruleValue'], message: 'rule_value' });
});
export type TournamentInput = z.infer<typeof tournamentInputSchema>;

/** Games por set [A, B]; de 1 a 3 sets, sin empates dentro de un set. */
export const setsSchema = z.array(z.tuple([z.number().int().min(0).max(99), z.number().int().min(0).max(99)]).refine(([a, b]) => a !== b, 'tied_set')).min(1).max(3);
export type SetsInput = z.infer<typeof setsSchema>;

/** Ganador según los sets: gana quien se lleva más sets. null si hay empate de sets. */
export function winnerOfSets(sets: SetsInput): 'a' | 'b' | null {
  const a = sets.filter(([x, y]) => x > y).length;
  const b = sets.length - a;
  return a === b ? null : a > b ? 'a' : 'b';
}
