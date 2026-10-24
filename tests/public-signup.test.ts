import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clubs, playerConsents, players, signupLinks } from '../src/server/db/schema';
import { allowSignupAttempt, registerPublicPlayer, resolveSignupTarget, SIGNUP_LIMIT_PER_IP } from '../src/server/services/public-signup';
import { seedTwoClubs, setupDb } from './helpers';

let t: Awaited<ReturnType<typeof setupDb>>;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
const input = { firstName: 'Ana', lastName: 'Gil', gender: 'female' as const, slots: [], phone: '2914000111' };

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  await t.withPlatform((tx) => tx.insert(signupLinks).values([
    { clubId: s.a.id, token: 'tok-link-a', kind: 'link' },
    { clubId: s.a.id, token: 'tok-tablet-a', kind: 'tablet' },
    { clubId: s.a.id, token: 'tok-off-a', kind: 'link', active: false },
    { clubId: s.b.id, token: 'tok-link-b', kind: 'link' },
  ]));
});
afterAll(async () => { await t.client.close(); });

const resolve = (slug: string, token: string) => t.withPlatform((tx) => resolveSignupTarget(tx, slug, token));

describe('alta pública', () => {
  it('devuelve el color de marca del club (o null) para pintar el formulario', async () => {
    expect((await resolve('club-a', 'tok-link-a'))?.colorPrimary).toBeNull();
    await t.withPlatform((tx) => tx.update(clubs).set({ colorPrimary: '#e4572e' }).where(eq(clubs.id, s.a.id)));
    expect((await resolve('club-a', 'tok-link-a'))?.colorPrimary).toBe('#e4572e');
    await t.withPlatform((tx) => tx.update(clubs).set({ colorPrimary: null }).where(eq(clubs.id, s.a.id)));
  });

  it('resuelve el club solo con el par slug + token válido y activo', async () => {
    expect(await resolve('club-a', 'tok-link-a')).toMatchObject({ clubId: s.a.id, kind: 'link', name: 'Club club-a' });
    expect(await resolve('club-a', 'tok-tablet-a')).toMatchObject({ kind: 'tablet' });
    expect(await resolve('club-b', 'tok-link-a')).toBeNull(); // token de otro club
    expect(await resolve('club-a', 'tok-off-a')).toBeNull(); // link desactivado
    expect(await resolve('club-a', 'nope')).toBeNull();
    expect(await resolve('Club A;--', 'tok-link-a')).toBeNull(); // entrada inválida: ni llega a la base
  });

  it('registra el jugador con el origen y el consentimiento del link, en su club', async () => {
    const target = (await resolve('club-a', 'tok-tablet-a'))!;
    const r = await t.withTenant(s.a.id, (tx) => registerPublicPlayer(tx, target, { ...input, category: 7 }, 'pt'));
    expect(r).toEqual({ status: 'created' });
    const [p] = await t.withTenant(s.a.id, (tx) => tx.select().from(players).where(eq(players.phoneE164, '+542914000111')));
    expect(p).toMatchObject({ source: 'tablet', clubId: s.a.id });
    const [c] = await t.withTenant(s.a.id, (tx) => tx.select().from(playerConsents).where(eq(playerConsents.playerId, p.id)));
    expect(c).toMatchObject({ source: 'tablet', locale: 'pt', textVersion: '2026-10-v0' });
    expect(await t.withTenant(s.b.id, (tx) => tx.select().from(players))).toHaveLength(0); // el otro club no ve nada
  });

  it('un teléfono repetido no modifica al jugador existente', async () => {
    const target = (await resolve('club-a', 'tok-link-a'))!;
    const r = await t.withTenant(s.a.id, (tx) => registerPublicPlayer(tx, target, { ...input, firstName: 'Otra', lastName: 'Persona' }, 'es'));
    expect(r).toEqual({ status: 'exists' });
    const [p] = await t.withTenant(s.a.id, (tx) => tx.select().from(players).where(eq(players.phoneE164, '+542914000111')));
    expect(p.firstName).toBe('Ana');
  });

  it('rechaza teléfonos inválidos', async () => {
    const target = (await resolve('club-a', 'tok-link-a'))!;
    expect(await t.withTenant(s.a.id, (tx) => registerPublicPlayer(tx, target, { ...input, phone: '12' }, 'es'))).toEqual({ status: 'error', code: 'invalid_phone' });
  });

  it('limita los intentos por IP dentro de la ventana y los libera después', async () => {
    const target = (await resolve('club-b', 'tok-link-b'))!;
    const t0 = new Date('2026-10-01T10:00:00Z');
    const results: boolean[] = [];
    for (let i = 0; i <= SIGNUP_LIMIT_PER_IP.max; i++) results.push(await t.withPlatform((tx) => allowSignupAttempt(tx, target, 'iphash', t0)));
    expect(results.slice(0, SIGNUP_LIMIT_PER_IP.max).every(Boolean)).toBe(true);
    expect(results[SIGNUP_LIMIT_PER_IP.max]).toBe(false);
    const later = new Date(t0.getTime() + (SIGNUP_LIMIT_PER_IP.windowSec + 1) * 1000);
    expect(await t.withPlatform((tx) => allowSignupAttempt(tx, target, 'iphash', later))).toBe(true);
  });
});
