import type { CSSProperties } from "react";

// Clases compartidas. Los colores son tokens semánticos de globals.css (el modo oscuro es automático).
// Alto de control: 48px en celular (control-lg, área táctil) y 40px desde `sm` (control-md).
const btnBase =
  'inline-flex select-none items-center justify-center gap-2 rounded-md text-sm font-semibold transition-[background-color,border-color,color,transform,filter] duration-200 ease-out ' +
  'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100';
const badgeBase = 'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-semibold';
const noticeBase = 'rounded-md px-4 py-3 text-sm font-medium';

export const ui = {
  input:
    'min-h-12 w-full rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-base text-ink placeholder:text-ink-muted ' +
    'transition-[border-color,box-shadow] duration-200 hover:border-ink-muted focus:border-brand focus:outline-2 focus:outline-offset-1 focus:outline-focus sm:min-h-10 sm:text-sm',
  label: 'mb-1.5 block text-sm font-semibold text-ink',
  hint: 'mt-1.5 text-xs font-medium text-ink-muted',
  error: 'mt-1.5 text-xs font-medium text-danger',
  btnBase,
  btn: `${btnBase} min-h-12 px-4 py-2 sm:min-h-10`,
  btnSm: `${btnBase} min-h-10 px-3`,
  btnPrimary: 'bg-brand text-on-brand hover:bg-brand-hover',
  btnSecondary: 'border border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken',
  btnGhost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  btnDanger: 'border border-danger bg-surface-raised text-danger hover:bg-danger-tint',
  btnDangerSolid: 'bg-danger text-on-danger hover:brightness-95',
  // WhatsApp es la acción primaria de "Falta el cuarto": usa el verde de marca (sin color propio).
  btnWhatsapp: 'bg-brand text-on-brand hover:bg-brand-hover',
  link: 'font-semibold text-brand underline underline-offset-4 transition-colors hover:text-brand-hover',
  card: 'rounded-lg border border-line bg-surface-raised p-4 shadow-card sm:p-6',
  chip:
    'inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-surface-raised px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunken',
  chipActive: 'border-brand bg-brand-tint text-brand',
  badge: `${badgeBase} bg-surface-sunken text-ink-muted`,
  badgeAccent: `${badgeBase} bg-brand-tint text-brand`,
  badgeDanger: `${badgeBase} bg-danger-tint text-danger`,
  badgeWarning: `${badgeBase} bg-warning-tint text-warning`,
  badgeInfo: `${badgeBase} bg-info-tint text-info`,
  badgeBall: `${badgeBase} bg-ball text-on-ball`,
  notice: noticeBase,
  noticeOk: 'bg-brand-tint text-brand',
  noticeError: 'bg-danger-tint text-danger',
  noticeWarning: 'bg-warning-tint text-warning',
  noticeInfo: 'bg-info-tint text-info',
} as const;

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Retardo escalonado para `enter`: el índice se topa en 10 para que listas largas no tarden en aparecer. */
export const stagger = (index: number): CSSProperties => ({ ["--i" as string]: Math.min(index, 10) }) as CSSProperties;
