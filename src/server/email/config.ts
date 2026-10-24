// Configuración del envío de correos. Todo viene de variables de entorno; sin ellas la app sigue funcionando.
//
//   RESEND_API_KEY  clave de la API de Resend
//   EMAIL_FROM      remitente verificado en Resend, p. ej.  PadelHub <no-reply@mail.tudominio.com>
//   APP_URL         URL pública de la app, sin barra final (https://app.tudominio.com). De ahí salen los links y los logos.
//
// Modos:
//   resend    las tres variables están → se envía de verdad.
//   console   sin variables y fuera de producción (tu máquina) → no se envía nada: el correo y su link se imprimen en la consola del servidor.
//   disabled  sin variables en un despliegue (Vercel Preview o Production) → no se envía nada y las pantallas que dependen del correo se ocultan.
// Un despliegue sin configurar NUNCA cae en "console": un link de restablecimiento no puede terminar en un log.

export type EmailMode = 'resend' | 'console' | 'disabled';

export interface EmailConfig {
  mode: EmailMode;
  apiKey: string | null;
  from: string | null;
  /** Base de los links y de las imágenes. Null solo en modo disabled. */
  appUrl: string | null;
}

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** URL base válida (http/https, sin ruta ni barra final) o null. En producción se exige https. */
export function normalizeAppUrl(raw: string | null, requireHttps: boolean): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !requireHttps)) return null;
    if (u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function emailConfig(env: Env = process.env): EmailConfig {
  const production = env.NODE_ENV === 'production';
  const apiKey = clean(env.RESEND_API_KEY);
  const from = clean(env.EMAIL_FROM);
  const appUrl = normalizeAppUrl(clean(env.APP_URL), production);

  if (apiKey && from && appUrl) return { mode: 'resend', apiKey, from, appUrl };
  if (!production) return { mode: 'console', apiKey: null, from: from ?? 'PadelHub <no-reply@localhost>', appUrl: appUrl ?? 'http://localhost:3000' };
  return { mode: 'disabled', apiKey: null, from: null, appUrl };
}

/** ¿Esta instancia puede mandar correos (de verdad o a la consola)? Las pantallas de recuperación y de invitación dependen de esto. */
export const emailAvailable = (env: Env = process.env) => emailConfig(env).mode !== 'disabled';
