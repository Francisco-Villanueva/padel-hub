import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clubMembers, clubs, players, users } from '../src/server/db/schema';
import { seedTwoClubs, setupDb } from './helpers';

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;
let playerA: string;
let playerB: string;

const newPlayer = (clubId: string, phone: string, extra: Partial<typeof players.$inferInsert> = {}) => ({
  clubId, firstName: 'Juan', lastName: 'Pérez', gender: 'male' as const, phoneE164: phone, source: 'manual' as const, ...extra,
});

beforeAll(async () => {
  t = await setupDb();
  s = await seedTwoClubs(t);
  playerA = (await t.withTenant(s.a.id, (tx) => tx.insert(players).values(newPlayer(s.a.id, '+5492911111111')).returning({ id: players.id })))[0].id;
  playerB = (await t.withTenant(s.b.id, (tx) => tx.insert(players).values(newPlayer(s.b.id, '+5492922222222')).returning({ id: players.id })))[0].id;
});
afterAll(async () => { await t.client.close(); });

describe('aislamiento entre clubes (RLS)', () => {
  it('cada club solo ve sus jugadores', async () => {
    const a = await t.withTenant(s.a.id, (tx) => tx.select().from(players));
    const b = await t.withTenant(s.b.id, (tx) => tx.select().from(players));
    expect(a.map((p) => p.id)).toEqual([playerA]);
    expect(b.map((p) => p.id)).toEqual([playerB]);
  });

  it('pedir un jugador de otro club por id no devuelve nada', async () => {
    const rows = await t.withTenant(s.a.id, (tx) => tx.select().from(players).where(eq(players.id, playerB)));
    expect(rows).toEqual([]);
  });

  it('no se puede insertar un jugador con club_id de otro club', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(players).values(newPlayer(s.b.id, '+5492933333333')))).rejects.toThrow();
  });

  it('update y delete sobre jugadores de otro club no afectan ninguna fila', async () => {
    await t.withTenant(s.a.id, async (tx) => {
      await tx.update(players).set({ firstName: 'Hackeado' }).where(eq(players.id, playerB));
      await tx.delete(players).where(eq(players.id, playerB));
    });
    const [b] = await t.withTenant(s.b.id, (tx) => tx.select().from(players).where(eq(players.id, playerB)));
    expect(b.firstName).toBe('Juan');
  });

  it('no se puede mover un jugador a otro club', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.update(players).set({ clubId: s.b.id }).where(eq(players.id, playerA)))).rejects.toThrow();
  });

  it('sin app.club_id no se ve ninguna fila', async () => {
    const rows = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      return tx.select().from(players);
    });
    expect(rows).toEqual([]);
  });

  it('el club solo ve su propia fila de clubs', async () => {
    const rows = await t.withTenant(s.a.id, (tx) => tx.select({ id: clubs.id }).from(clubs));
    expect(rows).toEqual([{ id: s.a.id }]);
  });

  it('el club solo ve a sus propios usuarios', async () => {
    const rows = await t.withTenant(s.a.id, (tx) => tx.select({ id: users.id }).from(users));
    expect(rows).toEqual([{ id: s.ownerA }]);
    const members = await t.withTenant(s.a.id, (tx) => tx.select().from(clubMembers));
    expect(members.map((m) => m.userId)).toEqual([s.ownerA]);
  });
});

describe('permisos de columnas y tablas de app_user', () => {
  it('no puede leer password_hash', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.select({ h: users.passwordHash }).from(users))).rejects.toThrow();
  });

  it('no puede cambiar slug ni status de su club, pero sí el nombre', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, s.a.id)))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.update(clubs).set({ slug: 'otro-slug' }).where(eq(clubs.id, s.a.id)))).rejects.toThrow();
    await t.withTenant(s.a.id, (tx) => tx.update(clubs).set({ name: 'Club A Renovado' }).where(eq(clubs.id, s.a.id)));
    const [row] = await t.withPlatform((tx) => tx.select().from(clubs).where(eq(clubs.id, s.a.id)));
    expect(row.name).toBe('Club A Renovado');
  });

  it('no puede tocar tablas de sesión', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.execute(sql`select * from refresh_tokens`))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.execute(sql`select * from rate_limits`))).rejects.toThrow();
  });

  it('no puede crear ni borrar clubes', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(clubs).values({ slug: 'nuevo-club', name: 'x' }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.delete(clubs))).rejects.toThrow();
  });
});

describe('plataforma', () => {
  it('platform_user ve todos los clubes y jugadores', async () => {
    const rows = await t.withPlatform((tx) => tx.select({ id: players.id }).from(players));
    expect(rows.map((r) => r.id).sort()).toEqual([playerA, playerB].sort());
  });
});

describe('integridad de datos', () => {
  it('la categoría es un nivel de 1 a 8 y la base rechaza otros valores', async () => {
    const [p] = await t.withTenant(s.a.id, (tx) => tx.insert(players).values(newPlayer(s.a.id, '+5492955555555', { category: 7, slots: ['noche', 'tarde'] })).returning());
    expect(p.category).toBe(7);
    expect(p.slots).toEqual(['noche', 'tarde']);
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(players).values(newPlayer(s.a.id, '+5492966666601', { category: 9 })))).rejects.toThrow();
  });

  it('el teléfono es único dentro del club pero se puede repetir entre clubes', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(players).values(newPlayer(s.a.id, '+5492911111111')))).rejects.toThrow();
    await t.withTenant(s.b.id, (tx) => tx.insert(players).values(newPlayer(s.b.id, '+5492911111111')));
  });

  it('valida formato de teléfono e Instagram', async () => {
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(players).values(newPlayer(s.a.id, '2911111111')))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.insert(players).values(newPlayer(s.a.id, '+5492966666666', { instagram: '@con arroba' })))).rejects.toThrow();
  });

  it('withTenant rechaza un clubId que no es UUID', async () => {
    await expect(t.withTenant("x'; drop table players; --", async () => 1)).rejects.toThrow('clubId inválido');
  });
});

describe('consultas públicas pre-tenant', () => {
  it('public_club_by_slug y resolve_signup_link funcionan como app_user sin tenant', async () => {
    await t.withPlatform((tx) => tx.execute(sql`insert into signup_links (club_id, token, kind) values (${s.a.id}, 'tok-a', 'link')`));
    const club = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      return (await tx.execute(sql`select * from public_club_by_slug('club-a')`)).rows[0] as { id: string };
    });
    expect(club.id).toBe(s.a.id);

    const ok = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      return (await tx.execute(sql`select * from resolve_signup_link('club-a', 'tok-a')`)).rows;
    });
    expect(ok).toHaveLength(1);

    // token de otro club, o slug que no corresponde: nada
    const bad = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      return (await tx.execute(sql`select * from resolve_signup_link('club-b', 'tok-a')`)).rows;
    });
    expect(bad).toHaveLength(0);
  });

  it('un club suspendido no resuelve el link de alta', async () => {
    await t.withPlatform((tx) => tx.update(clubs).set({ status: 'suspended' }).where(eq(clubs.id, s.a.id)));
    const rows = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      return (await tx.execute(sql`select * from resolve_signup_link('club-a', 'tok-a')`)).rows;
    });
    expect(rows).toHaveLength(0);
  });
});
