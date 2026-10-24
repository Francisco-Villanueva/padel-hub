import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import es from '../messages/es.json';
import pt from '../messages/pt.json';

const keys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();

describe('mensajes i18n', () => {
  it('es, en y pt tienen exactamente las mismas claves', () => {
    expect(keys(en)).toEqual(keys(es));
    expect(keys(pt)).toEqual(keys(es));
  });
});
