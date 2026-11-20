// Feature flags por club. Leer: cualquier rol del club (withTenant, RLS de solo lectura). Escribir: solo el superadmin (withPlatform).
import { and, eq } from 'drizzle-orm';
import type { Feature } from '../../lib/features';
import { auditLog, clubFeatures, clubs } from '../db/schema';
import type { Tx } from '../db/tenant';

/** Lo lanzan los servicios cuando la función está apagada para el club (defensa en profundidad). */
export class FeatureDisabledError extends Error {
  constructor(public readonly feature: Feature) {
    super(`feature_disabled:${feature}`);
    this.name = 'FeatureDisabledError';
  }
}

/** Sin fila = apagado. */
export async function isFeatureEnabled(tx: Tx, clubId: string, feature: Feature): Promise<boolean> {
  const [row] = await tx.select({ enabled: clubFeatures.enabled }).from(clubFeatures)
    .where(and(eq(clubFeatures.clubId, clubId), eq(clubFeatures.feature, feature)));
  return row?.enabled ?? false;
}

export async function assertFeature(tx: Tx, clubId: string, feature: Feature): Promise<void> {
  if (!(await isFeatureEnabled(tx, clubId, feature))) throw new FeatureDisabledError(feature);
}

/** Funciones activas del club. */
export async function listEnabledFeatures(tx: Tx, clubId: string): Promise<Feature[]> {
  const rows = await tx.select({ feature: clubFeatures.feature }).from(clubFeatures)
    .where(and(eq(clubFeatures.clubId, clubId), eq(clubFeatures.enabled, true)));
  return rows.map((r) => r.feature as Feature);
}

/** Estado completo (para la tarjeta del superadmin): fecha de activación incluida. */
export async function listFeatureStates(tx: Tx, clubId: string) {
  return tx.select({ feature: clubFeatures.feature, enabled: clubFeatures.enabled, enabledAt: clubFeatures.enabledAt })
    .from(clubFeatures).where(eq(clubFeatures.clubId, clubId));
}

/** Solo desde withPlatform() tras requireSuperadmin(). Devuelve false si el club no existe. */
export async function setClubFeature(tx: Tx, ctx: { userId: string | null }, clubId: string, feature: Feature, enabled: boolean): Promise<boolean> {
  const [club] = await tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId));
  if (!club) return false;
  const at = enabled ? new Date() : null;
  await tx.insert(clubFeatures).values({ clubId, feature, enabled, enabledAt: at, enabledBy: enabled ? ctx.userId : null })
    .onConflictDoUpdate({
      target: [clubFeatures.clubId, clubFeatures.feature],
      // Al apagar se conservan enabled_at/enabled_by del último encendido; la auditoría guarda quién lo apagó.
      set: enabled ? { enabled, enabledAt: at, enabledBy: ctx.userId } : { enabled },
    });
  await tx.insert(auditLog).values({
    clubId, userId: ctx.userId, action: enabled ? 'club.feature.enabled' : 'club.feature.disabled', detail: { feature },
  });
  return true;
}
