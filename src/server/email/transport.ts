// Transportes de correo. El resto de la app nunca habla con Resend directamente: usa sendEmail() (send.ts).
import type { EmailConfig } from './config';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  send(msg: OutgoingEmail): Promise<{ id: string | null }>;
}

/** El proveedor respondió con un error o no respondió. El mensaje no incluye el cuerpo del correo ni el destinatario. */
export class EmailDeliveryError extends Error {
  constructor(message: string, readonly status: number | null = null) { super(message); }
}

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

/** Resend por su API HTTP (sin SDK: una dependencia menos y el mismo contrato). */
export function resendTransport(cfg: Pick<EmailConfig, 'apiKey' | 'from'>, fetchImpl: typeof fetch = fetch): EmailTransport {
  if (!cfg.apiKey || !cfg.from) throw new Error('resendTransport necesita RESEND_API_KEY y EMAIL_FROM');
  return {
    async send(msg) {
      let res: Response;
      try {
        res = await fetchImpl(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        throw new EmailDeliveryError(e instanceof Error && e.name === 'TimeoutError' ? 'Resend no respondió a tiempo' : 'No se pudo conectar con Resend');
      }
      if (!res.ok) {
        // El detalle del error de Resend ("name"/"message") ayuda a diagnosticar y no lleva datos del correo.
        const detail = await res.json().catch(() => null) as { name?: string; message?: string } | null;
        throw new EmailDeliveryError(`Resend respondió ${res.status}${detail?.name ? ` (${detail.name})` : ''}${detail?.message ? `: ${detail.message}` : ''}`, res.status);
      }
      const body = await res.json().catch(() => null) as { id?: string } | null;
      return { id: body?.id ?? null };
    },
  };
}

/** Desarrollo local: imprime el asunto y el texto plano (con el link) en la consola del servidor. */
export function consoleTransport(log: (line: string) => void = console.log): EmailTransport {
  return {
    async send(msg) {
      log(`\n──────── EMAIL (modo consola, no se envió) ────────\nPara:   ${msg.to}\nAsunto: ${msg.subject}\n\n${msg.text}\n────────────────────────────────────────────────────\n`);
      return { id: null };
    },
  };
}

/** Tests: guarda los correos en memoria. */
export interface MemoryTransport extends EmailTransport {
  outbox: OutgoingEmail[];
  failNext(error?: Error): void;
}
export function memoryTransport(): MemoryTransport {
  const outbox: OutgoingEmail[] = [];
  let failure: Error | null = null;
  return {
    outbox,
    failNext(error = new EmailDeliveryError('falla simulada')) { failure = error; },
    async send(msg) {
      if (failure) { const e = failure; failure = null; throw e; }
      outbox.push(msg);
      return { id: `mem-${outbox.length}` };
    },
  };
}
