// Constantes y supuestos del motor de torneos (docs/torneos-y-rankings.md, sección 11). Cambiarlos acá alcanza.

/** Supuesto 3: con 5 o menos parejas no hay combinación válida de zonas de 3 y 4. */
export const MIN_PAIRS_FLOOR = 6;

/** Supuesto 4: más profundo que 16vos el porcentaje baja a la mitad por ronda. */
export const HALVE_BELOW = true;

export const MODALITIES = ['libre', 'mixto', 'masculino', 'femenino'] as const;
export type Modality = (typeof MODALITIES)[number];

export const CATEGORY_RULE_KINDS = ['single', 'sum'] as const;
export type CategoryRuleKind = (typeof CATEGORY_RULE_KINDS)[number];

export const TOURNAMENT_STATUSES = ['borrador', 'inscripcion', 'zonas', 'llave', 'cerrado', 'cancelado'] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

/** Supuesto: en una regla "suma N", Principiantes (9) cuenta como 9. */
export const BEGINNERS_SUM_VALUE = 9;

/** Rondas desde la final hacia atrás. `round_of_16` = octavos, `round_of_32` = 16vos. */
export const ROUND_KEYS = ['champion', 'final', 'semifinal', 'quarterfinal', 'round_of_16', 'round_of_32', 'round_of_64', 'round_of_128'] as const;
export type RoundKey = (typeof ROUND_KEYS)[number];

/** Porcentaje del puntaje del campeón por ronda alcanzada (hasta 16vos; más atrás se calcula con HALVE_BELOW). */
export const DEFAULT_ROUND_PERCENTS: Record<'champion' | 'final' | 'semifinal' | 'quarterfinal' | 'round_of_16' | 'round_of_32', number> = {
  champion: 100, final: 60, semifinal: 36, quarterfinal: 18, round_of_16: 9, round_of_32: 4.5,
};
