import { seedOrder } from './bracket';
import { qualifiersPerZone } from './zones';

/**
 * Plantilla de llave: se define con la cantidad y el tamaño de las zonas, sin saber quién juega. Cada lugar es un puesto de zona
 * ("2º de la Zona B") y se completa solo cuando esa zona termina. El orden de las zonas es el de fuerza: la A es la mejor cabeza de serie.
 *
 * Reglas (así lo hace Zonea; ver docs/torneos-y-rankings.md):
 *  1. Siembra en serpentina: los primeros en orden de zona (1A, 1B…), los segundos en orden inverso (…2B, 2A), los terceros en orden directo.
 *  2. Llave estándar (1 vs último, 8 vs 9…) del tamaño de la próxima potencia de 2; los mejores puestos reciben los libres.
 *  3. Nadie se cruza con su propia zona en primera ronda, y el 1º y el 2º de una zona quedan en mitades opuestas de la llave.
 *  La serpentina pura rompe 2 y 3 con cantidades pares de zonas; se corrige con la mínima cantidad de intercambios posible.
 */
export interface SlotRef { /** Índice de la zona en el orden de fuerza (0 = A). */ zone: number; /** 1 = primero, 2 = segundo, 3 = tercero. */ position: number }

export interface TemplateMatch {
  /** 1 = primera ronda. */
  round: number;
  position: number;
  a: SlotRef | null;
  b: SlotRef | null;
  /** Primera ronda con un solo lado: pasa directo (libre). */
  bye: boolean;
  next: { round: number; position: number; slot: 'a' | 'b' } | null;
}
export interface BracketTemplate { size: number; rounds: number; matches: TemplateMatch[]; seeds: SlotRef[] }

const same = (a: SlotRef | null, b: SlotRef | null) => !!a && !!b && a.zone === b.zone;

/** Lista de puestos de mejor a peor: serpentina sobre las zonas que clasifican en cada vuelta. */
export function seedSlots(zoneSizes: readonly (3 | 4)[]): SlotRef[] {
  const q = zoneSizes.map(qualifiersPerZone);
  const out: SlotRef[] = [];
  for (let r = 1; r <= Math.max(...q); r++) {
    let zones = zoneSizes.map((_, i) => i).filter((i) => q[i] >= r);
    if (r % 2 === 0) zones = zones.reverse();
    for (const z of zones) out.push({ zone: z, position: r });
  }
  return out;
}

/** Costo de una distribución de puestos en la llave (menor es mejor): choques de zona y separación de mitades, con leve apego a la serpentina. */
function cost(pos: (SlotRef | null)[], origin: Map<string, number>): number {
  const size = pos.length, half = size / 2, quarter = Math.max(1, size / 4);
  let c = 0;
  for (let i = 0; i < size; i += 2) if (same(pos[i], pos[i + 1])) c += 1000;
  const at = (z: number, p: number) => pos.findIndex((s) => s && s.zone === z && s.position === p);
  const zones = new Set(pos.filter(Boolean).map((s) => s!.zone));
  for (const z of zones) {
    const [i1, i2, i3] = [at(z, 1), at(z, 2), at(z, 3)];
    if (i1 >= 0 && i2 >= 0 && size >= 4 && (i1 < half) === (i2 < half)) c += 100;
    if (i3 >= 0) {
      if (i1 >= 0 && (i1 < half) === (i3 < half)) c += 5;
      if (i2 >= 0 && (i2 < half) === (i3 < half)) c += 5;
    }
    const qs = [i1, i2, i3].filter((i) => i >= 0).map((i) => Math.floor(i / quarter));
    c += 20 * (qs.length - new Set(qs).size);
  }
  pos.forEach((s, i) => { if (s) c += Math.abs(i - (origin.get(`${s.zone}:${s.position}`) ?? i)) * 0.01; });
  return c;
}

export function buildTemplate(zoneSizes: readonly (3 | 4)[]): BracketTemplate {
  if (zoneSizes.length < 2) throw new RangeError('template_min_zones');
  const seeds = seedSlots(zoneSizes);
  const n = seeds.length;
  let size = 2;
  while (size < n) size *= 2;
  const order = seedOrder(size);
  const pos: (SlotRef | null)[] = order.map((s) => (s <= n ? seeds[s - 1] : null));
  const origin = new Map(pos.map((s, i) => [s ? `${s.zone}:${s.position}` : '', i] as const));

  // Mejora local determinística: se intercambian puestos del MISMO nivel (segundos con segundos, terceros con terceros) mientras baje el
  // costo. Los primeros no se mueven nunca: definen la siembra. Así los más fuertes siguen enfrentando a los más débiles.
  const movable = pos.map((s, i) => (s && s.position >= 2 ? i : -1)).filter((i) => i >= 0);
  for (let guard = 0; guard < 500; guard++) {
    const base = cost(pos, origin);
    let best: [number, number] | null = null, bestCost = base;
    for (let x = 0; x < movable.length; x++) {
      for (let y = x + 1; y < movable.length; y++) {
        const [i, j] = [movable[x], movable[y]];
        if (pos[i]!.position !== pos[j]!.position) continue;
        [pos[i], pos[j]] = [pos[j], pos[i]];
        const c = cost(pos, origin);
        [pos[i], pos[j]] = [pos[j], pos[i]];
        if (c < bestCost - 1e-9) { bestCost = c; best = [i, j]; }
      }
    }
    if (!best) break;
    [pos[best[0]], pos[best[1]]] = [pos[best[1]], pos[best[0]]];
  }

  const rounds = Math.log2(size);
  const matches: TemplateMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    for (let p = 0; p < size / 2 ** r; p++) {
      const first = r === 1;
      const a = first ? pos[2 * p] : null, b = first ? pos[2 * p + 1] : null;
      matches.push({
        round: r, position: p, a, b, bye: first && (a === null) !== (b === null),
        next: r < rounds ? { round: r + 1, position: Math.floor(p / 2), slot: p % 2 === 0 ? 'a' : 'b' } : null,
      });
    }
  }
  return { size, rounds, matches, seeds };
}

/** "2:1" ↔ { zone: 2, position: 1 }: así se guarda de dónde sale cada lado de un cruce de primera ronda. */
export const encodeSlot = (s: SlotRef) => `${s.zone + 1}:${s.position}`;
export function decodeSlot(v: string | null | undefined): SlotRef | null {
  const m = /^(\d+):(\d)$/.exec(v ?? '');
  return m ? { zone: Number(m[1]) - 1, position: Number(m[2]) } : null;
}

interface SourceRow { id: string; nextMatchId: string | null; nextSlot: string | null; status: string; sourceA: string | null; sourceB: string | null }

/**
 * De dónde sale un lado de un cruce: su propio origen (primera ronda) o, si lo alimenta un cruce libre, el origen de ese libre
 * (así la 2ª ronda muestra "1º Zona A" aunque la zona no haya terminado). null si depende de un partido por jugar.
 */
export function bracketSource(bracket: readonly SourceRow[], m: SourceRow, side: 'a' | 'b'): string | null {
  const own = side === 'a' ? m.sourceA : m.sourceB;
  if (own) return own;
  const feeder = bracket.find((f) => f.nextMatchId === m.id && f.nextSlot === side && f.status === 'bye');
  return feeder?.sourceA ?? null;
}
