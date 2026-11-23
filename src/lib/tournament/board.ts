// Fila del tablero de partidos de un torneo. La comparten la vista pública (televisor, desde SQL) y la del club (desde el servicio).
/** De dónde sale un lugar todavía sin definir de la llave: "1º de la Zona A". */
export interface SlotLabel { zone: string; position: number }

export interface BoardMatch {
  stage: 'zona' | 'llave';
  zoneName: string | null;
  round: number;
  position: number;
  /** Rondas de la llave (para nombrar "Cuartos", "Semifinal"…); null si todavía no hay llave. */
  maxRound: number | null;
  scheduledAt: Date | null;
  status: 'pendiente' | 'en_juego' | 'jugado';
  nameA: string | null;
  nameB: string | null;
  sets: [number, number][] | null;
  winner: 'a' | 'b' | null;
  /** Si la pareja todavía no está definida y viene de una zona: de qué puesto. */
  srcA: SlotLabel | null;
  srcB: SlotLabel | null;
}
