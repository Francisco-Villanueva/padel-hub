// Lista de parejas pegada como texto (de un mensaje, una planilla, un posteo): una pareja por línea, "Pérez / Gómez".
// Función pura: no toca la base. El servicio decide después si cada jugador ya existe o se crea.

/** Cómo vienen escritos los jugadores sin coma: solo el apellido, "Nombre Apellido" o "Apellido Nombre". */
export type NameOrder = 'surname' | 'first-last' | 'last-first';

export interface ParsedPlayer { firstName?: string; lastName: string }
export interface ParsedPair { line: number; text: string; p1: ParsedPlayer; p2: ParsedPlayer }
export interface ParseProblem { line: number; text: string; reason: 'one_player' | 'too_many' | 'empty_name' }
export interface ParsedList { pairs: ParsedPair[]; problems: ParseProblem[] }

// Separadores entre los dos jugadores: barra, guion con espacios, "y", "&", "+", "|", ";" o tabulación.
const SEPARATOR = /\s*(?:\/|\||;|\t|\+|&|\s[-–—]\s|\s[yY]\s)\s*/;
// Numeración al inicio de la línea: "1.", "2)", "3 -", "4:".
const NUMBERING = /^\s*\d{1,3}\s*[.):\-–]\s*/;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function parsePlayer(raw: string, order: NameOrder): ParsedPlayer | null {
  const s = clean(raw);
  if (!s) return null;
  if (s.includes(',')) { // "Apellido, Nombre"
    const [last, ...rest] = s.split(',');
    const lastName = clean(last), firstName = clean(rest.join(' '));
    return lastName ? { lastName, firstName: firstName || undefined } : null;
  }
  const words = s.split(' ');
  if (order === 'surname' || words.length === 1) return { lastName: s };
  // "Nombre Apellido": el primer término es el nombre; "Apellido Nombre": el primero es el apellido.
  return order === 'first-last' ? { firstName: words[0], lastName: words.slice(1).join(' ') } : { lastName: words[0], firstName: words.slice(1).join(' ') };
}

/** Parte el texto en parejas. Las líneas vacías se ignoran; las que no se pueden entender quedan en `problems`. */
export function parsePairList(text: string, order: NameOrder = 'surname'): ParsedList {
  const pairs: ParsedPair[] = [], problems: ParseProblem[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const body = raw.replace(NUMBERING, '').trim();
    if (!body) return;
    const parts = body.split(SEPARATOR).map(clean).filter(Boolean);
    if (parts.length < 2) return void problems.push({ line, text: body, reason: 'one_player' });
    if (parts.length > 2) return void problems.push({ line, text: body, reason: 'too_many' });
    const [a, b] = parts.map((p) => parsePlayer(p, order));
    if (!a || !b) return void problems.push({ line, text: body, reason: 'empty_name' });
    pairs.push({ line, text: body, p1: a, p2: b });
  });
  return { pairs, problems };
}
