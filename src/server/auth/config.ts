// Valores iniciales de docs/system-design.md 3.1; ajustables.
export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 3600;
// Dos refresh simultáneos con el mismo token (dos pestañas) no son un robo: ventana de tolerancia.
export const REFRESH_CONCURRENCY_GRACE_MS = 10_000;

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60_000;
export const LOGIN_LIMIT_PER_EMAIL = { max: 10, windowSec: 15 * 60 };
export const LOGIN_LIMIT_PER_IP = { max: 30, windowSec: 15 * 60 };

export const ACCESS_COOKIE = 'ph_at';
export const REFRESH_COOKIE = 'ph_rt';
// El refresh solo viaja a los endpoints de auth.
export const REFRESH_COOKIE_PATH = '/api/auth';

export const MIN_PASSWORD_LENGTH = 10;
