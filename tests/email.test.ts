import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailAvailable, emailConfig, normalizeAppUrl } from '../src/server/email/config';
import { esc, renderEmail, type EmailKind, type EmailLocale, type EmailVars } from '../src/server/email/render';
import { appLink, emailEnabled, sendEmail, setEmailTransportForTests } from '../src/server/email/send';
import { consoleTransport, EmailDeliveryError, memoryTransport, resendTransport } from '../src/server/email/transport';

const KINDS: EmailKind[] = ['invite', 'reset', 'passwordChanged', 'welcome'];
const LOCALES: EmailLocale[] = ['es', 'en', 'pt'];
const vars: EmailVars = {
  assetsUrl: 'https://app.ejemplo.com', recipientName: 'Ana Gómez', recipientEmail: 'ana@ejemplo.com', actionUrl: 'https://app.ejemplo.com/es/activar/tok123',
  clubName: 'Club Costanera', inviterName: 'Luis Pérez', role: 'staff', changedAt: '24 de octubre de 2026, 10:15', joinUrl: 'https://app.ejemplo.com/es/c/costanera/abc',
};

afterEach(() => setEmailTransportForTests(null));

describe('configuración', () => {
  it('con las tres variables envía de verdad', () => {
    const c = emailConfig({ NODE_ENV: 'production', RESEND_API_KEY: 're_x', EMAIL_FROM: 'PadelHub <no-reply@mail.ej.com>', APP_URL: 'https://app.ej.com/' });
    expect(c).toMatchObject({ mode: 'resend', appUrl: 'https://app.ej.com', from: 'PadelHub <no-reply@mail.ej.com>' });
  });

  it('en producción sin variables queda deshabilitado, nunca en modo consola', () => {
    expect(emailConfig({ NODE_ENV: 'production' }).mode).toBe('disabled');
    expect(emailConfig({ NODE_ENV: 'production', RESEND_API_KEY: 're_x' }).mode).toBe('disabled'); // falta el remitente y la URL
    expect(emailAvailable({ NODE_ENV: 'production' })).toBe(false);
  });

  it('en producción exige https; fuera de producción acepta http local', () => {
    const base = { RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@b.com' };
    expect(emailConfig({ ...base, NODE_ENV: 'production', APP_URL: 'http://app.ej.com' }).mode).toBe('disabled');
    expect(emailConfig({ ...base, NODE_ENV: 'development', APP_URL: 'http://localhost:3000' }).mode).toBe('resend');
  });

  it('en tu máquina, sin variables, usa la consola y localhost', () => {
    expect(emailConfig({ NODE_ENV: 'development' })).toMatchObject({ mode: 'console', appUrl: 'http://localhost:3000' });
    expect(emailAvailable({ NODE_ENV: 'development' })).toBe(true);
  });

  it('normaliza APP_URL y rechaza lo raro', () => {
    expect(normalizeAppUrl('https://app.ej.com/ruta/?x=1', true)).toBe('https://app.ej.com');
    expect(normalizeAppUrl('javascript:alert(1)', false)).toBeNull();
    expect(normalizeAppUrl('https://user:pw@app.ej.com', true)).toBeNull();
    expect(normalizeAppUrl('no es una url', false)).toBeNull();
    expect(normalizeAppUrl(null, false)).toBeNull();
  });
});

describe('plantillas', () => {
  for (const kind of KINDS) {
    for (const locale of LOCALES) {
      it(`${kind} (${locale}): completa, sin variables sueltas y con versión de texto`, () => {
        const m = renderEmail(kind, locale, vars);
        for (const out of [m.subject, m.html, m.text]) {
          expect(out).not.toMatch(/\{\{\s*[a-z_.]+\s*\}\}/i); // ninguna variable {{...}} de plantilla sin reemplazar (el CSS sí cierra con "}}")
          expect(out).not.toMatch(/\{(name|club|inviter|email|when|role)\}/); // ni placeholders ICU sin resolver
        }
        expect(m.subject.length).toBeGreaterThan(5);
        expect(m.subject.length).toBeLessThanOrEqual(60 + 20); // los asuntos del design system no pasan de 60 (más el nombre del club)
        expect(m.html).toContain(`lang="${locale}"`);
        expect(m.html).toContain('https://app.ejemplo.com/brand/email/logo-horizontal.png');
        expect(m.html).toContain('prefers-color-scheme');
        expect(m.html).toContain(vars.actionUrl);
        expect(m.text).toContain(vars.actionUrl);
        expect(m.text).not.toMatch(/<[a-z/][^>]*>/i); // el texto plano no lleva etiquetas
        expect(m.text.trim().length).toBeGreaterThan(80);
      });
    }
  }

  it('el idioma cambia el texto', () => {
    expect(renderEmail('reset', 'es', vars).subject).toBe('Restablecé tu contraseña de PadelHub');
    expect(renderEmail('reset', 'en', vars).subject).toBe('Reset your PadelHub password');
    expect(renderEmail('reset', 'pt', vars).subject).toBe('Redefina sua senha do PadelHub');
    expect(renderEmail('invite', 'es', vars).html).toContain('te sumó como <b>empleado</b> en <b>Club Costanera</b>');
    expect(renderEmail('invite', 'en', vars).html).toContain('added you as <b>staff member</b> at <b>Club Costanera</b>');
  });

  it('escapa lo que escribe una persona (nombres, club) en HTML, asunto y texto', () => {
    const evil = { ...vars, recipientName: '<img src=x onerror=alert(1)>', clubName: '"><script>alert(2)</script>', inviterName: 'Luis & Co <b>' };
    const m = renderEmail('invite', 'es', evil);
    expect(m.html).not.toContain('<script>alert(2)</script>');
    expect(m.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(m.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(m.html).toContain('Luis &amp; Co &lt;b&gt;');
    expect(esc(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });

  it('el asunto no puede abrir otra cabecera (sin saltos de línea)', () => {
    const m = renderEmail('invite', 'es', { ...vars, inviterName: 'Luis\r\nBcc: robo@malo.com', clubName: 'Club\nX' });
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it('rechaza links con otro esquema (javascript:, data:)', () => {
    expect(() => renderEmail('reset', 'es', { ...vars, actionUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => renderEmail('reset', 'es', { ...vars, actionUrl: 'data:text/html;base64,AAAA' })).toThrow();
    expect(() => renderEmail('reset', 'es', { ...vars, assetsUrl: 'javascript:alert(1)' })).toThrow();
  });

  it('nunca incluye claves ni teléfonos, y el link no lleva datos personales', () => {
    for (const kind of KINDS) {
      const m = renderEmail(kind, 'es', vars);
      expect(m.html + m.text).not.toMatch(/contraseña inicial|password=|\+54\s?9?\s?\d{3}/i);
    }
    expect(new URL(vars.actionUrl).search).toBe('');
  });

  it('la bienvenida muestra el link de alta y cambia el botón si lleva a activar la cuenta', () => {
    const plain = renderEmail('welcome', 'es', vars);
    expect(plain.html).toContain('Entrar al panel');
    expect(plain.html).toContain(vars.joinUrl!);
    const act = renderEmail('welcome', 'es', { ...vars, activation: true });
    expect(act.html).toContain('Activar mi cuenta y entrar');
    expect(act.html).toContain('El link vence en 7 días');
  });
});

describe('envío', () => {
  it('manda por el transporte, con asunto, HTML y texto', async () => {
    const mem = memoryTransport();
    setEmailTransportForTests(mem);
    const r = await sendEmail('reset', { email: 'ana@ejemplo.com', name: 'Ana' }, 'es', { actionUrl: 'https://app.ejemplo.com/es/restablecer/abc' });
    expect(r.status).toBe('sent');
    expect(mem.outbox).toHaveLength(1);
    expect(mem.outbox[0]).toMatchObject({ to: 'ana@ejemplo.com', subject: 'Restablecé tu contraseña de PadelHub' });
    expect(mem.outbox[0].html).toContain('restablecer/abc');
  });

  it('si el proveedor falla no lanza: devuelve "failed" y no registra el destinatario ni el link', async () => {
    const mem = memoryTransport();
    setEmailTransportForTests(mem);
    mem.failNext(new EmailDeliveryError('Resend respondió 422'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await sendEmail('reset', { email: 'secreto@ejemplo.com', name: 'Ana' }, 'es', { actionUrl: 'https://app.ejemplo.com/es/restablecer/TOKEN-SECRETO' });
    expect(r.status).toBe('failed');
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).toContain('Resend respondió 422');
    expect(logged).not.toContain('secreto@ejemplo.com');
    expect(logged).not.toContain('TOKEN-SECRETO');
    spy.mockRestore();
  });

  it('sin configuración (deshabilitado) devuelve "disabled" sin tirar la app', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prev = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    const r = await sendEmail('reset', { email: 'a@b.com', name: 'A' }, 'es', { actionUrl: 'https://x.com/a' });
    expect(r.status).toBe('disabled');
    expect(emailEnabled()).toBe(false);
    expect(appLink('/es/login')).toBeNull();
    vi.unstubAllEnvs();
    expect(prev).toBeDefined();
    spy.mockRestore();
  });

  it('appLink arma links absolutos con la URL de la app', () => {
    const cfg = emailConfig({ NODE_ENV: 'production', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.com', APP_URL: 'https://app.ej.com' });
    expect(appLink('/es/activar/x', cfg)).toBe('https://app.ej.com/es/activar/x');
    expect(appLink('es/login', cfg)).toBe('https://app.ej.com/es/login');
  });
});

describe('transportes', () => {
  const msg = { to: 'ana@ejemplo.com', subject: 'Asunto', html: '<p>hola</p>', text: 'hola' };

  it('Resend: pega a su API con la clave, el remitente y el contenido', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'abc123' }), { status: 200 }));
    const out = await resendTransport({ apiKey: 're_clave', from: 'PadelHub <no-reply@mail.ej.com>' }, fetchMock as unknown as typeof fetch).send(msg);
    expect(out.id).toBe('abc123');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_clave');
    expect(JSON.parse(init.body as string)).toEqual({ from: 'PadelHub <no-reply@mail.ej.com>', to: ['ana@ejemplo.com'], subject: 'Asunto', html: '<p>hola</p>', text: 'hola' });
  });

  it('Resend: un error HTTP se convierte en EmailDeliveryError con el motivo, sin el cuerpo del correo', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'validation_error', message: 'The from address is not verified' }), { status: 422 }));
    const err = await resendTransport({ apiKey: 'k', from: 'a@b.com' }, fetchMock as unknown as typeof fetch).send(msg).catch((e) => e);
    expect(err).toBeInstanceOf(EmailDeliveryError);
    expect(err.status).toBe(422);
    expect(err.message).toContain('validation_error');
    expect(err.message).not.toContain('ana@ejemplo.com');
  });

  it('Resend: una caída de red también es EmailDeliveryError', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(resendTransport({ apiKey: 'k', from: 'a@b.com' }, fetchMock as unknown as typeof fetch).send(msg)).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it('Resend: exige clave y remitente', () => {
    expect(() => resendTransport({ apiKey: null, from: 'a@b.com' })).toThrow();
    expect(() => resendTransport({ apiKey: 'k', from: null })).toThrow();
  });

  it('consola: imprime asunto y texto, no envía', async () => {
    const lines: string[] = [];
    await consoleTransport((l) => lines.push(l)).send(msg);
    expect(lines.join('')).toContain('Asunto');
    expect(lines.join('')).toContain('hola');
  });
});
