// Links de un solo uso del correo: invitación (activar cuenta) y restablecer contraseña. Todo va dentro de withPlatform().
// En la base solo vive el hash SHA-256 del token: quien lea la tabla no puede armar un link. El valor en claro existe solo
// en el correo. Se usa una vez, vence, y un token nuevo invalida los anteriores del mismo tipo.
import { and, eq, gt, isNull } from 'drizzle-orm';
import { newOpaqueToken, sha256 } from '../auth/jwt';
import { authTokens } from '../db/schema';
import type { Tx } from '../db/tenant';

export type TokenKind = 'invite' | 'reset';

/** Vigencia en segundos. Coincide con lo que dicen las plantillas ("vence en 7 días" / "vence en 1 hora"). */
export const TOKEN_TTL_SEC: Record<TokenKind, number> = { invite: 7 * 24 * 3600, reset: 3600 };

export async function issueToken(tx: Tx, userId: string, kind: TokenKind, now: Date = new Date()): Promise<string> {
  // Pedir otro link deja sin efecto el anterior (el correo viejo ya no sirve).
  await tx.update(authTokens).set({ usedAt: now })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)));
  const raw = newOpaqueToken();
  await tx.insert(authTokens).values({ userId, kind, tokenHash: sha256(raw), expiresAt: new Date(now.getTime() + TOKEN_TTL_SEC[kind] * 1000), createdAt: now });
  return raw;
}

const shape = (raw: string) => typeof raw === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(raw);

/** ¿El link sirve todavía? No lo gasta: es para decidir qué pantalla mostrar. Devuelve el usuario o null. */
export async function inspectToken(tx: Tx, raw: string, kind: TokenKind, now: Date = new Date()): Promise<{ userId: string } | null> {
  if (!shape(raw)) return null;
  const [t] = await tx.select({ userId: authTokens.userId }).from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.kind, kind), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now)));
  return t ?? null;
}

/** Gasta el link de forma atómica: de dos pedidos simultáneos con el mismo token, solo uno recibe el usuario. */
export async function consumeToken(tx: Tx, raw: string, kind: TokenKind, now: Date = new Date()): Promise<string | null> {
  if (!shape(raw)) return null;
  const [t] = await tx.update(authTokens).set({ usedAt: now })
    .where(and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.kind, kind), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now)))
    .returning({ userId: authTokens.userId });
  return t?.userId ?? null;
}
