// Usuarios del club. Listar y quitar va con withTenant() (club_members y users son legibles con RLS);
// crear y cambiar contraseñas toca `users`/`refresh_tokens`, que app_user no puede escribir: va con withPlatform(),
// siempre con el clubId de la sesión del dueño.
import { and, eq, isNull } from 'drizzle-orm';
import type { NewStaffInput } from '../../lib/club-schema';
import { auditLog, clubMembers, refreshTokens, users } from '../db/schema';
import type { Tx } from '../db/tenant';

export type UserErrorCode = 'email_taken' | 'not_found' | 'not_staff';
export class UserError extends Error {
  constructor(readonly code: UserErrorCode) { super(code); }
}

export function listMembers(tx: Tx) {
  return tx.select({ userId: users.id, name: users.name, email: users.email, role: clubMembers.role, disabledAt: users.disabledAt, activatedAt: users.activatedAt, since: clubMembers.createdAt })
    .from(clubMembers).innerJoin(users, eq(users.id, clubMembers.userId))
    .orderBy(clubMembers.role, users.name);
}

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};

/** Alta de un empleado con contraseña inicial (no hay envío de email en el MVP). Va dentro de withPlatform(). */
export async function addStaff(tx: Tx, ctx: { clubId: string; userId: string }, input: NewStaffInput, passwordHash: string) {
  // Un email que ya tiene cuenta no se adjunta al club: no se revela de quién es ni se le da acceso sin que lo sepa.
  const [dup] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (dup) throw new UserError('email_taken');
  try {
    const [u] = await tx.insert(users).values({ email: input.email, name: input.name, passwordHash }).returning({ id: users.id });
    await tx.insert(clubMembers).values({ clubId: ctx.clubId, userId: u.id, role: 'staff' });
    await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'users.invite', detail: { target: u.id } });
    return u.id;
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError('email_taken');
    throw e;
  }
}

/** Solo se quita a empleados (el dueño no se puede quitar) y solo del club de la sesión. Va dentro de withTenant(). */
export async function removeStaff(tx: Tx, ctx: { clubId: string; userId: string }, targetId: string) {
  const [m] = await tx.select({ role: clubMembers.role }).from(clubMembers).where(and(eq(clubMembers.clubId, ctx.clubId), eq(clubMembers.userId, targetId)));
  if (!m) throw new UserError('not_found');
  if (m.role !== 'staff') throw new UserError('not_staff');
  await tx.delete(clubMembers).where(and(eq(clubMembers.clubId, ctx.clubId), eq(clubMembers.userId, targetId)));
  await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'users.remove', detail: { target: targetId } });
}

/**
 * Nueva contraseña para un usuario del club. Cierra todas sus sesiones y le saca el bloqueo por intentos.
 * El dueño solo puede hacerlo con empleados; el superadmin (`allowOwner`) también con el dueño. Va dentro de withPlatform().
 */
export async function resetPassword(tx: Tx, ctx: { clubId: string; userId: string; allowOwner?: boolean }, targetId: string, passwordHash: string) {
  const [m] = await tx.select({ role: clubMembers.role }).from(clubMembers).where(and(eq(clubMembers.clubId, ctx.clubId), eq(clubMembers.userId, targetId)));
  if (!m) throw new UserError('not_found');
  if (m.role !== 'staff' && !ctx.allowOwner) throw new UserError('not_staff');
  await tx.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null }).where(eq(users.id, targetId));
  await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, targetId), isNull(refreshTokens.revokedAt)));
  await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'users.password_reset', detail: { target: targetId } });
}
