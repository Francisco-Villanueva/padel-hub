// Contraste de colores (WCAG 2.x) para la marca del club.
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK = '#10201b';
const WHITE = '#ffffff';

/** Texto que mejor se lee sobre `bg`: blanco o la tinta de la marca. */
export const textOn = (bg: string) => (contrastRatio(bg, WHITE) >= contrastRatio(bg, INK) ? WHITE : INK);

/** ¿El texto blanco sobre `bg` no llega a AA (4.5:1)? Entonces se usa texto oscuro. */
export const lowContrastWithWhite = (bg: string) => contrastRatio(bg, WHITE) < 4.5;

// --- Marca del club en el formulario público -------------------------------------------------------
// El club elige dos colores (principal y de acento). En el formulario público se aplican en claro y en oscuro:
// se usan como RELLENO con un texto que siempre contrasta (textOn), y para TEXTO sobre la superficie se calcula una
// variante legible por tema. Así un color elegido para fondo blanco no desaparece en modo oscuro (ni al revés).

const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
const toRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: [number, number, number]) => `#${rgb.map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla `a` con `b`; t = 0 deja `a`, t = 1 deja `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  return toHex([0, 1, 2].map((i) => ra[i] + (rb[i] - ra[i]) * t) as [number, number, number]);
}

/** Acerca `color` a negro o blanco (el que mejor contraste dé contra `against`) hasta llegar a `min`. Si ya cumple, no lo toca. */
export function ensureContrast(color: string, against: string, min: number): string {
  if (contrastRatio(color, against) >= min) return color;
  const target = contrastRatio('#000000', against) >= contrastRatio('#ffffff', against) ? '#000000' : '#ffffff';
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(color, target, t);
    if (contrastRatio(c, against) >= min) return c;
  }
  return target;
}

const SURFACE_LIGHT = '#ffffff'; // superficie elevada (tarjetas, campos) del tema claro
const SURFACE_DARK = '#15231f'; //  ... del tema oscuro
const PAGE_DARK = '#0d1714'; //     fondo de página del tema oscuro
const HEX6 = /^#[0-9a-f]{6}$/i;

function tokens(theme: 'light' | 'dark', primary: string | null, accent: string | null): string {
  const surface = theme === 'light' ? SURFACE_LIGHT : SURFACE_DARK;
  const page = theme === 'light' ? SURFACE_LIGHT : PAGE_DARK;
  const out: string[] = [];
  if (primary) {
    // Relleno: en oscuro se levanta lo justo para que se distinga del fondo (3:1, mínimo de WCAG para componentes).
    const fill = theme === 'dark' ? ensureContrast(primary, page, 3) : primary;
    out.push(
      `--brand:${fill}`,
      `--brand-hover:${mix(fill, theme === 'light' ? '#000000' : '#ffffff', 0.16)}`,
      `--on-brand:${textOn(fill)}`,
      `--brand-tint:${mix(fill, surface, theme === 'light' ? 0.86 : 0.78)}`,
      `--brand-text:${ensureContrast(primary, surface, 4.5)}`,
    );
  }
  if (accent) {
    const fill = theme === 'dark' ? ensureContrast(accent, page, 3) : accent;
    out.push(`--ball:${fill}`, `--on-ball:${textOn(fill)}`);
  }
  return out.join(';');
}

/**
 * CSS que aplica los colores del club dentro de un contenedor `.club-brand` (nada global: el resto de la app no cambia).
 * Devuelve null si el club no definió ningún color. Los valores se validan como #rrggbb antes de interpolarse.
 */
export function clubBrandCss(primary: string | null | undefined, accent: string | null | undefined): string | null {
  const p = primary && HEX6.test(primary) ? primary.toLowerCase() : null;
  const a = accent && HEX6.test(accent) ? accent.toLowerCase() : null;
  if (!p && !a) return null;
  const light = tokens('light', p, a);
  const dark = tokens('dark', p, a);
  return (
    `.club-brand{${light}}` +
    // Todo texto "de marca" de la página (enlaces, insignias, avisos) usa la variante legible sobre la superficie.
    (p ? `.club-brand .text-brand{color:var(--brand-text)}` : '') +
    `@media (prefers-color-scheme:dark){.club-brand{${dark}}}`
  );
}
