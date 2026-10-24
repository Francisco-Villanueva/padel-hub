import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone, whatsappDigits, whatsappLink } from '../src/lib/phone';
import { playerFiltersSchema, playerInputSchema, type PlayerInput } from '../src/lib/player-schema';
import { auditLog, playerConsents, players } from '../src/server/db/schema';
import { createPlayer, getPlayer, listPlayers, PAGE_SIZE, PlayerError, softDeletePlayer, updatePlayer } from '../src/server/services/players';
import { seedTwoClubs, setupDb } from './helpers';

let t: Awaited<ReturnType<typeof setupDb>>;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
const consent = { textVersion: 'club-attested-v0', locale: 'es' as const };

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({
  firstName: 'Juan', lastName: 'Pérez', gender: 'male', slots: [], phone: '2914123456', ...over,
});
const ctx = () => ({ clubId: s.a.id, country: 'AR' });
const inA = <T>(fn: Parameters<typeof t.withTenant<T>>[1]) => t.withTenant(s.a.id, fn);
const codeOf = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof PlayerError ? e.code : `other:${e}`; } };

beforeAll(async () => { t = await setupDb(); s = await seedTwoClubs(t); });
afterAll(async () => { await t.client.close(); });

describe('teléfonos', () => {
  it('normaliza a E.164 según el país del club', () => {
    expect(normalizePhone('291 412-3456', 'AR')).toBe('+542914123456');
    expect(normalizePhone('+55 11 91234-5678', 'AR')).toBe('+5511912345678');
    expect(normalizePhone('11 91234-5678', 'BR')).toBe('+5511912345678');
    expect(normalizePhone('123', 'AR')).toBeNull();
    expect(normalizePhone('', 'AR')).toBeNull();
    expect(normalizePhone('abc', 'AR')).toBeNull();
  });
  it('arma el link de WhatsApp (en Argentina agrega el 9)', () => {
    expect(whatsappDigits('+542914123456')).toBe('5492914123456');
    expect(whatsappDigits('+5492914123456')).toBe('5492914123456');
    expect(whatsappDigits('+5511912345678')).toBe('5511912345678');
    expect(whatsappLink('+542914123456', 'Hola ¿venís?')).toBe('https://wa.me/5492914123456?text=Hola%20%C2%BFven%C3%ADs%3F');
    expect(formatPhone('+5511912345678')).toContain('+55');
  });
});

describe('validación', () => {
  it('limpia Instagram, deduplica franjas y trata vacíos como ausentes', () => {
    const r = playerInputSchema.parse({ firstName: ' Ana ', lastName: 'Gómez', gender: 'female', slots: ['noche', 'noche', 'tarde'], phone: '1', instagram: 'https://www.instagram.com/ana.gomez/?hl=es', category: '', position: '' });
    expect(r).toMatchObject({ firstName: 'Ana', instagram: 'ana.gomez', slots: ['noche', 'tarde'] });
    expect(r.category).toBeUndefined();
    expect(r.position).toBeUndefined();
    expect(playerInputSchema.parse({ firstName: 'a', lastName: 'b', gender: 'male', slots: [], phone: '1', instagram: '@ana_g' }).instagram).toBe('ana_g');
  });
  it('la categoría es un nivel de 1 a 8 y llega como texto desde el formulario', () => {
    const base = { firstName: 'a', lastName: 'b', gender: 'male', slots: [], phone: '1' };
    expect(playerInputSchema.parse({ ...base, category: '7' }).category).toBe(7);
    expect(playerInputSchema.parse({ ...base, category: 3 }).category).toBe(3);
    expect(playerInputSchema.parse({ ...base, category: '' }).category).toBeUndefined();
    for (const bad of ['0', '9', '-1', '7.5', 'siete']) expect(playerInputSchema.safeParse({ ...base, category: bad }).success).toBe(false);
    expect(playerFiltersSchema.parse({ category: '6' }).category).toBe(6);
    expect(playerFiltersSchema.safeParse({ category: '12' }).success).toBe(false);
  });
  it('rechaza datos inválidos', () => {
    const base = { firstName: 'a', lastName: 'b', gender: 'male', slots: [], phone: '1' };
    expect(playerInputSchema.safeParse({ ...base, firstName: '' }).success).toBe(false);
    expect(playerInputSchema.safeParse({ ...base, gender: 'x' }).success).toBe(false);
    expect(playerInputSchema.safeParse({ ...base, slots: ['madrugada'] }).success).toBe(false);
    expect(playerInputSchema.safeParse({ ...base, instagram: 'con espacios' }).success).toBe(false);
  });
  it('los filtros toleran basura en la URL', () => {
    expect(playerFiltersSchema.parse({ page: 'abc' }).page).toBe(1);
    expect(playerFiltersSchema.safeParse({ gender: 'otro' }).success).toBe(false);
    expect(playerFiltersSchema.parse({ q: '  ', page: '3' })).toMatchObject({ q: undefined, page: 3 });
  });
});

describe('servicio de jugadores', () => {
  it('crea un jugador con teléfono normalizado y registra el consentimiento', async () => {
    const id = await inA((tx) => createPlayer(tx, ctx(), input(), consent));
    const p = await inA((tx) => getPlayer(tx, id));
    expect(p).toMatchObject({ firstName: 'Juan', phoneE164: '+542914123456', source: 'manual' });
    const cons = await inA((tx) => tx.select().from(playerConsents).where(eq(playerConsents.playerId, id)));
    expect(cons).toHaveLength(1);
    expect(cons[0]).toMatchObject({ textVersion: 'club-attested-v0', source: 'manual', locale: 'es' });
  });

  it('rechaza teléfono inválido o repetido en el mismo club, pero lo acepta en otro club', async () => {
    expect(await codeOf(inA((tx) => createPlayer(tx, ctx(), input({ phone: '12' }), consent)))).toBe('invalid_phone');
    expect(await codeOf(inA((tx) => createPlayer(tx, ctx(), input({ phone: '+54 291 412 3456' }), consent)))).toBe('phone_taken');
    await t.withTenant(s.b.id, (tx) => createPlayer(tx, { clubId: s.b.id, country: 'AR' }, input(), consent));
  });

  it('la categoría y el género son independientes: un hombre puede ser de cualquier categoría, igual que una mujer', async () => {
    const a = await inA((tx) => createPlayer(tx, ctx(), input({ phone: '2914000001', gender: 'male', category: 2 }), consent));
    const b = await inA((tx) => createPlayer(tx, ctx(), input({ phone: '2914000002', gender: 'female', category: 2 }), consent));
    const rows = await inA((tx) => listPlayers(tx, { category: 2 }));
    expect(rows.rows.map((r) => r.id).sort()).toEqual([a, b].sort());
    expect((await inA((tx) => listPlayers(tx, { category: 2, gender: 'female' }))).rows.map((r) => r.id)).toEqual([b]);
  });

  it('la base rechaza una categoría fuera de 1 a 8', async () => {
    for (const bad of [0, 9]) {
      await expect(t.withTenant(s.a.id, (tx) => tx.insert(players).values({ clubId: s.a.id, firstName: 'x', lastName: 'y', gender: 'male', phoneE164: `+54911000010${bad}`, source: 'manual', category: bad }))).rejects.toThrow();
    }
  });

  it('actualiza datos, sin chocar con su propio teléfono y bloqueando el de otro jugador', async () => {
    const id = await inA((tx) => createPlayer(tx, ctx(), input({ firstName: 'Mario', phone: '2914111111' }), consent));
    await inA((tx) => updatePlayer(tx, ctx(), id, input({ firstName: 'Mario', lastName: 'López', phone: '2914111111', category: 7, position: 'reves', slots: ['noche'], instagram: 'mario.l' })));
    expect(await inA((tx) => getPlayer(tx, id))).toMatchObject({ lastName: 'López', category: 7, position: 'reves', slots: ['noche'], instagram: 'mario.l' });
    expect(await codeOf(inA((tx) => updatePlayer(tx, ctx(), id, input({ phone: '2914123456' }))))).toBe('phone_taken');
  });

  it('no deja actualizar ni ver un jugador de otro club', async () => {
    const idB = await t.withTenant(s.b.id, (tx) => createPlayer(tx, { clubId: s.b.id, country: 'AR' }, input({ phone: '2914222222' }), consent));
    expect(await inA((tx) => getPlayer(tx, idB))).toBeNull();
    expect(await codeOf(inA((tx) => updatePlayer(tx, ctx(), idB, input({ phone: '2914222222' }))))).toBe('not_found');
    expect(await codeOf(inA((tx) => softDeletePlayer(tx, { clubId: s.a.id, userId: s.ownerA }, idB)))).toBe('not_found');
  });

  it('la baja es lógica, queda en auditoría y libera el teléfono para reactivarlo', async () => {
    const id = await inA((tx) => createPlayer(tx, ctx(), input({ phone: '2914333333' }), consent));
    await inA((tx) => softDeletePlayer(tx, { clubId: s.a.id, userId: s.ownerA }, id));
    expect(await inA((tx) => getPlayer(tx, id))).toBeNull();
    expect((await inA((tx) => listPlayers(tx, { q: '2914333333' }))).total).toBe(0);
    expect((await t.withPlatform((tx) => tx.select().from(players).where(eq(players.id, id))))[0].deletedAt).not.toBeNull();
    const audit = await inA((tx) => tx.select().from(auditLog).where(eq(auditLog.action, 'players.delete')));
    expect(audit.some((a) => (a.detail as { playerId: string }).playerId === id)).toBe(true);
    expect(await codeOf(inA((tx) => softDeletePlayer(tx, { clubId: s.a.id, userId: s.ownerA }, id)))).toBe('not_found');
    const again = await inA((tx) => createPlayer(tx, ctx(), input({ firstName: 'Nuevo', phone: '2914333333' }), consent));
    expect(again).toBe(id);
    expect(await inA((tx) => getPlayer(tx, id))).toMatchObject({ firstName: 'Nuevo' });
  });
});

describe('listado y filtros', () => {
  const c7 = 7, c8 = 8;
  beforeAll(async () => {
    // 30 jugadores más, en el club A, para paginar
    for (let i = 0; i < 30; i++) {
      await inA((tx) => createPlayer(tx, ctx(), input({
        firstName: `Test${String(i).padStart(2, '0')}`, lastName: 'Zeta', phone: `29150000${String(i).padStart(2, '0')}`,
        gender: i % 2 ? 'female' : 'male', category: i % 3 === 0 ? c7 : c8, position: i % 2 ? 'drive' : 'reves', slots: i % 5 === 0 ? ['noche', 'tarde'] : ['manana'],
      }), consent));
    }
  });

  it('pagina de a 25 y ordena por apellido y nombre', async () => {
    const p1 = await inA((tx) => listPlayers(tx, { q: 'Zeta' }));
    expect(p1.total).toBe(30);
    expect(p1.rows).toHaveLength(PAGE_SIZE);
    expect(p1.pageCount).toBe(2);
    expect(p1.rows[0].firstName).toBe('Test00');
    const p2 = await inA((tx) => listPlayers(tx, { q: 'Zeta', page: 2 }));
    expect(p2.rows).toHaveLength(5);
    expect(p2.rows.map((r) => r.firstName)).toEqual(['Test25', 'Test26', 'Test27', 'Test28', 'Test29']);
  });

  it('filtra por categoría, género, posición y franja, y los combina', async () => {
    const r = (f: Parameters<typeof listPlayers>[1]) => inA((tx) => listPlayers(tx, { q: 'Zeta', ...f }));
    expect((await r({ category: c7 })).total).toBe(10);
    expect((await r({ gender: 'female' })).total).toBe(15);
    expect((await r({ position: 'drive' })).total).toBe(15);
    expect((await r({ slot: 'noche' })).total).toBe(6);
    // "7ma hombre": categoría + género
    const combo = await r({ category: c7, gender: 'male' });
    expect(combo.rows.every((x) => x.gender === 'male' && x.category === c7)).toBe(true);
    expect(combo.total).toBe(5);
    expect(combo.rows[0]).toMatchObject({ category: 7, gender: 'male' });
  });

  it('la búsqueda ignora mayúsculas, acepta teléfono y escapa comodines', async () => {
    expect((await inA((tx) => listPlayers(tx, { q: 'test07' }))).total).toBe(1);
    expect((await inA((tx) => listPlayers(tx, { q: 'zeta test07' }))).total).toBe(1); // también en orden apellido nombre
    expect((await inA((tx) => listPlayers(tx, { q: '2915000007' }))).total).toBe(1);
    expect((await inA((tx) => listPlayers(tx, { q: '%' }))).total).toBe(0);
    expect((await inA((tx) => listPlayers(tx, { q: '_' }))).total).toBe(0);
  });

  it('un club no ve los jugadores de otro en el listado', async () => {
    expect((await t.withTenant(s.b.id, (tx) => listPlayers(tx, { q: 'Zeta' }))).total).toBe(0);
  });
});
