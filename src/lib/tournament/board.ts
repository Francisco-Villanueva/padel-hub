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

/** Partido de las zonas o del cuadro en la vista pública (incluye los libres, que el cuadro necesita). */
export interface DrawMatch {
  id: string;
  round: number;
  position: number;
  scheduledAt: Date | null;
  status: 'pendiente' | 'en_juego' | 'jugado' | 'bye';
  nameA: string | null;
  nameB: string | null;
  sets: [number, number][] | null;
  winner: 'a' | 'b' | null;
  srcA: SlotLabel | null;
  srcB: SlotLabel | null;
}

/** Fila de la tabla de posiciones de una zona. */
export interface ZoneRow {
  entryId: string;
  name: string;
  played: number;
  wins: number;
  gameDiff: number;
  position: number | null;
  qualified: boolean;
}

export interface PublicZone { name: string; complete: boolean; /** El desempate se resolvió por sorteo. */ drawn: boolean; standings: ZoneRow[]; matches: DrawMatch[] }
export interface PublicDraw { zones: PublicZone[]; bracket: DrawMatch[] }
