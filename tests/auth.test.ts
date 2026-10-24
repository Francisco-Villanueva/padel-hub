import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOCKOUT_MS, MAX_FAILED_LOGINS, REFRESH_CONCURRENCY_GRACE_MS } from '../src/server/auth/config';
import { safeNext } from '../src/server/auth/http';
import { jwtKey, sha256, verifyAccessToken } from '../src/server/auth/jwt';
import { hashPassword, passwordProblem, verifyPassword } from '../src/server/auth/password';
import { createAuthService, type Tokens } from '../src/server/auth/service';
import { clubMembers, clubs, rateLimits, refreshTokens, users } from '../src/server/db/schema';
import { createClub } from '../src/server/services/clubs';
import { setupDb } from './helpers';

const SECRET = 'test-secret-test-secret-test-secret-123';
const PW = 'correct-horse-battery';
const key = jwtKey(SECRET);

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let clock = Date.parse('2026-11-01T12:00:00Z');
const advance = (ms: number) => { clock += ms; };
let svc: ReturnType<typeof createAuthService>;
let ids: { clubA: string; clubB: string; ownerA: string; staffA: string; multi: string; sa: string; nobody: string };
let pwHash: string;
let seq = 0;

const ok = (r: { status: string }) => {
  expect(r.status).toBe('ok');
  return (r as unknown as { tokens: Tokens }).tokens;
};

async function mkUser(email: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await t.withPlatform((tx) => tx.insert(users).values({ email, name: email, passwordHash: pwHash, ...extra }).returning({ id: users.id }));
  return u.id;
}

beforeAll(async () => {
  t = await setupDb();
  pwHash = await hashPassword(PW);
  svc = createAuthService({
    runners: t, secret: SECRET, verifyPassword, dummyHash: await hashPassword('dummy-dummy-dummy'), now: () => new Date(clock),
  });
  const a = await t.withPlatform((tx) => createClub(tx, { slug: 'club-a', name: 'Club A', owner: { email: 'owner-a@test.dev', name: 'Owner A', passwordHash: pwHash } }));
  const b = await t.withPlatform((tx) => createClub(tx, { slug: 'club-b', name: 'Club B', owner: { email: 'owner-b@test.dev', name: 'Owner B', passwordHash: pwHash } }));
  const staffA = await mkUser('staff-a@test.dev');
  const multi = await mkUser('multi@test.dev');
  const sa = await mkUser('root@test.dev', { isSuperadmin: true });
  const nobody = await mkUser('nobody@test.dev');
  await t.withPlatform((tx) => tx.insert(clubMembers).values([
    { clubId: a.club.id, userId: staffA, role: 'staff' },
    { clubId: a.club.id, userId: multi, role: 'staff' },
    { clubId: b.club.id, userId: multi, role: 'owner' },
  ]));
  ids = { clubA: a.club.id, clubB: b.club.id, ownerA: a.ownerId, staffA, multi, sa, nobody };
});
afterAll(async () => { await t.client.close(); });

// Cada test usa su propio IP para no mezclar rate limits; el limitador por email se limpia entre tests.
beforeEach(async () => {
  seq++;
  await t.withPlatform((tx) => tx.delete(rateLimits));
  await t.withPlatform((tx) => tx.update(users).set({ failedLogins: 0, lockedUntil: null, disabledAt: null }));
  await t.withPlatform((tx) => tx.update(clubs).set({ status: 'active' }));
});

const login = (email: string, password = PW, clubId?: string) => svc.login({ email, password, clubId }, { ip: `10.0.0.${seq}`, userAgent: 'vitest' });

describe('login', () => {
  it('emite access JWT y refresh opaco; el refresh solo se guarda hasheado', async () => {
    const tk = ok(await login('owner-a@test.dev'));
    expect(tk.session).toMatchObject({ userId: ids.ownerA, clubId: ids.clubA, role: 'owner', isSuperadmin: false });
    expect(await verifyAccessToken(tk.accessToken, key, new Date(clock))).toMatchObject({ userId: ids.ownerA, clubId: ids.clubA, role: 'owner' });
    expect(tk.accessExp - Math.floor(clock / 1000)).toBe(15 * 60);
    const rows = await t.withPlatform((tx) => tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(tk.refreshToken))));
    expect(rows).toHaveLength(1);
    expect(rows.some((r) => r.tokenHash === tk.refreshToken)).toBe(false);
  });

  it('email en mayúsculas funciona', async () => {
    ok(await login('  OWNER-A@test.dev '));
  });

  it('contraseña incorrecta y email inexistente dan la misma respuesta', async () => {
    expect(await login('owner-a@test.dev', 'wrong-password-1')).toEqual({ status: 'invalid_credentials' });
    expect(await login('nadie@test.dev')).toEqual({ status: 'invalid_credentials' });
  });

  it('usuario deshabilitado no entra', async () => {
    await t.withPlatform((tx) => tx.update(users).set({ disabledAt: new Date(clock) }).where(eq(users.id, ids.staffA)));
    expect(await login('staff-a@test.dev')).toEqual({ status: 'invalid_credentials' });
  });

  it('se bloquea tras varios intentos fallidos, incluso con la clave correcta, y se libera con el tiempo', async () => {
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) expect((await login('staff-a@test.dev', 'bad-password-xx')).status).toBe('invalid_credentials');
    expect((await login('staff-a@test.dev', 'bad-password-xx')).status).toBe('locked');
    expect((await login('staff-a@test.dev')).status).toBe('locked');
    advance(LOCKOUT_MS + 1000);
    ok(await login('staff-a@test.dev'));
  });

  it('limita intentos por email (rate limit persistente)', async () => {
    for (let i = 0; i < 10; i++) await svc.login({ email: 'nadie@test.dev', password: 'x' }, { ip: `10.1.${i}.1` });
    expect((await svc.login({ email: 'nadie@test.dev', password: 'x' }, { ip: '10.9.9.9' })).status).toBe('rate_limited');
    advance(16 * 60_000);
    expect((await svc.login({ email: 'nadie@test.dev', password: 'x' }, { ip: '10.9.9.9' })).status).toBe('invalid_credentials');
  });

  it('usuario con varios clubes elige uno; con un club entra directo', async () => {
    const r = await login('multi@test.dev');
    expect(r.status).toBe('choose_club');
    expect((r as { clubs: { clubId: string }[] }).clubs.map((c) => c.clubId).sort()).toEqual([ids.clubA, ids.clubB].sort());
    const tk = ok(await login('multi@test.dev', PW, ids.clubB));
    expect(tk.session).toMatchObject({ clubId: ids.clubB, role: 'owner' });
  });

  it('no se puede elegir un club del que no se es miembro', async () => {
    expect(await login('staff-a@test.dev', PW, ids.clubB)).toEqual({ status: 'no_access' });
  });

  it('superadmin entra sin club; sin membresías un usuario común no entra', async () => {
    const tk = ok(await login('root@test.dev'));
    expect(tk.session).toMatchObject({ clubId: null, role: null, isSuperadmin: true });
    expect(await login('nobody@test.dev')).toEqual({ status: 'no_access' });
  });

  it('un club suspendido no deja entrar', async () => {
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, ids.clubA)));
    expect(await login('owner-a@test.dev')).toEqual({ status: 'no_access' });
  });
});

describe('refresh rotativo', () => {
  it('rota: el token nuevo funciona y el viejo ya no', async () => {
    const first = ok(await login('owner-a@test.dev'));
    advance(60_000);
    const second = ok(await svc.refresh(first.refreshToken));
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.session.familyId).toBe(first.session.familyId);
    expect(second.session).toMatchObject({ clubId: ids.clubA, role: 'owner' });
    ok(await svc.refresh(second.refreshToken));
  });

  it('dos refresh simultáneos con el mismo token no revocan la sesión', async () => {
    const first = ok(await login('owner-a@test.dev'));
    const second = ok(await svc.refresh(first.refreshToken));
    advance(REFRESH_CONCURRENCY_GRACE_MS - 1000);
    expect(await svc.refresh(first.refreshToken)).toEqual({ status: 'concurrent' });
    ok(await svc.refresh(second.refreshToken));
  });

  it('reusar un refresh viejo fuera de la ventana revoca toda la familia', async () => {
    const first = ok(await login('owner-a@test.dev'));
    const second = ok(await svc.refresh(first.refreshToken));
    advance(REFRESH_CONCURRENCY_GRACE_MS + 1000);
    expect(await svc.refresh(first.refreshToken)).toEqual({ status: 'replay' });
    expect(await svc.refresh(second.refreshToken)).toEqual({ status: 'invalid' });
  });

  it('un refresh vencido, desconocido o vacío es inválido', async () => {
    const tk = ok(await login('owner-a@test.dev'));
    expect(await svc.refresh('')).toEqual({ status: 'invalid' });
    expect(await svc.refresh('no-existe')).toEqual({ status: 'invalid' });
    advance(31 * 24 * 3600 * 1000);
    expect(await svc.refresh(tk.refreshToken)).toEqual({ status: 'invalid' });
  });

  it('si el usuario fue deshabilitado, el refresh falla y revoca la sesión', async () => {
    const tk = ok(await login('staff-a@test.dev'));
    await t.withPlatform((tx) => tx.update(users).set({ disabledAt: new Date(clock) }).where(eq(users.id, ids.staffA)));
    expect(await svc.refresh(tk.refreshToken)).toEqual({ status: 'no_access' });
  });

  it('si lo sacaron del club, el refresh falla', async () => {
    const tk = ok(await login('staff-a@test.dev'));
    await t.withPlatform((tx) => tx.delete(clubMembers).where(eq(clubMembers.userId, ids.staffA)));
    expect(await svc.refresh(tk.refreshToken)).toEqual({ status: 'no_access' });
    await t.withPlatform((tx) => tx.insert(clubMembers).values({ clubId: ids.clubA, userId: ids.staffA, role: 'staff' }));
  });

  it('el rol se relee de la base en cada refresh', async () => {
    const tk = ok(await login('staff-a@test.dev'));
    await t.withPlatform((tx) => tx.update(clubMembers).set({ role: 'owner' }).where(eq(clubMembers.userId, ids.staffA)));
    expect(ok(await svc.refresh(tk.refreshToken)).session.role).toBe('owner');
    await t.withPlatform((tx) => tx.update(clubMembers).set({ role: 'staff' }).where(eq(clubMembers.userId, ids.staffA)));
  });

  it('si el club se suspende, el refresh falla', async () => {
    const tk = ok(await login('owner-a@test.dev'));
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, ids.clubA)));
    expect(await svc.refresh(tk.refreshToken)).toEqual({ status: 'no_access' });
  });

  it('cambiar de club reemite el token con otro cid; uno ajeno se rechaza', async () => {
    const tk = ok(await login('multi@test.dev', PW, ids.clubA));
    const switched = ok(await svc.refresh(tk.refreshToken, {}, { clubId: ids.clubB }));
    expect(switched.session).toMatchObject({ clubId: ids.clubB, role: 'owner' });
    expect(await svc.refresh(switched.refreshToken, {}, { clubId: '00000000-0000-4000-8000-000000000000' })).toEqual({ status: 'invalid' });
  });
});

describe('logout y revocación', () => {
  it('logout invalida la sesión entera', async () => {
    const first = ok(await login('owner-a@test.dev'));
    const second = ok(await svc.refresh(first.refreshToken));
    await svc.logout(second.refreshToken);
    expect(await svc.refresh(second.refreshToken)).toEqual({ status: 'invalid' });
    await svc.logout(second.refreshToken); // idempotente
    await svc.logout(undefined);
  });

  it('revokeAllForUser cierra todas las sesiones del usuario', async () => {
    const s1 = ok(await login('staff-a@test.dev'));
    const s2 = ok(await login('staff-a@test.dev'));
    await svc.revokeAllForUser(ids.staffA);
    expect(await svc.refresh(s1.refreshToken)).toEqual({ status: 'invalid' });
    expect(await svc.refresh(s2.refreshToken)).toEqual({ status: 'invalid' });
  });
});

describe('access token JWT', () => {
  const claims = { cid: null, role: 'owner', sa: false, sid: 'fam' };

  it('rechaza firma ajena, token vencido, alg none y basura', async () => {
    const tk = ok(await login('owner-a@test.dev'));
    expect(await verifyAccessToken(tk.accessToken, jwtKey('otro-secreto-otro-secreto-otro-secreto-1'), new Date(clock))).toBeNull();
    expect(await verifyAccessToken(tk.accessToken, key, new Date(clock + 16 * 60_000))).toBeNull();
    expect(await verifyAccessToken(tk.accessToken.slice(0, -3) + 'abc', key, new Date(clock))).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'x', sid: 'y' })).toString('base64url')}.`;
    expect(await verifyAccessToken(none, key, new Date(clock))).toBeNull();
    expect(await verifyAccessToken('basura', key)).toBeNull();
    expect(await verifyAccessToken(undefined, key)).toBeNull();
  });

  it('rechaza un token con issuer/audience distintos', async () => {
    const forged = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject('u').setIssuer('otro').setAudience('padelhub-app')
      .setIssuedAt().setExpirationTime('5m').sign(key);
    expect(await verifyAccessToken(forged, key)).toBeNull();
  });

  it('exige secreto de al menos 32 caracteres', () => {
    expect(() => jwtKey('corto')).toThrow();
    expect(() => jwtKey(undefined)).toThrow();
  });
});

describe('utilidades', () => {
  it('safeNext solo acepta rutas internas', () => {
    expect(safeNext('/es/app/jugadores?x=1')).toBe('/es/app/jugadores?x=1');
    for (const bad of ['https://malo.com', '//malo.com', '/\\malo.com', 'javascript:alert(1)', '/api/auth/refresh?next=/es/app', '', null]) expect(safeNext(bad, '/')).toBe('/');
  });

  it('contraseñas: argon2id, política mínima', async () => {
    expect(pwHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(pwHash, 'incorrecta-123')).toBe(false);
    expect(await verifyPassword('no-es-un-hash', PW)).toBe(false);
    expect(passwordProblem('corta')).toBe('too_short');
    expect(passwordProblem('una-clave-razonable')).toBeNull();
  });
});
