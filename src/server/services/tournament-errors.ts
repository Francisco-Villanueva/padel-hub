// Errores de negocio de torneos. `code` se mapea a una clave de i18n en la UI (tournaments.errors.*).
export type TournamentErrorCode =
  | 'not_found' | 'template_not_found' | 'player_not_found' | 'invalid_state' | 'below_min' | 'has_entries'
  | 'pair_invalid' | 'player_taken' | 'zones_incomplete' | 'tie_unresolved' | 'final_pending'
  | 'result_invalid' | 'next_played' | 'invalid_phone' | 'draw_invalid' | 'champion_required';

export class TournamentError extends Error {
  constructor(readonly code: TournamentErrorCode, readonly detail?: Record<string, unknown>) {
    super(code);
    this.name = 'TournamentError';
  }
}

export const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};
