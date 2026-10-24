import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, contactLog, playerConsents, players } from '../src/server/db/schema';
import { listCandidates } from '../src/server/services/candidates';
import { listContacts, logContact } from '../src/server/services/contacts';
import { clubOverview } from '../src/server/services/overview';
import { createPlayer, listPlayers, softDeletePlayer } from '../src/server/services/players';
import { buildCsv, csvCell, exportPlayers } from '../src/server/services/players-export';
import { seedTwoClubs, setupDb } from './helpers';

let t: Awaited<ReturnType<typeof setupDb>>;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
const consent = { textVersion: 'test', locale: 'es' as const };
const ids: Record<string, string> = {};

const mk = (clubId: string, firstName: string, phone: string, extra: Record<string, unknown> = {}) =>
  t.withTenant(clubId, async (tx) => createPlayer(tx, { clubId, country: 'AR' }, { firstName, lastName: 'Test', gender: 'male', slots: [], phone, ...extra } as never, consent));

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  ids.ana = await mk(s.a.id, 'Ana', '2914000001', { slots: ['noche'], position: 'drive' });
  ids.beto = await mk(s.a.id, 'Beto', '2914000002', { slots: ['noche'] });
  ids.cora = await mk(s.a.id, '=Cora', '2914000003', { slots: ['tarde'] });
  ids.otro = await mk(s.b.id, 'Otro', '2914000004', { slots: ['noche'] });
});
afterAll(async () => { await t.client.close(); });

const inA = <T>(fn: Parameters<typeof t.withTenant<T>>[1]) => t.withTenant(s.a.id, fn);

describe('contactos', () => {
  it('registra quién contactó a quién y lo lista con el nombre del usuario', async () => {
    await inA((tx) => logContact(tx, { clubId: s.a.id, userId: s.ownerA }, ids.ana, 'falta_cuarto'));
    const list = await inA((tx) => listContacts(tx, ids.ana));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: 'falta_cuarto', userName: 'Owner club-a' });
  });

  it('no deja contactar a un jugador de otro club ni a uno dado de baja', async () => {
    await expect(inA((tx) => logContact(tx, { clubId: s.a.id, userId: s.ownerA }, ids.otro, 'otro'))).rejects.toMatchObject({ code: 'not_found' });
    const gone = await mk(s.a.id, 'Baja', '2914000009');
    await inA((tx) => softDeletePlayer(tx, { clubId: s.a.id, userId: s.ownerA }, gone));
    await expect(inA((tx) => logContact(tx, { clubId: s.a.id, userId: s.ownerA }, gone, 'otro'))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('el último contacto aparece en el listado de jugadores', async () => {
    const { rows } = await inA((tx) => listPlayers(tx, {}));
    expect(rows.find((r) => r.id === ids.ana)?.lastContactAt).toBeTruthy();
    expect(rows.find((r) => r.id === ids.beto)?.lastContactAt).toBeNull();
  });
});

describe('falta el cuarto', () => {
  it('ordena primero a quien nunca fue contactado y filtra por franja', async () => {
    const { rows, total } = await inA((tx) => listCandidates(tx, { slot: 'noche' }));
    expect(rows.map((r) => r.firstName)).toEqual(['Beto', 'Ana']); // Beto nunca contactado, Ana ya
    expect(total).toBe(2);
  });

  it('solo muestra jugadores con consentimiento registrado', async () => {
    await t.withPlatform((tx) => tx.delete(playerConsents).where(eq(playerConsents.playerId, ids.beto)));
    const { rows } = await inA((tx) => listCandidates(tx, { slot: 'noche' }));
    expect(rows.map((r) => r.firstName)).toEqual(['Ana']);
  });

  it('no ve jugadores de otro club', async () => {
    const { rows } = await t.withTenant(s.b.id, (tx) => listCandidates(tx, {}));
    expect(rows.map((r) => r.firstName)).toEqual(['Otro']);
  });
});

describe('inicio', () => {
  it('cuenta jugadores, altas recientes, contactados y sin consentimiento solo del club', async () => {
    const o = await inA((tx) => clubOverview(tx));
    expect(o).toMatchObject({ total: 3, recent: 3, noConsent: 1, contacted: 1 });
    expect(o.latest).toHaveLength(3);
    const later = await inA((tx) => clubOverview(tx, new Date(Date.now() + 40 * 24 * 3600 * 1000)));
    expect(later).toMatchObject({ recent: 0, contacted: 0 });
  });
});

describe('exportar CSV', () => {
  const labels = { firstName: 'Nombre', lastName: 'Apellido', gender: 'Género', category: 'Categoría', position: 'Posición', slots: 'Horarios', phone: 'Teléfono', instagram: 'Instagram', locality: 'Localidad', source: 'Origen', createdAt: 'Alta' };
  const describeFns = { category: (level: number) => `${level}ta`, enums: (_k: string, v: string) => v };

  it('neutraliza fórmulas y escapa comillas, comas y saltos de línea', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+54 9 291')).toBe("'+54 9 291");
    expect(csvCell('Pérez, "Juan"')).toBe('"Pérez, ""Juan"""');
    expect(csvCell('línea\nsiguiente')).toBe('"línea\nsiguiente"');
    expect(csvCell('normal')).toBe('normal');
  });

  it('exporta solo el club, puede omitir teléfonos y deja constancia en la auditoría', async () => {
    const rows = await inA((tx) => exportPlayers(tx, { clubId: s.a.id, userId: s.ownerA }, { includePhones: false }, describeFns));
    expect(rows.map((r) => r.firstName).sort()).toEqual(['=Cora', 'Ana', 'Beto']); // sin el de otro club ni el dado de baja
    const csv = buildCsv(rows, false, labels);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).not.toContain('Teléfono');
    expect(csv).not.toContain('+54291');
    expect(csv).toContain("'=Cora");
    const [log] = await t.withPlatform((tx) => tx.select().from(auditLog).where(eq(auditLog.action, 'players.export')));
    expect(log.detail).toMatchObject({ count: 3, includePhones: false, filtered: false });
  });

  it('con filtros exporta solo lo filtrado', async () => {
    const rows = await inA((tx) => exportPlayers(tx, { clubId: s.a.id, userId: s.ownerA }, { includePhones: true, filters: { slot: 'tarde' } }, describeFns));
    expect(rows.map((r) => r.firstName)).toEqual(['=Cora']);
  });

  it('un jugador de otro club no se cuela aunque se conozca su id', async () => {
    const rows = await t.withTenant(s.b.id, (tx) => tx.select().from(players).where(eq(players.id, ids.ana)));
    expect(rows).toHaveLength(0);
    expect(await t.withTenant(s.b.id, (tx) => tx.select().from(contactLog))).toHaveLength(0);
  });
});
