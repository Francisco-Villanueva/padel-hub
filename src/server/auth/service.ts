// Servicio de autenticación (docs/system-design.md 3.1).
// Access token JWT corto + refresh token opaco y rotativo (solo se guarda su hash).
// Todo corre con withPlatform(): el login ocurre antes de saber a qué club pertenece el usuario.
import { and, eq, isNull } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { clubMembers, clubs, refreshTokens, users } from '../db/schema';
import type { Runners, Tx } from '../db/tenant';
import { hitRateLimit } from '../services/rate-limit';
import {
  LOCKOUT_MS, LOGIN_LIMIT_PER_EMAIL, LOGIN_LIMIT_PER_IP, MAX_FAILED_LOGINS, REFRESH_CONCURRENCY_GRACE_MS, REFRESH_TTL_SEC,
} from './config';
import { jwtKey, newOpaqueToken, sha256, signAccessToken, type Role, type Session } from './jwt';

export interface AuthDeps {
  runners: Pick<Runners, 'withPlatform'>;
  secret: string;
  verifyPassword: (stored: string, password: string) => Promise<boolean>;
  /** Hash que se verifica cuando el email no existe, para que el tiempo de respuesta no delate cuentas. */
  dummyHash: string;
  now?: () => Date;
}

export interface RequestMeta { ip?: string; userAgent?: string }

export interface Tokens {
  accessToken: string; accessExp: number; // epoch segundos
  refreshToken: string; refreshExp: number;
  session: Session;
}

export interface ClubChoice { clubId: string; name: string; slug: string; role: Role }

export type LoginResult =
  | { status: 'ok'; tokens: Tokens }
  | { status: 'choose_club'; clubs: ClubChoice[] }
  | { status: 'invalid_credentials' | 'locked' | 'rate_limited' | 'no_access' };

export type RefreshResult =
  | { status: 'ok'; tokens: Tokens }
  // 'concurrent': otro request acaba de rotar este mismo token; el cliente debe releer sus cookies y reintentar.
  | { status: 'invalid' | 'concurrent' | 'replay' | 'no_access' };

export function createAuthService(deps: AuthDeps) {
  const key = jwtKey(deps.secret);
  const now = () => (deps.now ?? (() => new Date()))();
  const hmac = (v: string) => createHmac('sha256', deps.secret).update(v).digest('hex');

  const hit = (tx: Tx, k: string, limit: { max: number; windowSec: number }) => hitRateLimit(tx, k, limit, now());

  async function memberships(tx: Tx, userId: string): Promise<ClubChoice[]> {
    const rows = await tx
      .select({ clubId: clubMembers.clubId, role: clubMembers.role, name: clubs.name, slug: clubs.slug })
      .from(clubMembers).innerJoin(clubs, eq(clubs.id, clubMembers.clubId))
      .where(and(eq(clubMembers.userId, userId), eq(clubs.status, 'active')));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function issue(tx: Tx, session: Session, meta: RequestMeta): Promise<Tokens> {
    const t = now();
    const refreshToken = newOpaqueToken();
    const refreshExp = Math.floor(t.getTime() / 1000) + REFRESH_TTL_SEC;
    await tx.insert(refreshTokens).values({
      userId: session.userId, familyId: session.familyId, tokenHash: sha256(refreshToken), clubId: session.clubId,
      expiresAt: new Date(refreshExp * 1000), userAgent: meta.userAgent?.slice(0, 300), ipHash: meta.ip ? hmac(meta.ip) : null,
      createdAt: t,
    });
    const access = await signAccessToken(session, key, t);
    return { accessToken: access.token, accessExp: access.exp, refreshToken, refreshExp, session };
  }

  // Decide el contexto (club y rol) de una sesión nueva. Devuelve null si el usuario no puede entrar a nada.
  async function resolveContext(tx: Tx, user: { id: string; isSuperadmin: boolean }, wantedClubId?: string) {
    const list = await memberships(tx, user.id);
    if (wantedClubId) {
      const m = list.find((c) => c.clubId === wantedClubId);
      if (m) return { kind: 'ok' as const, clubId: m.clubId, role: m.role };
      return { kind: 'none' as const };
    }
    if (user.isSuperadmin) return { kind: 'ok' as const, clubId: null, role: null };
    if (list.length === 0) return { kind: 'none' as const };
    if (list.length === 1) return { kind: 'ok' as const, clubId: list[0].clubId, role: list[0].role };
    return { kind: 'choose' as const, clubs: list };
  }

  return {
    async login(input: { email: string; password: string; clubId?: string }, meta: RequestMeta = {}): Promise<LoginResult> {
      const email = input.email.trim().toLowerCase();
      return deps.runners.withPlatform(async (tx) => {
        const okEmail = await hit(tx, `login:email:${hmac(email)}`, LOGIN_LIMIT_PER_EMAIL);
        const okIp = meta.ip ? await hit(tx, `login:ip:${hmac(meta.ip)}`, LOGIN_LIMIT_PER_IP) : true;
        if (!okEmail || !okIp) return { status: 'rate_limited' };

        const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
        const valid = await deps.verifyPassword(user?.passwordHash ?? deps.dummyHash, input.password);
        if (!user || user.disabledAt) return { status: 'invalid_credentials' };

        const t = now();
        if (user.lockedUntil && user.lockedUntil > t) return { status: 'locked' };

        if (!valid) {
          const failed = user.failedLogins + 1;
          const lock = failed >= MAX_FAILED_LOGINS;
          await tx.update(users).set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(t.getTime() + LOCKOUT_MS) : user.lockedUntil })
            .where(eq(users.id, user.id));
          // El commit de la transacción conserva el contador aunque la respuesta sea un fallo.
          return { status: lock ? 'locked' : 'invalid_credentials' };
        }

        await tx.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
        const ctx = await resolveContext(tx, user, input.clubId);
        if (ctx.kind === 'none') return { status: 'no_access' };
        if (ctx.kind === 'choose') return { status: 'choose_club', clubs: ctx.clubs };

        const session: Session = {
          userId: user.id, clubId: ctx.clubId, role: ctx.role, isSuperadmin: user.isSuperadmin, familyId: crypto.randomUUID(),
        };
        return { status: 'ok', tokens: await issue(tx, session, meta) };
      });
    },

    /** Rota el refresh token. Con `clubId` además cambia el club activo (el usuario debe ser miembro). */
    async refresh(rawToken: string, meta: RequestMeta = {}, opts: { clubId?: string } = {}): Promise<RefreshResult> {
      if (!rawToken || rawToken.length > 200) return { status: 'invalid' };
      return deps.runners.withPlatform(async (tx) => {
        const t = now();
        const [row] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(rawToken))).limit(1);
        if (!row || row.revokedAt || row.expiresAt <= t) return { status: 'invalid' };

        // Rotación atómica: solo un request puede marcar el token como usado.
        const claimed = await tx.update(refreshTokens).set({ usedAt: t })
          .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.usedAt))).returning({ id: refreshTokens.id });
        if (claimed.length === 0) {
          const usedAt = row.usedAt ?? t;
          if (t.getTime() - usedAt.getTime() <= REFRESH_CONCURRENCY_GRACE_MS) return { status: 'concurrent' };
          // Token ya usado y fuera de la ventana: posible robo. Se invalida toda la familia.
          await tx.update(refreshTokens).set({ revokedAt: t }).where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
          return { status: 'replay' };
        }

        // Se re-verifica contra la base: usuario activo, membresía vigente y club activo.
        const [user] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
        const revoke = async () => {
          await tx.update(refreshTokens).set({ revokedAt: t }).where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
          return { status: 'no_access' as const };
        };
        if (!user || user.disabledAt) return revoke();

        let clubId = row.clubId, role: Role | null = null;
        const target = opts.clubId ?? clubId;
        if (target) {
          const m = (await memberships(tx, user.id)).find((c) => c.clubId === target);
          if (!m) return opts.clubId ? { status: 'invalid' as const } : revoke();
          clubId = m.clubId; role = m.role;
        } else if (!user.isSuperadmin) {
          return revoke();
        }

        const session: Session = { userId: user.id, clubId, role, isSuperadmin: user.isSuperadmin, familyId: row.familyId };
        return { status: 'ok', tokens: await issue(tx, session, meta) };
      });
    },

    /** Logout: revoca toda la familia del refresh token. Idempotente. */
    async logout(rawToken: string | undefined): Promise<void> {
      if (!rawToken) return;
      await deps.runners.withPlatform(async (tx) => {
        const [row] = await tx.select({ familyId: refreshTokens.familyId }).from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(rawToken))).limit(1);
        if (row) await tx.update(refreshTokens).set({ revokedAt: now() }).where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
      });
    },

    /** Revoca todas las sesiones de un usuario (baja de empleado, cambio de contraseña). */
    async revokeAllForUser(userId: string): Promise<void> {
      await deps.runners.withPlatform((tx) =>
        tx.update(refreshTokens).set({ revokedAt: now() }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))));
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
