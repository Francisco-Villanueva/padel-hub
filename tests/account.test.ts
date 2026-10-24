import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuthService } from '../src/server/auth/service';
import { hashPassword, passwordProblem, verifyPassword } from '../src/server/auth/password';
import { sha256 } from '../src/server/auth/jwt';
import { auditLog, authTokens, clubMembers, clubs, rateLimits, users } from '../src/server/db/schema';
import { emailConfig } from '../src/server/email/config';
import { appLink, sendEmail, setEmailTransportForTests } from '../src/server/email/send';
import { memoryTransport } from '../src/server/email/transport';
import { createAccountService } from '../src/server/services/account';
import { consumeToken, inspectToken, issueToken, TOKEN_TTL_SEC } from '../src/server/services/account-tokens';
import { createClubAsAdmin } from '../src/server/services/admin-clubs';
import { listMembers } from '../src/server/services/club-users';
import { setupDb } from './helpers';

const SECRET = 'test-secret-test-secret-test-secret-123';
const APP = 'https://app.ejemplo.com';
let clock = Date.parse('2026-11-02T12:00:00Z');
const advance = (ms: number) => { clock += ms; };
const tokenFrom = (html: string, route: 'restablecer' | 'activar') => html.match(new RegExp(`${APP}/(?:es|en|pt)/${route}/([A-Za-z0-9_-]+)`))![1];

let t: Awaited<ReturnType<typeof setupDb>>;
let mem: ReturnType<typeof memoryTransport>;
let account: ReturnType<typeof createAccountService>;
let auth: ReturnType<typeof createAuthService>;
let ids: { clubId: string; ownerId: string; staffId: string; disabledId: string; superId: string; noClubId: string };
const PW = 'clave-actual-1234';

// Devuelve lo que "salió" por correo después de correr el envío diferido, como haría la acción.
async function run(r: { deferred?: () => Promise<unknown> }) { await r.deferred?.(); return mem.outbox; }

beforeAll(async () => {
  t = await setupDb();
  const pwHash = await hashPassword(PW);
  const [club] = await t.withPlatform((tx) => tx.insert(clubs).values({ slug: 'club-a', name: 'Club A', locale: 'pt', timezone: 'America/Sao_Paulo' }).returning({ id: clubs.id }));
  const mk = async (email: string, name: string, extra: Partial<typeof users.$inferInsert> = {}) =>
    (await t.withPlatform((tx) => tx.insert(users).values({ email, name, passwordHash: pwHash, ...extra }).returning({ id: users.id })))[0].id;
  const ownerId = await mk('owner@a.test', 'Olga Owner');
  const staffId = await mk('staff@a.test', 'Sergio Staff', { locale: 'en' });
  const disabledId = await mk('off@a.test', 'Dora Off', { disabledAt: new Date(clock) });
  const superId = await mk('root@a.test', 'Root', { isSuperadmin: true });
  const noClubId = await mk('nadie@a.test', 'Nadia Nadie');
  await t.withPlatform((tx) => tx.insert(clubMembers).values([
    { clubId: club.id, userId: ownerId, role: 'owner' }, { clubId: club.id, userId: staffId, role: 'staff' }, { clubId: club.id, userId: disabledId, role: 'staff' },
  ]));
  ids = { clubId: club.id, ownerId, staffId, disabledId, superId, noClubId };

  account = createAccountService({
    runners: t, secret: SECRET, hashPassword, passwordProblem, send: sendEmail, now: () => new Date(clock),
    link: (p) => appLink(p, emailConfig({ NODE_ENV: 'production', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.com', APP_URL: APP })),
  });
  auth = createAuthService({ runners: t, secret: SECRET, verifyPassword, dummyHash: await hashPassword('dummy-dummy-dummy'), now: () => new Date(clock) });
});
afterAll(async () => { await t.client.close(); });

beforeEach(async () => {
  mem = memoryTransport();
  setEmailTransportForTests(mem);
  await t.withPlatform((tx) => tx.delete(rateLimits));
});

describe('tokens de un solo uso', () => {
  it('guarda solo el hash, sirve una vez y vence', async () => {
    const raw = await t.withPlatform((tx) => issueToken(tx, ids.staffId, 'reset', new Date(clock)));
    const rows = await t.withPlatform((tx) => tx.select().from(authTokens).where(eq(authTokens.userId, ids.staffId)));
    expect(rows.some((r) => r.tokenHash === raw)).toBe(false);
    expect(rows.some((r) => r.tokenHash === sha256(raw))).toBe(true);
    expect(await t.withPlatform((tx) => inspectToken(tx, raw, 'reset', new Date(clock)))).toEqual({ userId: ids.staffId });
    expect(await t.withPlatform((tx) => inspectToken(tx, raw, 'invite', new Date(clock)))).toBeNull(); // otro tipo de link
    expect(await t.withPlatform((tx) => consumeToken(tx, raw, 'reset', new Date(clock)))).toBe(ids.staffId);
    expect(await t.withPlatform((tx) => consumeToken(tx, raw, 'reset', new Date(clock)))).toBeNull(); // ya usado

    const later = await t.withPlatform((tx) => issueToken(tx, ids.staffId, 'reset', new Date(clock)));
    expect(await t.withPlatform((tx) => consumeToken(tx, later, 'reset', new Date(clock + TOKEN_TTL_SEC.reset * 1000 + 1000)))).toBeNull(); // vencido
  });

  it('dos usos simultáneos del mismo link: solo uno gana', async () => {
    const raw = await t.withPlatform((tx) => issueToken(tx, ids.staffId, 'reset', new Date(clock)));
    const [a, b] = await Promise.all([
      t.withPlatform((tx) => consumeToken(tx, raw, 'reset', new Date(clock))),
      t.withPlatform((tx) => consumeToken(tx, raw, 'reset', new Date(clock))),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('un token nuevo invalida el anterior del mismo tipo; tokens malformados no pasan', async () => {
    const first = await t.withPlatform((tx) => issueToken(tx, ids.staffId, 'reset', new Date(clock)));
    const second = await t.withPlatform((tx) => issueToken(tx, ids.staffId, 'reset', new Date(clock)));
    expect(await t.withPlatform((tx) => consumeToken(tx, first, 'reset', new Date(clock)))).toBeNull();
    expect(await t.withPlatform((tx) => inspectToken(tx, second, 'reset', new Date(clock)))).not.toBeNull();
    for (const bad of ['', 'corto', "x' or '1'='1", 'a'.repeat(300), 'con espacios y símbolos!!!!!!!']) {
      expect(await t.withPlatform((tx) => inspectToken(tx, bad, 'reset', new Date(clock)))).toBeNull();
    }
  });
});

describe('restablecer contraseña', () => {
  it('manda el correo con un link de un solo uso, en el idioma del usuario', async () => {
    const r = await account.requestReset({ email: 'staff@a.test', ip: '1.1.1.1' });
    expect(r.status).toBe('ok');
    expect(mem.outbox).toHaveLength(0); // el envío es diferido: no ocurre hasta que la acción lo corre
    const [m] = await run(r);
    expect(m).toMatchObject({ to: 'staff@a.test', subject: 'Reset your PadelHub password' }); // idioma propio del usuario (en)
    expect(m.html).toContain(`${APP}/en/restablecer/`);
    expect(m.text).toContain(`${APP}/en/restablecer/`);
  });

  it('sin idioma propio usa el del club', async () => {
    const [m] = await run(await account.requestReset({ email: 'owner@a.test' }));
    expect(m.subject).toBe('Redefina sua senha do PadelHub'); // club en portugués
  });

  it('responde igual exista o no la cuenta, y no escribe a quien no corresponde', async () => {
    const real = await account.requestReset({ email: 'staff@a.test' });
    const ghost = await account.requestReset({ email: 'no-existe@a.test' });
    expect(real.status).toBe('ok');
    expect(ghost.status).toBe('ok');
    expect(ghost.deferred).toBeUndefined();
    for (const email of ['off@a.test', 'nadie@a.test', 'no-existe@a.test']) {
      const r = await account.requestReset({ email });
      expect(r.status).toBe('ok');
      expect(r.deferred).toBeUndefined(); // deshabilitada o sin club activo: no se manda nada
    }
    expect(mem.outbox).toHaveLength(0);
  });

  it('el superadmin sin club también puede restablecer', async () => {
    const [m] = await run(await account.requestReset({ email: 'root@a.test' }));
    expect(m.to).toBe('root@a.test');
  });

  it('tiene tope por email y por IP, y nunca revela la existencia de la cuenta', async () => {
    const hit = () => account.requestReset({ email: 'staff@a.test', ip: '2.2.2.2' });
    expect((await hit()).status).toBe('ok');
    expect((await hit()).status).toBe('ok');
    expect((await hit()).status).toBe('ok');
    expect((await hit()).status).toBe('rate_limited');
    for (let i = 0; i < 10; i++) await account.requestReset({ email: `x${i}@a.test`, ip: '3.3.3.3' });
    expect((await account.requestReset({ email: 'otro@a.test', ip: '3.3.3.3' })).status).toBe('rate_limited');
    expect((await account.requestReset({ email: 'inexistente@a.test', ip: '9.9.9.9' })).status).toBe('ok');
  });

  it('completa el cambio: nueva clave, sesiones cerradas, bloqueo levantado y aviso por correo', async () => {
    const session = await auth.login({ email: 'staff@a.test', password: PW });
    expect(session.status).toBe('ok');
    const refresh = session.status === 'ok' ? session.tokens.refreshToken : '';
    await t.withPlatform((tx) => tx.update(users).set({ failedLogins: 3, lockedUntil: new Date(clock + 600_000) }).where(eq(users.id, ids.staffId)));

    const req = await account.requestReset({ email: 'staff@a.test' });
    const [link] = await run(req);
    const token = tokenFrom(link.html, 'restablecer');
    expect(await account.isTokenValid(token, 'reset')).toBe(true);

    mem.outbox.length = 0;
    const done = await account.completeReset({ token, password: 'otra-clave-nueva-99' });
    expect(done.status).toBe('ok');
    const [notice] = await run(done);
    expect(notice.subject).toBe('You changed your PadelHub password');
    expect(notice.html).toContain(`${APP}/en/restablecer`); // "Restablecer mi contraseña" lleva a pedir otro link
    expect(notice.html).not.toContain('otra-clave-nueva-99');

    const [u] = await t.withPlatform((tx) => tx.select().from(users).where(eq(users.id, ids.staffId)));
    expect(await verifyPassword(u.passwordHash, 'otra-clave-nueva-99')).toBe(true);
    expect(await verifyPassword(u.passwordHash, PW)).toBe(false);
    expect(u).toMatchObject({ failedLogins: 0, lockedUntil: null });
    expect((await auth.refresh(refresh)).status).toBe('invalid'); // la sesión abierta con la clave vieja se cerró
    expect((await auth.login({ email: 'staff@a.test', password: 'otra-clave-nueva-99' })).status).toBe('ok');
    expect((await t.withPlatform((tx) => tx.select().from(auditLog).where(eq(auditLog.action, 'auth.password_reset')))).length).toBeGreaterThan(0);

    // El mismo link no sirve dos veces
    expect(await account.isTokenValid(token, 'reset')).toBe(false);
    expect((await account.completeReset({ token, password: 'tercera-clave-123' })).status).toBe('invalid');
    await t.withPlatform((tx) => tx.update(users).set({ passwordHash: u.passwordHash }).where(eq(users.id, ids.staffId)));
  });

  it('una clave débil no gasta el link; un link vencido, ajeno o de otro tipo es inválido', async () => {
    const [link] = await run(await account.requestReset({ email: 'owner@a.test' }));
    const token = tokenFrom(link.html, 'restablecer');
    expect((await account.completeReset({ token, password: 'corta' })).status).toBe('weak');
    expect(await account.isTokenValid(token, 'reset')).toBe(true); // sigue sirviendo
    expect(await account.isTokenValid(token, 'invite')).toBe(false); // un link de restablecer no activa cuentas
    expect((await account.activate({ token, password: 'una-clave-valida-12' })).status).toBe('invalid');
    advance(TOKEN_TTL_SEC.reset * 1000 + 5000);
    expect((await account.completeReset({ token, password: 'una-clave-valida-12' })).status).toBe('invalid');
    expect((await account.completeReset({ token: 'inventado-inventado-inventado', password: 'una-clave-valida-12' })).status).toBe('invalid');
  });

  it('sin configuración de correo (deshabilitado) no hace nada y avisa', async () => {
    const off = createAccountService({ runners: t, secret: SECRET, hashPassword, passwordProblem, send: sendEmail, link: () => null });
    expect((await off.requestReset({ email: 'staff@a.test' })).status).toBe('disabled');
    await expect(off.inviteStaff({ clubId: ids.clubId, userId: ids.ownerId }, { name: 'X', email: 'x@a.test' })).rejects.toMatchObject({ code: 'email_disabled' });
    expect(await off.welcomeOwner(ids.clubId, ids.ownerId, { pending: true })).toBeNull();
  });
});

describe('invitación por correo', () => {
  let invitedId: string;

  it('crea la cuenta sin contraseña utilizable y manda el link de activación', async () => {
    const r = await account.inviteStaff({ clubId: ids.clubId, userId: ids.ownerId }, { name: 'Ines Invitada', email: ' Ines@A.test ' });
    invitedId = r.userId;
    const [u] = await t.withPlatform((tx) => tx.select().from(users).where(eq(users.id, invitedId)));
    expect(u).toMatchObject({ email: 'ines@a.test', activatedAt: null });
    expect((await t.withPlatform((tx) => tx.select().from(clubMembers).where(eq(clubMembers.userId, invitedId))))[0].role).toBe('staff');
    // No puede entrar mientras no active: ni con una clave vacía, ni adivinada.
    expect((await auth.login({ email: 'ines@a.test', password: 'cualquier-cosa-123' })).status).toBe('invalid_credentials');

    const [m] = await run(r);
    expect(m.subject).toBe('Olga Owner convidou você para Club A no PadelHub'); // idioma del club, nombre de quien invita
    expect(m.html).toContain('<b>funcionário</b> em <b>Club A</b>');
    expect(m.html).toContain(`${APP}/pt/activar/`);
  });

  it('el panel del club ve quién está pendiente', async () => {
    const members = await t.withTenant(ids.clubId, (tx) => listMembers(tx));
    expect(members.find((x) => x.userId === invitedId)?.activatedAt).toBeNull();
    expect(members.find((x) => x.userId === ids.ownerId)?.activatedAt).not.toBeNull();
  });

  it('un email que ya tiene cuenta no se invita', async () => {
    await expect(account.inviteStaff({ clubId: ids.clubId, userId: ids.ownerId }, { name: 'Otro', email: 'STAFF@a.test' })).rejects.toMatchObject({ code: 'email_taken' });
  });

  it('reenviar deja sin efecto el link anterior y tiene tope', async () => {
    const [first] = await run(await account.inviteStaff({ clubId: ids.clubId, userId: ids.ownerId }, { name: 'Ramiro Reenvío', email: 'ramiro@a.test' }).then((r) => ({ deferred: r.deferred })));
    const oldToken = tokenFrom(first.html, 'activar');
    const target = (await t.withPlatform((tx) => tx.select({ id: users.id }).from(users).where(eq(users.email, 'ramiro@a.test'))))[0].id;

    mem.outbox.length = 0;
    const second = await account.resendInvite({ clubId: ids.clubId, userId: ids.ownerId }, target);
    const [again] = await run(second);
    expect(tokenFrom(again.html, 'activar')).not.toBe(oldToken);
    expect(await account.isTokenValid(oldToken, 'invite')).toBe(false);
    await account.resendInvite({ clubId: ids.clubId, userId: ids.ownerId }, target);
    await account.resendInvite({ clubId: ids.clubId, userId: ids.ownerId }, target);
    await expect(account.resendInvite({ clubId: ids.clubId, userId: ids.ownerId }, target)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('no se reenvía a quien ya activó, a otro club, ni al dueño sin ser superadmin', async () => {
    await expect(account.resendInvite({ clubId: ids.clubId, userId: ids.ownerId }, ids.staffId)).rejects.toMatchObject({ code: 'not_pending' });
    await expect(account.resendInvite({ clubId: ids.clubId, userId: ids.ownerId }, ids.superId)).rejects.toMatchObject({ code: 'not_found' });
    await t.withPlatform((tx) => tx.update(users).set({ activatedAt: null }).where(eq(users.id, ids.ownerId)));
    await expect(account.resendInvite({ clubId: ids.clubId, userId: ids.staffId }, ids.ownerId)).rejects.toMatchObject({ code: 'not_staff' });
    await expect(account.resendInvite({ clubId: ids.clubId, userId: ids.superId, allowOwner: true }, ids.ownerId)).resolves.toBeTruthy(); // el superadmin sí
    await t.withPlatform((tx) => tx.update(users).set({ activatedAt: new Date(clock) }).where(eq(users.id, ids.ownerId)));
  });

  it('activar: elige su contraseña, queda activa y entra; el link no sirve dos veces', async () => {
    const [m] = await run(await account.resendInvite({ clubId: ids.clubId, userId: ids.ownerId }, invitedId));
    const token = tokenFrom(m.html, 'activar');
    expect((await account.activate({ token, password: 'corta' })).status).toBe('weak');
    const ok = await account.activate({ token, password: 'mi-clave-nueva-2026' });
    expect(ok).toMatchObject({ status: 'ok', locale: 'pt' });
    const [u] = await t.withPlatform((tx) => tx.select().from(users).where(eq(users.id, invitedId)));
    expect(u.activatedAt).not.toBeNull();
    expect((await auth.login({ email: 'ines@a.test', password: 'mi-clave-nueva-2026' })).status).toBe('ok');
    expect((await account.activate({ token, password: 'otra-clave-distinta-1' })).status).toBe('invalid');
  });

  it('un link de invitación vencido no activa nada', async () => {
    const r = await account.inviteStaff({ clubId: ids.clubId, userId: ids.ownerId }, { name: 'Vera Vencida', email: 'vera@a.test' });
    const [m] = await run(r);
    advance(TOKEN_TTL_SEC.invite * 1000 + 5000);
    expect((await account.activate({ token: tokenFrom(m.html, 'activar'), password: 'una-clave-valida-12' })).status).toBe('invalid');
  });
});

describe('bienvenida del club', () => {
  const newClub = (slug: string, owner: string) => ({
    slug, name: `Club ${slug}`, country: 'AR' as const, locale: 'es' as const, timezone: 'America/Argentina/Buenos_Aires' as const,
    ownerName: `Dueño ${slug}`, ownerEmail: owner, ownerPassword: 'x'.repeat(12),
  });

  it('dueño por invitación: la cuenta queda pendiente y el correo lleva a activarla, con el link de alta', async () => {
    const res = await t.withPlatform(async (tx) => createClubAsAdmin(tx, { userId: ids.superId }, newClub('club-nuevo', 'nuevo@dueno.test'), await account.unusablePassword(), { pending: true }));
    if ('error' in res) throw new Error(res.error);
    const [owner] = await t.withPlatform((tx) => tx.select().from(users).where(eq(users.id, res.ownerId)));
    expect(owner.activatedAt).toBeNull();

    const deferred = await account.welcomeOwner(res.id, res.ownerId, { pending: true });
    const [m] = await run({ deferred: deferred! });
    expect(m.to).toBe('nuevo@dueno.test');
    expect(m.subject).toBe('Club club-nuevo ya está en PadelHub');
    expect(m.html).toContain('Activar mi cuenta y entrar');
    expect(m.html).toContain(`${APP}/es/activar/`);
    expect(m.html).toMatch(new RegExp(`${APP}/es/c/club-nuevo/[A-Za-z0-9_-]{10,}`)); // link público de alta del club
    expect(m.text).not.toMatch(/contraseña inicial/i);
    // y puede activar su cuenta con ese link
    expect((await account.activate({ token: tokenFrom(m.html, 'activar'), password: 'clave-del-dueno-2026' })).status).toBe('ok');
  });

  it('dueño con contraseña inicial: el botón lleva al login', async () => {
    const res = await t.withPlatform(async (tx) => createClubAsAdmin(tx, { userId: ids.superId }, newClub('club-clave', 'clave@dueno.test'), await hashPassword('clave-inicial-1234')));
    if ('error' in res) throw new Error(res.error);
    const [owner] = await t.withPlatform((tx) => tx.select().from(users).where(eq(users.id, res.ownerId)));
    expect(owner.activatedAt).not.toBeNull(); // por defecto nace activada
    const [m] = await run({ deferred: (await account.welcomeOwner(res.id, res.ownerId, { pending: false }))! });
    expect(m.html).toContain('Entrar al panel');
    expect(m.html).toContain(`${APP}/es/login`);
    expect(m.html).not.toContain('/activar/');
  });

  it('no deja tokens sin usar de más: una bienvenida pendiente tiene un solo link vigente', async () => {
    const rows = await t.withPlatform((tx) => tx.select().from(authTokens).where(and(eq(authTokens.kind, 'invite'), isNull(authTokens.usedAt))));
    const perUser = new Map<string, number>();
    for (const r of rows) perUser.set(r.userId, (perUser.get(r.userId) ?? 0) + 1);
    expect([...perUser.values()].every((n) => n === 1)).toBe(true);
  });
});
