// Único punto de salida de correos. Nunca lanza: si el envío falla, devuelve el estado y la app decide qué mostrar.
import { emailConfig, type EmailConfig } from './config';
import { consoleTransport, resendTransport, type EmailTransport } from './transport';
import { renderEmail, type EmailKind, type EmailLocale, type EmailVars } from './render';

export type SendStatus = 'sent' | 'console' | 'disabled' | 'failed';
export interface SendResult { status: SendStatus; id?: string | null }

type TemplateVars = Omit<EmailVars, 'assetsUrl' | 'recipientName' | 'recipientEmail'>;

// Solo para tests: reemplaza el transporte real.
let override: EmailTransport | null = null;
export function setEmailTransportForTests(t: EmailTransport | null) { override = t; }

function transportFor(cfg: EmailConfig): EmailTransport | null {
  if (override) return override;
  if (cfg.mode === 'resend') return resendTransport(cfg);
  if (cfg.mode === 'console') return consoleTransport();
  return null;
}

/** Link absoluto a una ruta de la app, o null si esta instancia no tiene APP_URL (correo deshabilitado). */
export function appLink(path: string, cfg: EmailConfig = emailConfig()): string | null {
  if (!cfg.appUrl) return null;
  return `${cfg.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/** ¿Hay forma de mandar correos en esta instancia? (también cuenta el modo consola de desarrollo y el transporte de los tests) */
export function emailEnabled(cfg: EmailConfig = emailConfig()): boolean {
  return override !== null || cfg.mode !== 'disabled';
}

export async function sendEmail(
  kind: EmailKind,
  to: { email: string; name: string },
  locale: EmailLocale,
  vars: TemplateVars,
): Promise<SendResult> {
  const cfg = emailConfig();
  const transport = transportFor(cfg);
  if (!transport) {
    console.error(`[email] No se envió "${kind}": falta configurar RESEND_API_KEY, EMAIL_FROM y APP_URL en este ambiente.`);
    return { status: 'disabled' };
  }
  try {
    const mail = renderEmail(kind, locale, { ...vars, assetsUrl: cfg.appUrl ?? 'http://localhost:3000', recipientName: to.name, recipientEmail: to.email });
    const { id } = await transport.send({ to: to.email, subject: mail.subject, html: mail.html, text: mail.text });
    return { status: cfg.mode === 'console' && !override ? 'console' : 'sent', id };
  } catch (e) {
    // El mensaje de error no lleva el cuerpo ni el destinatario; el link tampoco se registra.
    console.error(`[email] Falló el envío de "${kind}": ${e instanceof Error ? e.message : 'error desconocido'}`);
    return { status: 'failed' };
  }
}
