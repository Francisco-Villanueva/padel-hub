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
