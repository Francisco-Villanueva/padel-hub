// Alta pública de jugadores por link o tablet. El club sale SIEMPRE del par (slug, token), nunca de un campo del formulario.
import { sql } from 'drizzle-orm';
import { CONSENT_VERSION } from '../../lib/consent';
import type { PlayerInput } from '../../lib/player-schema';
import type { Tx } from '../db/tenant';
import { createPlayer, PlayerError } from './players';
import { hitRateLimit } from './rate-limit';

export type SignupKind = 'link' | 'tablet';
type Locale = 'es' | 'en' | 'pt';
export interface SignupTarget { clubId: string; slug: string; name: string; country: string; locale: Locale; kind: SignupKind; colorPrimary: string | null }

// Por IP, para frenar scripts; por link, para que un link filtrado no llene la base.
export const SIGNUP_LIMIT_PER_IP = { max: 20, windowSec: 600 };
export const SIGNUP_LIMIT_PER_LINK = { max: 200, windowSec: 3600 };
/** Un humano no completa el formulario en menos que esto: es la señal de un bot. */
export const MIN_FILL_MS = 3000;

/** Resuelve el link con las funciones SECURITY DEFINER: devuelve solo lo mínimo y nada si el club está suspendido. */
export async function resolveSignupTarget(tx: Tx, slug: string, token: string): Promise<SignupTarget | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || !/^[A-Za-z0-9_-]{4,64}$/.test(token)) return null;
  const res = await tx.execute(sql`
    select c.id, c.slug, c.name, c.country, c.locale, c.color_primary, l.kind
    from resolve_signup_link(${slug}, ${token}) l
    join public_club_by_slug(${slug}) c on c.id = l.club_id`);
  const r = (res as unknown as { rows: { id: string; slug: string; name: string; country: string; locale: Locale; kind: SignupKind; color_primary: string | null }[] }).rows[0];
  return r ? { clubId: r.id, slug: r.slug, name: r.name, country: r.country, locale: r.locale, kind: r.kind, colorPrimary: r.color_primary } : null;
}

/** Va dentro de withPlatform(). `ipKey` es un hash, nunca la IP en claro. */
export async function allowSignupAttempt(tx: Tx, target: SignupTarget, ipKey: string | null, now?: Date) {
  const link = await hitRateLimit(tx, `signup:link:${target.clubId}:${target.kind}`, SIGNUP_LIMIT_PER_LINK, now);
  const ip = ipKey ? await hitRateLimit(tx, `signup:ip:${ipKey}`, SIGNUP_LIMIT_PER_IP, now) : true;
  return link && ip;
}

export type SignupResult = { status: 'created' } | { status: 'exists' } | { status: 'error'; code: PlayerError['code'] };

/** Va dentro de withTenant(target.clubId). Un teléfono ya registrado no cambia los datos del jugador existente. */
export async function registerPublicPlayer(tx: Tx, target: SignupTarget, input: PlayerInput, locale: Locale): Promise<SignupResult> {
  try {
    await createPlayer(tx, { clubId: target.clubId, country: target.country }, input, { textVersion: CONSENT_VERSION, locale, source: target.kind });
    return { status: 'created' };
  } catch (e) {
    if (e instanceof PlayerError) return e.code === 'phone_taken' ? { status: 'exists' } : { status: 'error', code: e.code };
    throw e;
  }
}
