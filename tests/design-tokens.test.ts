import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/lib/color';

// Guarda del design system: los tokens de globals.css coinciden con design/design-tokens.json
// y los pares de texto/fondo cumplen los contrastes que el sistema promete (AA = 4.5:1, bordes de controles = 3:1).
const css = readFileSync(path.resolve(__dirname, '../src/app/globals.css'), 'utf8');
const spec = JSON.parse(readFileSync(path.resolve(__dirname, '../design/design-tokens.json'), 'utf8')) as {
  color: { tokens: { name: string; value: string | { light: string; dark: string } }[] };
};

function block(re: RegExp): Record<string, string> {
  const m = re.exec(css);
  if (!m) throw new Error(`No se encontró el bloque ${re}`);
  return Object.fromEntries([...m[1].matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((x) => [x[1], x[2].toLowerCase()]));
}
const light = block(/:root\s*\{([\s\S]*?)\n\}/);
const dark = block(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s*\}/);
const theme = { light, dark } as const;

describe('tokens de color', () => {
  it('globals.css tiene los mismos valores que design-tokens.json en claro y oscuro', () => {
    for (const tok of spec.color.tokens) {
      if (typeof tok.value === 'string') continue; // alias (focus -> info)
      expect(light[tok.name], `${tok.name} (claro)`).toBe(tok.value.light.toLowerCase());
      // `ball` y `on-ball` no cambian entre temas, por eso el bloque oscuro no los redefine.
      expect(dark[tok.name] ?? light[tok.name], `${tok.name} (oscuro)`).toBe(tok.value.dark.toLowerCase());
    }
  });

  const pairs: [string, string, number][] = [
    ['ink', 'surface', 4.5], ['ink', 'surface-raised', 4.5], ['ink', 'surface-sunken', 4.5],
    ['ink-muted', 'surface', 4.5], ['ink-muted', 'surface-raised', 4.5], ['ink-muted', 'surface-sunken', 4.5],
    ['brand', 'surface', 4.5], ['brand', 'surface-raised', 4.5], ['brand', 'brand-tint', 4.5],
    ['on-brand', 'brand', 4.5], ['on-brand', 'brand-hover', 4.5],
    ['danger', 'surface-raised', 4.5], ['danger', 'danger-tint', 4.5],
    ['warning', 'surface-raised', 4.5], ['warning', 'warning-tint', 4.5],
    ['info', 'surface-raised', 4.5], ['info', 'info-tint', 4.5],
    ['on-ball', 'ball', 4.5], ['on-danger', 'danger', 4.5],
    // Bordes de controles y anillo de foco: 3:1 contra las superficies.
    ['line-strong', 'surface', 3], ['line-strong', 'surface-raised', 3], ['info', 'surface', 3], ['info', 'surface-raised', 3],
  ];
  for (const name of ['light', 'dark'] as const) {
    it(`pares de contraste del tema ${name}`, () => {
      const t = { ...light, ...theme[name] };
      for (const [fg, bg, min] of pairs) {
        expect(contrastRatio(t[fg], t[bg]), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(min);
      }
    });
  }
});
