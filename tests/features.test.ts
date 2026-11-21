import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, clubFeatures } from '../src/server/db/schema';
import { assertFeature, FeatureDisabledError, isFeatureEnabled, listEnabledFeatures, setClubFeature } from '../src/server/services/features';
import { seedTwoClubs, setupDb } from './helpers';

type Ctx = Awaited<ReturnType<typeof setupDb>>;
let t: Ctx;
let s: Awaited<ReturnType<typeof seedTwoClubs>>;

beforeAll(async () => { t = await setupDb(); s = await seedTwoClubs(t); });
afterAll(async () => { await t.client.close(); });

const on = (clubId: string, enabled = true) => t.withPlatform((tx) => setClubFeature(tx, { userId: s.ownerA }, clubId, 'tournaments', enabled));
const check = (clubId: string) => t.withTenant(clubId, (tx) => isFeatureEnabled(tx, clubId, 'tournaments'));

describe('feature flags por club', () => {
  it('por defecto está apagado (sin fila)', async () => {
    expect(await check(s.a.id)).toBe(false);
    expect(await t.withTenant(s.a.id, (tx) => listEnabledFeatures(tx, s.a.id))).toEqual([]);
  });

  it('assertFeature rechaza con el flag apagado y acepta con el flag activo', async () => {
    await expect(t.withTenant(s.a.id, (tx) => assertFeature(tx, s.a.id, 'tournaments'))).rejects.toBeInstanceOf(FeatureDisabledError);
    expect(await on(s.a.id)).toBe(true);
    await expect(t.withTenant(s.a.id, (tx) => assertFeature(tx, s.a.id, 'tournaments'))).resolves.toBeUndefined();
  });

  it('activar en el club A no habilita al club B', async () => {
    expect(await check(s.a.id)).toBe(true);
    expect(await check(s.b.id)).toBe(false);
    // Aun pidiendo el id de A desde la sesión de B, RLS no muestra la fila.
    expect(await t.withTenant(s.b.id, (tx) => isFeatureEnabled(tx, s.a.id, 'tournaments'))).toBe(false);
  });

  it('apagar no borra la fila y se puede volver a activar', async () => {
    await on(s.a.id, false);
    expect(await check(s.a.id)).toBe(false);
    expect(await t.withPlatform((tx) => tx.select().from(clubFeatures).where(eq(clubFeatures.clubId, s.a.id)))).toHaveLength(1);
    await on(s.a.id, true);
    expect(await check(s.a.id)).toBe(true);
  });

  it('cada cambio queda en audit_log', async () => {
    const rows = await t.withPlatform((tx) => tx.select({ action: auditLog.action, detail: auditLog.detail }).from(auditLog).where(eq(auditLog.clubId, s.a.id)));
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('club.feature.enabled');
    expect(actions).toContain('club.feature.disabled');
    expect(rows.find((r) => r.action === 'club.feature.enabled')?.detail).toEqual({ feature: 'tournaments' });
  });

  it('un club inexistente devuelve false y no escribe', async () => {
    expect(await on('00000000-0000-4000-8000-000000000000')).toBe(false);
  });
});

describe('club_features: permisos de app_user', () => {
  it('solo puede leer: INSERT, UPDATE y DELETE fallan', async () => {
    await expect(t.withTenant(s.b.id, (tx) => tx.insert(clubFeatures).values({ clubId: s.b.id, feature: 'tournaments', enabled: true }))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.update(clubFeatures).set({ enabled: false }).where(eq(clubFeatures.clubId, s.a.id)))).rejects.toThrow();
    await expect(t.withTenant(s.a.id, (tx) => tx.delete(clubFeatures).where(eq(clubFeatures.clubId, s.a.id)))).rejects.toThrow();
    expect(await check(s.a.id)).toBe(true);
  });

  it('cada club solo ve sus filas', async () => {
    await on(s.b.id);
    const a = await t.withTenant(s.a.id, (tx) => tx.select().from(clubFeatures));
    expect(a.every((r) => r.clubId === s.a.id)).toBe(true);
    expect(await t.withPlatform((tx) => tx.select().from(clubFeatures))).toHaveLength(2);
  });

  it('el CHECK rechaza funciones desconocidas', async () => {
    await expect(t.withPlatform((tx) => tx.insert(clubFeatures).values({ clubId: s.a.id, feature: 'otra' }))).rejects.toThrow();
  });
});
