import { jwtVerify, SignJWT } from 'jose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ACCESS_TTL_SEC } from './config';

export type Role = 'owner' | 'staff';

export interface Session {
  userId: string;
  clubId: string | null; // null para superadmin sin club activo
  role: Role | null;
  isSuperadmin: boolean;
  familyId: string;
}

const ISSUER = 'padelhub';
const AUDIENCE = 'padelhub-app';

export function jwtKey(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(s: Session, key: Uint8Array, now = new Date()): Promise<{ token: string; exp: number }> {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + ACCESS_TTL_SEC;
  const token = await new SignJWT({ cid: s.clubId, role: s.role, sa: s.isSuperadmin, sid: s.familyId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(s.userId).setIssuer(ISSUER).setAudience(AUDIENCE)
    .setJti(randomUUID()).setIssuedAt(iat).setExpirationTime(exp)
    .sign(key);
  return { token, exp };
}

export async function verifyAccessToken(token: string | undefined, key: Uint8Array, now?: Date): Promise<Session | null> {
  // Sin token no se lee el reloj: Next lo marca como valor inestable al prerenderizar el shell.
  if (!token || token.length > 2000) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, currentDate: now ?? new Date(),
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    const role = payload.role === 'owner' || payload.role === 'staff' ? payload.role : null;
    const clubId = typeof payload.cid === 'string' ? payload.cid : null;
    return { userId: payload.sub, clubId, role, isSuperadmin: payload.sa === true, familyId: payload.sid };
  } catch {
    return null;
  }
}

export const newOpaqueToken = () => randomBytes(32).toString('base64url');
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
