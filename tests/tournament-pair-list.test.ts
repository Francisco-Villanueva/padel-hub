import { describe, expect, it } from 'vitest';
import { parsePairList } from '../src/lib/tournament/pair-list';

describe('parsePairList', () => {
  it('una pareja por línea, con varios separadores y numeración', () => {
    const { pairs, problems } = parsePairList(['1. Cardoso / Weber', '2) Lopez - De Dios', 'Charbonier y Sosa', 'Reschini & Parrota', 'Weth + Blanco', '', '  '].join('\n'));
    expect(problems).toEqual([]);
    expect(pairs.map((p) => [p.p1.lastName, p.p2.lastName])).toEqual([['Cardoso', 'Weber'], ['Lopez', 'De Dios'], ['Charbonier', 'Sosa'], ['Reschini', 'Parrota'], ['Weth', 'Blanco']]);
    expect(pairs.map((p) => p.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it('por defecto cada lado es un apellido (aunque tenga varias palabras); la coma separa "Apellido, Nombre"', () => {
    const { pairs } = parsePairList('De Nari / Perez, Juan');
    expect(pairs[0].p1).toEqual({ lastName: 'De Nari' });
    expect(pairs[0].p2).toEqual({ lastName: 'Perez', firstName: 'Juan' });
  });

  it('con orden "Nombre Apellido" o "Apellido Nombre"', () => {
    expect(parsePairList('Juan Pérez / Ana López', 'first-last').pairs[0]).toMatchObject({ p1: { firstName: 'Juan', lastName: 'Pérez' }, p2: { firstName: 'Ana', lastName: 'López' } });
    expect(parsePairList('Pérez Juan / López Ana', 'last-first').pairs[0]).toMatchObject({ p1: { firstName: 'Juan', lastName: 'Pérez' }, p2: { firstName: 'Ana', lastName: 'López' } });
    // Un solo término sigue siendo el apellido.
    expect(parsePairList('Pérez / López Ana', 'first-last').pairs[0].p1).toEqual({ lastName: 'Pérez' });
  });

  it('un guion sin espacios es parte del apellido, no un separador', () => {
    const { pairs } = parsePairList('Pérez-Gómez / Sosa');
    expect(pairs[0].p1.lastName).toBe('Pérez-Gómez');
  });

  it('informa las líneas que no se entienden y sigue con las demás', () => {
    const { pairs, problems } = parsePairList('Cardoso / Weber\nSolo uno\nUno / Dos / Tres\n / Sosa\nLopez / De Dios');
    expect(pairs.map((p) => p.line)).toEqual([1, 5]);
    expect(problems.map((p) => [p.line, p.reason])).toEqual([[2, 'one_player'], [3, 'too_many'], [4, 'one_player']]);
  });
});
