// Cuentas por correo: restablecer contraseña, invitar usuarios, activar la cuenta y bienvenida del club.
//
// Cada operación hace su trabajo en la base y devuelve, aparte, el envío del correo como una función diferida (`deferred`):
// quien la llama decide cuándo mandarlo (la acción lo corre con `after()` para que la respuesta no tarde distinto según
// exista o no la cuenta). El servicio recibe sus dependencias para poder probarlo con un transporte en memoria.
import { and, asc, eq, isNull } from 'drizzle-orm';
import { randomBytes, createHmac } from 'node:crypto';
import { auditLog, clubMembers, clubs, refreshTokens, signupLinks, users } from '../db/schema';
import type { Runners, Tx } from '../db/tenant';
import type { EmailLocale } from '../email/render';
import type { SendResult, sendEmail } from '../email/send';
import { consumeToken, inspectToken, issueToken, type TokenKind } from './account-tokens';
import { hitRateLimit } from './rate-limit';

export type Deferred = () => Promise<SendResult>;

export interface AccountDeps {
  runners: Pick<Runners, 'withPlatform'>;
  secret: string;
  hashPassword: (password: string) => Promise<string>;
  passwordProblem: (password: string) => string | null;
  send: typeof sendEmail;
  /** Link absoluto a una ruta de la app; null si esta instancia no tiene APP_URL. */
  link: (path: string) => string | null;
  now?: () => Date;
}

export type AccountErrorCode = 'email_taken' | 'not_found' | 'not_pending' | 'not_staff' | 'rate_limited' | 'email_disabled';
export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) { super(code); }
}

const RESET_LIMIT_PER_EMAIL = { max: 3, windowSec: 3600 };
const RESET_LIMIT_PER_IP = { max: 10, windowSec: 3600 };
const RESEND_LIMIT = { max: 3, windowSec: 3600 };
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

const asLocale = (l: string | null | undefined): EmailLocale => (l === 'en' || l === 'pt' ? l : 'es');

export function createAccountService(deps: AccountDeps) {
  const now = () => (deps.now ?? (() => new Date()))();
  const hmac = (v: string) => createHmac('sha256', deps.secret).update(v).digest('hex');
  /** Hash de un secreto aleatorio que nadie conoce: la cuenta invitada no puede iniciar sesión hasta elegir su clave. */
  const unusablePassword = () => deps.hashPassword(randomBytes(32).toString('base64url'));
  const path = (locale: string, rest: string) => `/${locale}${rest}`;

  /** Datos para escribirle a alguien: idioma (el suyo, si no el del primer club activo) y zona horaria. */
  async function recipient(tx: Tx, userId: string) {
    const [u] = await tx.select({ id: users.id, name: users.name, email: users.email, locale: users.locale, isSuperadmin: users.isSuperadmin, disabledAt: users.disabledAt, activatedAt: users.activatedAt })
      .from(users).where(eq(users.id, userId));
    if (!u) return null;
    const [club] = await tx.select({ name: clubs.name, locale: clubs.locale, timezone: clubs.timezone, id: clubs.id })
      .from(clubMembers).innerJoin(clubs, eq(clubs.id, clubMembers.clubId))
      .where(and(eq(clubMembers.userId, userId), eq(clubs.status, 'active'))).orderBy(asc(clubMembers.createdAt)).limit(1);
    return { ...u, locale: asLocale(u.locale ?? club?.locale), timezone: club?.timezone ?? DEFAULT_TZ, hasAccess: u.isSuperadmin || Boolean(club) };
  }

  const mail = (kind: Parameters<typeof sendEmail>[0], to: { email: string; name: string }, locale: EmailLocale, vars: Parameters<typeof sendEmail>[3]): Deferred =>
    () => deps.send(kind, to, locale, vars);

  return {
    /**
     * "Olvidé mi contraseña". La respuesta es la misma exista o no la cuenta (no se revela quién tiene cuenta);
     * solo cambia si se mandó un correo, y eso va diferido. Cuentas deshabilitadas, sin activar o sin club activo no reciben nada.
     */
    async requestReset(input: { email: string; ip?: string }): Promise<{ status: 'ok' | 'rate_limited' | 'disabled'; deferred?: Deferred }> {
      if (!deps.link('/')) return { status: 'disabled' };
      const email = input.email.trim().toLowerCase().slice(0, 254);
      return deps.runners.withPlatform(async (tx) => {
        const t = now();
        const okEmail = await hitRateLimit(tx, `reset:email:${hmac(email)}`, RESET_LIMIT_PER_EMAIL, t);
        const okIp = input.ip ? await hitRateLimit(tx, `reset:ip:${hmac(input.ip)}`, RESET_LIMIT_PER_IP, t) : true;
        if (!okEmail || !okIp) return { status: 'rate_limited' as const };

        const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        const r = row ? await recipient(tx, row.id) : null;
        if (!r || r.disabledAt || r.activatedAt === null || !r.hasAccess) return { status: 'ok' as const };

        const token = await issueToken(tx, r.id, 'reset', t);
        const url = deps.link(path(r.locale, `/restablecer/${token}`))!;
        return { status: 'ok' as const, deferred: mail('reset', { email: r.email, name: r.name }, r.locale, { actionUrl: url }) };
      });
    },

    /** ¿El link sigue sirviendo? Solo decide qué pantalla mostrar; no lo gasta. */
    async isTokenValid(raw: string, kind: TokenKind): Promise<boolean> {
      return deps.runners.withPlatform(async (tx) => (await inspectToken(tx, raw, kind, now())) !== null);
    },

    /** Elige la contraseña nueva con el link del correo. Cierra todas las sesiones y avisa por correo del cambio. */
    async completeReset(input: { token: string; password: string }): Promise<{ status: 'ok' | 'invalid' | 'weak'; deferred?: Deferred }> {
      if (deps.passwordProblem(input.password)) return { status: 'weak' };
      const hash = await deps.hashPassword(input.password);
      return deps.runners.withPlatform(async (tx) => {
        const t = now();
        const userId = await consumeToken(tx, input.token, 'reset', t);
        if (!userId) return { status: 'invalid' as const };
        await tx.update(users).set({ passwordHash: hash, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
        await tx.update(refreshTokens).set({ revokedAt: t }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
        await tx.insert(auditLog).values({ userId, action: 'auth.password_reset' });

        const r = await recipient(tx, userId);
        if (!r) return { status: 'ok' as const };
        const when = new Intl.DateTimeFormat(r.locale, { dateStyle: 'long', timeStyle: 'short', timeZone: r.timezone }).format(t);
        const actionUrl = deps.link(path(r.locale, '/restablecer'));
        return {
          status: 'ok' as const,
          deferred: actionUrl ? mail('passwordChanged', { email: r.email, name: r.name }, r.locale, { actionUrl, changedAt: when }) : undefined,
        };
      });
    },

    /** Activa una cuenta invitada: elige su contraseña con el link del correo. */
    async activate(input: { token: string; password: string; name?: string }): Promise<{ status: 'ok' | 'invalid' | 'weak'; locale?: EmailLocale }> {
      if (deps.passwordProblem(input.password)) return { status: 'weak' };
      const hash = await deps.hashPassword(input.password);
      return deps.runners.withPlatform(async (tx) => {
        const t = now();
        const userId = await consumeToken(tx, input.token, 'invite', t);
        if (!userId) return { status: 'invalid' as const };
        const name = input.name?.trim().slice(0, 80);
        await tx.update(users).set({ passwordHash: hash, activatedAt: t, failedLogins: 0, lockedUntil: null, ...(name ? { name } : {}) }).where(eq(users.id, userId));
        await tx.insert(auditLog).values({ userId, action: 'users.activate' });
        const r = await recipient(tx, userId);
        return { status: 'ok' as const, locale: r?.locale };
      });
    },

    /** Para la pantalla de activación: a qué club y con qué rol lo invitaron. Null si el link no sirve. No gasta el link. */
    async invitationInfo(raw: string): Promise<{ name: string; role: 'owner' | 'staff'; clubName: string; locale: EmailLocale } | null> {
      return deps.runners.withPlatform(async (tx) => {
        const tk = await inspectToken(tx, raw, 'invite', now());
        if (!tk) return null;
        const [row] = await tx.select({ name: users.name, role: clubMembers.role, clubName: clubs.name, clubLocale: clubs.locale, userLocale: users.locale })
          .from(users).innerJoin(clubMembers, eq(clubMembers.userId, users.id)).innerJoin(clubs, eq(clubs.id, clubMembers.clubId))
          .where(and(eq(users.id, tk.userId), eq(clubs.status, 'active'))).orderBy(asc(clubMembers.createdAt)).limit(1);
        return row ? { name: row.name, role: row.role, clubName: row.clubName, locale: asLocale(row.userLocale ?? row.clubLocale) } : null;
      });
    },

    /**
     * Invita a un empleado al club: crea la cuenta sin contraseña utilizable y le manda el link para activarla (vence en 7 días).
     * Un email que ya tiene cuenta no se adjunta al club (igual que con contraseña inicial). Va con la sesión del dueño.
     */
    async inviteStaff(ctx: { clubId: string; userId: string }, input: { name: string; email: string }): Promise<{ userId: string; deferred: Deferred }> {
      if (!deps.link('/')) throw new AccountError('email_disabled');
      const password = await unusablePassword();
      return deps.runners.withPlatform(async (tx) => {
        const t = now();
        const email = input.email.trim().toLowerCase();
        const [dup] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (dup) throw new AccountError('email_taken');
        const [u] = await tx.insert(users).values({ email, name: input.name, passwordHash: password, activatedAt: null }).returning({ id: users.id });
        await tx.insert(clubMembers).values({ clubId: ctx.clubId, userId: u.id, role: 'staff' });
        await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'users.invite', detail: { target: u.id, by: 'email' } });
        const deferred = await invitation(tx, ctx.userId, ctx.clubId, u.id, 'staff', t);
        return { userId: u.id, deferred };
      });
    },

    /**
     * Reenvía la invitación a quien todavía no activó su cuenta: el link anterior deja de servir. Con tope por persona.
     * El dueño solo reenvía a empleados; el superadmin (`allowOwner`) también al dueño.
     */
    async resendInvite(ctx: { clubId: string; userId: string; allowOwner?: boolean }, targetId: string): Promise<{ deferred: Deferred }> {
      if (!deps.link('/')) throw new AccountError('email_disabled');
      return deps.runners.withPlatform(async (tx) => {
        const t = now();
        const [m] = await tx.select({ role: clubMembers.role, activatedAt: users.activatedAt }).from(clubMembers)
          .innerJoin(users, eq(users.id, clubMembers.userId)).where(and(eq(clubMembers.clubId, ctx.clubId), eq(clubMembers.userId, targetId)));
        if (!m) throw new AccountError('not_found');
        if (m.role !== 'staff' && !ctx.allowOwner) throw new AccountError('not_staff');
        if (m.activatedAt !== null) throw new AccountError('not_pending');
        if (!(await hitRateLimit(tx, `invite:resend:${targetId}`, RESEND_LIMIT, t))) throw new AccountError('rate_limited');
        await tx.insert(auditLog).values({ clubId: ctx.clubId, userId: ctx.userId, action: 'users.invite_resend', detail: { target: targetId } });
        return { deferred: await invitation(tx, ctx.userId, ctx.clubId, targetId, m.role, t) };
      });
    },

    /**
     * Bienvenida al dueño de un club recién creado, con el link de alta de jugadores. Si la cuenta quedó pendiente
     * (`pending`) el botón lleva a activarla; si se creó con contraseña inicial, al login. Va con withPlatform() del superadmin.
     */
    async welcomeOwner(clubId: string, ownerId: string, opts: { pending: boolean }): Promise<Deferred | null> {
      if (!deps.link('/')) return null;
      return deps.runners.withPlatform(async (tx) => {
        const r = await recipient(tx, ownerId);
        const [club] = await tx.select({ name: clubs.name, slug: clubs.slug, locale: clubs.locale }).from(clubs).where(eq(clubs.id, clubId));
        if (!r || !club) return null;
        const locale = asLocale(club.locale);
        const [join] = await tx.select({ token: signupLinks.token }).from(signupLinks).where(and(eq(signupLinks.clubId, clubId), eq(signupLinks.kind, 'link'), eq(signupLinks.active, true)));
        const token = opts.pending ? await issueToken(tx, ownerId, 'invite', now()) : null;
        const actionUrl = deps.link(token ? path(locale, `/activar/${token}`) : path(locale, '/login'))!;
        return mail('welcome', { email: r.email, name: r.name }, locale, {
          actionUrl, clubName: club.name, activation: opts.pending,
          joinUrl: join ? deps.link(path(locale, `/c/${club.slug}/${join.token}`)) ?? undefined : undefined,
        });
      });
    },

    unusablePassword,
  };

  /** Arma la invitación (token + correo diferido) para `targetId`, en nombre de `actorId`. */
  async function invitation(tx: Tx, actorId: string, clubId: string, targetId: string, role: 'owner' | 'staff', t: Date): Promise<Deferred> {
    const [actor] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actorId));
    const [club] = await tx.select({ name: clubs.name, locale: clubs.locale }).from(clubs).where(eq(clubs.id, clubId));
    const [target] = await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, targetId));
    const locale = asLocale(club?.locale);
    const token = await issueToken(tx, targetId, 'invite', t);
    const actionUrl = deps.link(path(locale, `/activar/${token}`))!;
    return mail('invite', target, locale, { actionUrl, clubName: club?.name ?? '', inviterName: actor?.name ?? '', role });
  }
}

export type AccountService = ReturnType<typeof createAccountService>;
