import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { brandSchema, newClubSchema, newStaffSchema } from '../src/lib/club-schema';
import { contrastRatio, lowContrastWithWhite, textOn } from '../src/lib/color';
import { auditLog, clubMembers, clubs, refreshTokens, signupLinks, users } from '../src/server/db/schema';
import { clubDetail, createClubAsAdmin, listClubs, setClubStatus } from '../src/server/services/admin-clubs';
import { getBrand, listLinks, rotateLink, setLinkActive, updateBrand } from '../src/server/services/club-settings';
import { addStaff, listMembers, removeStaff, resetPassword, UserError } from '../src/server/services/club-users';
import { resolveSignupTarget } from '../src/server/services/public-signup';
import { seedTwoClubs, setupDb } from './helpers';

let t: Awaited<ReturnType<typeof setupDb>>;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
const inA = <T>(fn: Parameters<typeof t.withTenant<T>>[1]) => t.withTenant(s.a.id, fn);
const ctxA = () => ({ clubId: s.a.id, userId: s.ownerA });
const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof UserError ? e.code : `other:${e}`; } };

beforeAll(async () => { t = await setupDb(); s = await seedTwoClubs(t); });
afterAll(async () => { await t.client.close(); });

describe('validación', () => {
  it('marca: colores hex, zona horaria de la lista y vacíos como ausentes', () => {
    expect(brandSchema.safeParse({ name: 'Club', locale: 'es', timezone: 'America/Santiago', colorPrimary: '#E4572E', colorAccent: '', contactEmail: '' }).success).toBe(true);
    expect(brandSchema.safeParse({ name: 'Club', locale: 'es', timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(brandSchema.safeParse({ name: 'Club', locale: 'es', timezone: 'America/Santiago', colorPrimary: 'red' }).success).toBe(false);
    expect(brandSchema.safeParse({ name: 'Club', locale: 'xx', timezone: 'America/Santiago' }).success).toBe(false);
  });
  it('empleado y club nuevo: contraseña de 10+, slug válido', () => {
    expect(newStaffSchema.safeParse({ name: 'Ana', email: 'ANA@x.com', password: 'corta' }).success).toBe(false);
    expect(newStaffSchema.parse({ name: 'Ana', email: 'ANA@x.com', password: 'una-clave-larga' }).email).toBe('ana@x.com');
    expect(newClubSchema.safeParse({ slug: 'Mal Slug', name: 'X', country: 'AR', locale: 'es', timezone: 'America/Santiago', ownerName: 'Ow', ownerEmail: 'o@x.com', ownerPassword: 'una-clave-larga' }).success).toBe(false);
  });
  it('contraste: el naranja de la marca de ejemplo pide texto oscuro', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(lowContrastWithWhite('#d7f23a')).toBe(true);
    expect(lowContrastWithWhite('#0b6b4f')).toBe(false);
    expect(textOn('#d7f23a')).toBe('#10201b');
    expect(textOn('#0b6b4f')).toBe('#ffffff');
  });
});

describe('marca', () => {
  it('actualiza la marca solo del club y deja auditoría', async () => {
    await inA((tx) => updateBrand(tx, ctxA(), brandSchema.parse({ name: 'Nuevo nombre', locale: 'pt', timezone: 'America/Sao_Paulo', colorPrimary: '#E4572E', contactEmail: 'hola@a.test' })));
    const [a] = await inA((tx) => getBrand(tx));
    expect(a).toMatchObject({ name: 'Nuevo nombre', locale: 'pt', colorPrimary: '#e4572e', contactEmail: 'hola@a.test' });
    const [b] = await t.withTenant(s.b.id, (tx) => getBrand(tx));
    expect(b.name).toBe('Club club-b');
    expect((await t.withPlatform((tx) => tx.select().from(auditLog).where(eq(auditLog.action, 'club.update')))).length).toBe(1);
  });

  it('el club no puede cambiar su slug ni su estado (grants de columnas)', async () => {
    await expect(inA((tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, s.a.id)))).rejects.toThrow();
  });
});

describe('links de alta', () => {
  it('apagar cierra el link y rotar invalida el token anterior', async () => {
    // createClub ya dejó un link de cada tipo.
    const t1 = (await inA((tx) => listLinks(tx))).find((l) => l.kind === 'link')!.token;
    const resolve = (tok: string) => t.withPlatform((tx) => resolveSignupTarget(tx, 'club-a', tok));
    expect(await resolve(t1)).not.toBeNull();

    await inA((tx) => setLinkActive(tx, ctxA(), 'link', false));
    expect(await resolve(t1)).toBeNull();
    await inA((tx) => setLinkActive(tx, ctxA(), 'link', true));

    const fresh = await inA((tx) => rotateLink(tx, ctxA(), 'link'));
    expect(fresh).not.toBe(t1);
    expect(await resolve(t1)).toBeNull();
    expect(await resolve(fresh)).not.toBeNull();
  });

  it('rotar crea el link de tablet si no existía y no toca el de otro club', async () => {
    await t.withPlatform((tx) => tx.delete(signupLinks).where(and(eq(signupLinks.kind, 'tablet'), eq(signupLinks.clubId, s.a.id))));
    await inA((tx) => rotateLink(tx, ctxA(), 'tablet'));
    expect((await inA((tx) => listLinks(tx))).map((l) => l.kind).sort()).toEqual(['link', 'tablet']);
    expect(await t.withTenant(s.b.id, (tx) => listLinks(tx))).toHaveLength(2); // los suyos, intactos
  });
});

describe('usuarios del club', () => {
  let staffId: string;
  it('agrega un empleado con contraseña inicial y lo lista', async () => {
    staffId = await t.withPlatform((tx) => addStaff(tx, ctxA(), { name: 'Emi Empleado', email: 'emi@a.test', password: 'una-clave-larga' }, 'hash-1'));
    const members = await inA((tx) => listMembers(tx));
    expect(members.map((m) => [m.email, m.role]).sort()).toEqual([['emi@a.test', 'staff'], ['owner@club-a.test', 'owner']]);
    expect((await t.withTenant(s.b.id, (tx) => listMembers(tx))).map((m) => m.email)).toEqual(['owner@club-b.test']);
  });

  it('un email que ya tiene cuenta no se adjunta al club', async () => {
    expect(await code(t.withPlatform((tx) => addStaff(tx, ctxA(), { name: 'X', email: 'owner@club-b.test', password: 'una-clave-larga' }, 'h')))).toBe('email_taken');
  });

  it('cambiar la contraseña cierra sesiones y destraba la cuenta; el dueño no se puede tocar', async () => {
    await t.withPlatform(async (tx) => {
      await tx.update(users).set({ failedLogins: 4, lockedUntil: new Date(Date.now() + 60_000) }).where(eq(users.id, staffId));
      await tx.insert(refreshTokens).values({ userId: staffId, familyId: crypto.randomUUID(), tokenHash: 'th-1', clubId: s.a.id, expiresAt: new Date(Date.now() + 1e6) });
    });
    await t.withPlatform((tx) => resetPassword(tx, ctxA(), staffId, 'hash-2'));
    const [u] = await t.withPlatform((tx) => tx.select().from(users).where(eq(users.id, staffId)));
    expect(u).toMatchObject({ passwordHash: 'hash-2', failedLogins: 0, lockedUntil: null });
    const [rt] = await t.withPlatform((tx) => tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, 'th-1')));
    expect(rt.revokedAt).not.toBeNull();
    expect(await code(t.withPlatform((tx) => resetPassword(tx, ctxA(), s.ownerA, 'x')))).toBe('not_staff');
    // Otro club: el usuario no es miembro, así que no existe para este dueño.
    expect(await code(t.withPlatform((tx) => resetPassword(tx, ctxA(), s.ownerB, 'x')))).toBe('not_found');
  });

  it('quitar a un empleado no borra su cuenta; al dueño y a ajenos no se los puede quitar', async () => {
    expect(await code(inA((tx) => removeStaff(tx, ctxA(), s.ownerA)))).toBe('not_staff');
    expect(await code(inA((tx) => removeStaff(tx, ctxA(), s.ownerB)))).toBe('not_found');
    await inA((tx) => removeStaff(tx, ctxA(), staffId));
    expect((await inA((tx) => listMembers(tx))).map((m) => m.email)).toEqual(['owner@club-a.test']);
    expect(await t.withPlatform((tx) => tx.select().from(users).where(eq(users.id, staffId)))).toHaveLength(1);
    expect(await t.withPlatform((tx) => tx.select().from(clubMembers).where(eq(clubMembers.userId, staffId)))).toHaveLength(0);
  });
});

describe('panel del superadmin', () => {
  it('lista clubes con conteos, busca y filtra por estado', async () => {
    const all = await t.withPlatform((tx) => listClubs(tx, {}));
    expect(all).toHaveLength(2);
    expect(all.find((c) => c.slug === 'club-a')).toMatchObject({ users: 1, players: 0 });
    expect((await t.withPlatform((tx) => listClubs(tx, { q: 'club-b' }))).map((c) => c.slug)).toEqual(['club-b']);
    expect(await t.withPlatform((tx) => listClubs(tx, { status: 'suspended' }))).toHaveLength(0);
    expect(await t.withPlatform((tx) => listClubs(tx, { q: '%' }))).toHaveLength(0); // el comodín se escapa
  });

  it('crea un club con su dueño, links y auditoría; rechaza slug y email repetidos', async () => {
    const input = newClubSchema.parse({ slug: 'club-c', name: 'Club C', country: 'AR', locale: 'es', timezone: 'America/Argentina/Buenos_Aires', ownerName: 'Dueña C', ownerEmail: 'c@c.test', ownerPassword: 'una-clave-larga' });
    const res = await t.withPlatform((tx) => createClubAsAdmin(tx, { userId: s.ownerA }, input, 'hash'));
    expect('id' in res).toBe(true);
    if ('id' in res) {
      const d = await t.withPlatform((tx) => clubDetail(tx, res.id));
      expect(d).toMatchObject({ players: 0, members: 1 });
      expect(d?.owner?.email).toBe('c@c.test');
      expect(d?.audit.map((a) => a.action)).toContain('club.create');
      expect(await t.withTenant(res.id, (tx) => listLinks(tx))).toHaveLength(2);
    }
    expect(await t.withPlatform((tx) => createClubAsAdmin(tx, { userId: s.ownerA }, input, 'h'))).toEqual({ error: 'slug_taken' });
    expect(await t.withPlatform((tx) => createClubAsAdmin(tx, { userId: s.ownerA }, { ...input, slug: 'club-d' }, 'h'))).toEqual({ error: 'email_taken' });
  });

  it('suspender cierra el link de alta y las sesiones, no borra datos y se puede revertir', async () => {
    await t.withPlatform(async (tx) => {
      await tx.insert(signupLinks).values({ clubId: s.b.id, token: 'tok-b-susp', kind: 'link' });
      await tx.insert(refreshTokens).values({ userId: s.ownerB, familyId: crypto.randomUUID(), tokenHash: 'th-b', clubId: s.b.id, expiresAt: new Date(Date.now() + 1e6) });
    });
    const resolve = () => t.withPlatform((tx) => resolveSignupTarget(tx, 'club-b', 'tok-b-susp'));
    expect(await resolve()).not.toBeNull();

    expect(await t.withPlatform((tx) => setClubStatus(tx, { userId: s.ownerA }, s.b.id, 'suspended'))).toBe(true);
    expect(await resolve()).toBeNull();
    const [rt] = await t.withPlatform((tx) => tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, 'th-b')));
    expect(rt.revokedAt).not.toBeNull();
    expect(await t.withPlatform((tx) => listMembers(tx).then((m) => m.length))).toBeGreaterThan(0); // los datos siguen

    await t.withPlatform((tx) => setClubStatus(tx, { userId: s.ownerA }, s.b.id, 'active'));
    expect(await resolve()).not.toBeNull();
    expect(await t.withPlatform((tx) => setClubStatus(tx, { userId: s.ownerA }, crypto.randomUUID(), 'suspended'))).toBe(false);
  });
});
