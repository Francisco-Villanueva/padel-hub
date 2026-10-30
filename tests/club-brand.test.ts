import { describe, expect, it } from 'vitest';
import { clubBrandCss, contrastRatio, ensureContrast, mix, textOn } from '../src/lib/color';

const vars = (css: string, scope: 'light' | 'dark') => {
  const block = scope === 'light' ? css.match(/^\.club-brand\{([^}]*)\}/)![1] : css.match(/:root\[data-theme="dark"\] \.club-brand\{([^}]*)\}/)![1];
  return Object.fromEntries(block.split(';').map((d) => d.split(':'))) as Record<string, string>;
};

describe('colores del club en el formulario público', () => {
  it('mezcla colores y no se pasa de rango', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#112233', '#112233', 0.7)).toBe('#112233');
  });

  it('ensureContrast no toca un color que ya cumple y corrige el que no', () => {
    expect(ensureContrast('#0b6b4f', '#ffffff', 4.5)).toBe('#0b6b4f');
    const fixed = ensureContrast('#ffe600', '#ffffff', 4.5); // amarillo sobre blanco: ilegible
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    const dark = ensureContrast('#0a2540', '#15231f', 4.5); // azul marino sobre fondo oscuro: ilegible
    expect(contrastRatio(dark, '#15231f')).toBeGreaterThanOrEqual(4.5);
  });

  it('sin colores no genera CSS; con valores inválidos tampoco (no se interpola nada raro)', () => {
    expect(clubBrandCss(null, null)).toBeNull();
    expect(clubBrandCss(undefined, undefined)).toBeNull();
    expect(clubBrandCss('red', '};alert(1);{')).toBeNull();
    expect(clubBrandCss('#fff', 'url(x)')).toBeNull();
  });

  it('aplica el color principal y el de acento en claro Y en oscuro', () => {
    const css = clubBrandCss('#1B2A6B', '#FF7A1A')!;
    expect(css).toContain('.club-brand{');
    expect(css).toContain(':root[data-theme="dark"] .club-brand{');
    const light = vars(css, 'light'), dark = vars(css, 'dark');
    expect(light['--brand']).toBe('#1b2a6b');
    expect(light['--ball']).toBe('#ff7a1a');
    for (const t of [light, dark]) {
      expect(t['--on-brand']).toBe(textOn(t['--brand'])); // el texto sobre el relleno siempre contrasta
      expect(contrastRatio(t['--brand'], t['--on-brand'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['--ball'], t['--on-ball'])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('en oscuro, un color oscuro se levanta para distinguirse del fondo; el texto de marca es legible en ambos temas', () => {
    const css = clubBrandCss('#0a2540', null)!;
    const light = vars(css, 'light'), dark = vars(css, 'dark');
    expect(light['--brand']).toBe('#0a2540'); // en claro queda como lo eligió el club
    expect(contrastRatio(dark['--brand'], '#0d1714')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(light['--brand-text'], '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark['--brand-text'], '#15231f')).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain('.club-brand .text-brand{color:var(--brand-text)}');
    expect(css).not.toContain('--ball'); // sin acento no se pisa el del sistema
  });

  it('solo con acento no cambia el color principal', () => {
    const css = clubBrandCss(null, '#ff7a1a')!;
    expect(css).toContain('--ball');
    expect(css).not.toContain('--brand');
    expect(css).not.toContain('.text-brand');
  });
});
