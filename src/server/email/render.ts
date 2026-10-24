// Arma los correos: el mismo HTML que define el design system (docs/design/emails) con el texto traducido (es/en/pt) y las
// variables escapadas. Cada correo se describe como una lista de bloques; de ahí salen el HTML y la versión en texto plano.
import { createTranslator } from 'next-intl';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';
import pt from '../../../messages/pt.json';
import { EMAIL_FONTS_URL, EMAIL_STYLE } from './head-style';

export type EmailLocale = 'es' | 'en' | 'pt';
export type EmailKind = 'invite' | 'reset' | 'passwordChanged' | 'welcome';

export interface EmailVars {
  /** URL pública de la app, sin barra final: de ahí salen los logos. */
  assetsUrl: string;
  recipientName: string;
  recipientEmail: string;
  /** Link del botón. Siempre de un solo uso y con vencimiento (salvo en la bienvenida con clave inicial, que lleva al login). */
  actionUrl: string;
  clubName?: string;
  inviterName?: string;
  role?: 'owner' | 'staff';
  /** Fecha y hora ya formateadas, en la zona del usuario. */
  changedAt?: string;
  /** Link público de alta de jugadores del club. */
  joinUrl?: string;
  /** La bienvenida lleva a activar la cuenta (con vencimiento) y no al login. */
  activation?: boolean;
}

export interface RenderedEmail { subject: string; html: string; text: string }

const MESSAGES = { es, en, pt } as const;

type LooseTranslator = ((key: string, vars?: Record<string, string | number>) => string) & {
  markup: (key: string, vars: Record<string, string | number | ((chunks: string) => string)>) => string;
};

// --- escape y saneo ---------------------------------------------------------------------------------------------------
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);
/** Una sola línea, sin caracteres de control: lo que va al asunto no puede abrir otra cabecera. */
const CONTROL = new RegExp("[\u0000-\u001f\u007f\u2028\u2029]+", "g");
const oneLine = (s: string) => s.replace(CONTROL, " ").trim().slice(0, 120);
/** Solo http(s): una URL con otro esquema (javascript:, data:) nunca llega a un href. */
const safeUrl = (u: string) => {
  if (!/^https?:\/\//i.test(u)) throw new Error('URL de correo inválida');
  return u;
};

// --- bloques ----------------------------------------------------------------------------------------------------------
const FONT = "'Figtree',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "'Barlow Condensed','Arial Narrow',Arial,sans-serif";

type Block =
  | { kind: 'label'; text: string }
  | { kind: 'title'; text: string }
  | { kind: 'p'; html: string; text: string }
  | { kind: 'muted'; text: string; small?: boolean }
  | { kind: 'button'; label: string; url: string }
  | { kind: 'linkbox'; url: string }
  | { kind: 'notice'; tone: 'warn' | 'danger'; title: string; body: string }
  | { kind: 'steps'; items: { title: string; body: string }[] };

const html = {
  label: (b: { text: string }) => `<p class="tx-brand" style="margin:0 0 12px;font:700 13px/16px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:#0b6b4f;">${esc(b.text)}</p>`,
  title: (b: { text: string }) => `<h1 class="h1 tx-ink" style="margin:0 0 20px;font:700 38px/38px ${DISPLAY};color:#10201b;">${esc(b.text)}</h1>`,
  p: (b: { html: string }) => `<p class="tx-ink" style="margin:0 0 16px;font:400 16px/24px ${FONT};color:#10201b;">${b.html}</p>`,
  muted: (b: { text: string; small?: boolean }) =>
    b.small
      ? `<p class="tx-muted" style="margin:0 0 8px;font:400 13px/18px ${FONT};color:#4a5b55;">${esc(b.text)}</p>`
      : `<p class="tx-muted" style="margin:0 0 16px;font:400 14px/20px ${FONT};color:#4a5b55;">${esc(b.text)}</p>`,
  button: (b: { label: string; url: string }) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td class="bg-btn bd-btn" bgcolor="#0b6b4f" style="background-color:#0b6b4f;border:1px solid #0b6b4f;border-radius:10px;"><a class="tx-onbtn" href="${esc(safeUrl(b.url))}" target="_blank" style="display:inline-block;padding:14px 28px;font:600 16px/20px ${FONT};color:#ffffff;text-decoration:none;border-radius:10px;">${esc(b.label)}</a></td></tr></table>`,
  linkbox: (b: { url: string }) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr><td class="bg-sunken bd-line" bgcolor="#e9eee9" style="background-color:#e9eee9;border:1px solid #cfd9d3;border-radius:10px;padding:12px 14px;"><a class="tx-brand" href="${esc(safeUrl(b.url))}" style="font:500 13px/18px ${FONT};color:#0b6b4f;word-break:break-all;text-decoration:underline;">${esc(b.url)}</a></td></tr></table>`,
  notice: (b: { tone: 'warn' | 'danger'; title: string; body: string }) => {
    const c = b.tone === 'warn' ? { bg: 'bg-warn', tx: 'tx-warn', bgc: '#fdf0d0', txc: '#7a4e00' } : { bg: 'bg-danger', tx: 'tx-danger', bgc: '#fbe4e1', txc: '#b3261e' };
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td class="${c.bg}" bgcolor="${c.bgc}" style="background-color:${c.bgc};border-radius:10px;padding:14px 16px;"><p class="${c.tx}" style="margin:0 0 2px;font:700 14px/20px ${FONT};color:${c.txc};">${esc(b.title)}</p><p class="tx-ink" style="margin:0;font:400 14px/20px ${FONT};color:#10201b;">${esc(b.body)}</p></td></tr></table>`;
  },
  steps: (b: { items: { title: string; body: string }[] }) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">${b.items
      .map(
        (it, i) =>
          `<tr><td valign="top" width="48" style="padding:0 0 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="bg-tint tx-brand" bgcolor="#dff1e8" width="32" height="32" align="center" style="background-color:#dff1e8;border-radius:16px;width:32px;height:32px;font:700 16px/32px ${DISPLAY};color:#0b6b4f;">${i + 1}</td></tr></table></td><td valign="top" style="padding:0 0 16px;"><p class="tx-ink" style="margin:0;font:600 16px/22px ${FONT};color:#10201b;">${esc(it.title)}</p><p class="tx-muted" style="margin:2px 0 0;font:400 14px/20px ${FONT};color:#4a5b55;">${esc(it.body)}</p></td></tr>`,
      )
      .join('')}</table>`,
};

function blockHtml(b: Block): string {
  switch (b.kind) {
    case 'label': return html.label(b);
    case 'title': return html.title(b);
    case 'p': return html.p(b);
    case 'muted': return html.muted(b);
    case 'button': return html.button(b);
    case 'linkbox': return html.linkbox(b);
    case 'notice': return html.notice(b);
    case 'steps': return html.steps(b);
  }
}

function blockText(b: Block): string {
  switch (b.kind) {
    case 'label': return b.text.toUpperCase();
    case 'title': return b.text;
    case 'p': return b.text;
    case 'muted': return b.text;
    case 'button': return `${b.label}: ${b.url}`;
    case 'linkbox': return b.url;
    case 'notice': return `${b.title}\n${b.body}`;
    case 'steps': return b.items.map((it, i) => `${i + 1}. ${it.title}\n   ${it.body}`).join('\n');
  }
}

// --- estructura común -------------------------------------------------------------------------------------------------
function layout(o: { lang: EmailLocale; title: string; preheader: string; blocks: Block[]; footer: string; poweredBy: string; assetsUrl: string; brandName: string }): string {
  const logos = `${esc(safeUrl(o.assetsUrl))}/brand/email`;
  return (
    `<!doctype html><html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(o.title)}</title><link href="${EMAIL_FONTS_URL}" rel="stylesheet"><style>${EMAIL_STYLE}</style></head>` +
    `<body class="bg-canvas" style="margin:0;padding:0;background-color:#f5f7f4;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(o.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` +
    `<table role="presentation" class="bg-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f7f4" style="background-color:#f5f7f4;"><tr><td align="center" style="padding:32px 16px 40px;">` +
    `<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">` +
    `<tr><td class="pad" style="padding:0 40px 24px;"><img class="logo-l" src="${logos}/logo-horizontal.png" width="120" height="20" alt="${esc(o.brandName)}" style="display:block;border:0;height:20px;width:120px;"><img class="logo-d" src="${logos}/logo-horizontal-dark.png" width="120" height="20" alt="" style="display:none;border:0;height:20px;width:120px;"></td></tr>` +
    `<tr><td class="bg-card bd-brand pad" bgcolor="#ffffff" style="background-color:#ffffff;border-top:6px solid #0b6b4f;border-radius:16px;padding:40px 40px 32px;">${o.blocks.map(blockHtml).join('')}</td></tr>` +
    `<tr><td class="pad" style="padding:24px 40px 0;"><p class="tx-muted" style="margin:0 0 8px;font:400 13px/18px ${FONT};color:#4a5b55;">${esc(o.footer)}</p><p class="tx-muted" style="margin:0;font:500 12px/16px ${FONT};color:#4a5b55;">${esc(o.poweredBy)}</p></td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

// --- plantillas -------------------------------------------------------------------------------------------------------
export function renderEmail(kind: EmailKind, locale: EmailLocale, v: EmailVars): RenderedEmail {
  const lang: EmailLocale = locale in MESSAGES ? locale : 'es';
  // Las claves se arman por tipo de correo y de paso (step1Title…): se tipan sueltas para no pelear con el tipado estricto de next-intl.
  const t = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: 'email' }) as unknown as LooseTranslator;
  const name = oneLine(v.recipientName);
  const club = oneLine(v.clubName ?? '');
  const inviter = oneLine(v.inviterName ?? '');
  const role = t(`role.${v.role ?? 'staff'}`);

  // `<b>` de los mensajes: negrita en HTML, nada en texto plano. Las variables se escapan SOLO para el HTML.
  const markupHtml = (key: string, vars: Record<string, string>) =>
    t.markup(key, { ...Object.fromEntries(Object.entries(vars).map(([k, val]) => [k, esc(val)])), b: (chunks: string) => `<b>${chunks}</b>` });
  const markupText = (key: string, vars: Record<string, string>) => t.markup(key, { ...vars, b: (chunks: string) => chunks });
  const para = (key: string, vars: Record<string, string>): Block => ({ kind: 'p', html: markupHtml(key, vars), text: markupText(key, vars) });
  const greeting: Block = { kind: 'p', html: esc(t('common.greeting', { name })), text: t('common.greeting', { name }) };

  const fallback: Block = { kind: 'muted', text: t('common.fallback'), small: true };
  let subject: string, preheader: string, footer: string, blocks: Block[];

  switch (kind) {
    case 'invite':
      subject = t('invite.subject', { inviter, club });
      preheader = t('invite.preheader');
      footer = t('invite.footer', { inviter });
      blocks = [
        { kind: 'label', text: t('invite.label') }, { kind: 'title', text: t('invite.title', { club }) }, greeting,
        para('invite.body', { inviter, role, club }),
        { kind: 'button', label: t('invite.cta'), url: v.actionUrl },
        { kind: 'muted', text: t('invite.expiry') }, fallback, { kind: 'linkbox', url: v.actionUrl },
      ];
      break;
    case 'reset':
      subject = t('reset.subject');
      preheader = t('reset.preheader');
      footer = t('reset.footer', { email: oneLine(v.recipientEmail) });
      blocks = [
        { kind: 'label', text: t('common.security') }, { kind: 'title', text: t('reset.title') }, greeting,
        { kind: 'p', html: esc(t('reset.body')), text: t('reset.body') },
        { kind: 'button', label: t('reset.cta'), url: v.actionUrl },
        { kind: 'muted', text: t('reset.expiry') }, fallback, { kind: 'linkbox', url: v.actionUrl },
        { kind: 'notice', tone: 'warn', title: t('reset.noticeTitle'), body: t('reset.noticeBody') },
      ];
      break;
    case 'passwordChanged':
      subject = t('changed.subject');
      preheader = t('changed.preheader');
      footer = t('changed.footer', { email: oneLine(v.recipientEmail) });
      blocks = [
        { kind: 'label', text: t('common.security') }, { kind: 'title', text: t('changed.title') }, greeting,
        para('changed.body', { when: oneLine(v.changedAt ?? '') }),
        { kind: 'notice', tone: 'danger', title: t('changed.noticeTitle'), body: t('changed.noticeBody') },
        { kind: 'button', label: t('changed.cta'), url: v.actionUrl },
      ];
      break;
    case 'welcome':
      subject = t('welcome.subject', { club });
      preheader = t('welcome.preheader');
      footer = t('welcome.footer', { club });
      blocks = [
        { kind: 'label', text: t('welcome.label') }, { kind: 'title', text: t('welcome.title', { club }) }, greeting,
        { kind: 'p', html: esc(t('welcome.intro')), text: t('welcome.intro') },
        { kind: 'steps', items: [1, 2, 3].map((n) => ({ title: t(`welcome.step${n}Title`), body: t(`welcome.step${n}Body`) })) },
        { kind: 'button', label: v.activation ? t('welcome.ctaActivate') : t('welcome.cta'), url: v.actionUrl },
        ...(v.activation ? [{ kind: 'muted', text: t('invite.expiry') } as Block] : []),
        ...(v.joinUrl ? [{ kind: 'muted', text: t('welcome.joinLabel'), small: true } as Block, { kind: 'linkbox', url: v.joinUrl } as Block] : []),
      ];
      break;
  }

  const poweredBy = t('common.poweredBy');
  return {
    subject,
    html: layout({ lang, title: subject, preheader, blocks, footer, poweredBy, assetsUrl: v.assetsUrl, brandName: t('common.brand') }),
    text: [...blocks.map(blockText), footer, poweredBy].join('\n\n') + '\n',
  };
}
