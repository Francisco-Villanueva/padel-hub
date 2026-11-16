import { useLocale, useTranslations } from "next-intl";
import { cx, stagger, ui } from "../ui";
import { contactHref, demoHref } from "./contact";
import { PainCalculator } from "./pain-calculator";
import { formatMoney, planFor } from "./pricing";

const wrap = "mx-auto w-full max-w-6xl px-4 lg:px-16";
const eyebrow = "text-sm font-bold uppercase tracking-[0.08em] text-brand";
const h2 = "mt-3 max-w-2xl font-display text-[32px] font-bold leading-[34px] text-ink md:text-[40px] md:leading-10";
const btnLg = "min-h-12 px-5";

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="inline-flex size-12 items-center justify-center rounded-md bg-brand-tint text-brand">
      <svg viewBox="0 0 24 24" className="size-6" {...ICON}>{children}</svg>
    </span>
  );
}

const SLOTS = [
  { initials: "MQ", first: "Martina", last: "Quiroga" },
  { initials: "SP", first: "Sofía", last: "Paz" },
  { initials: "VR", first: "Valentina", last: "Ríos" },
];

/** Tarjeta de ejemplo del producto (nombres ficticios): un turno al que le falta uno. */
function MatchCard() {
  const t = useTranslations("landing.hero");
  return (
    <div role="img" aria-label={t("cardLabel")} className="relative overflow-hidden rounded-lg bg-brand p-4 sm:p-10 lg:p-12">
      {/* Cancha vista desde arriba: borde, línea central y líneas de saque. */}
      <div aria-hidden className="pointer-events-none absolute inset-3 border-2 border-ball sm:inset-4">
        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ball" />
        <span className="absolute inset-x-0 top-1/2 h-0.5 bg-ball" />
        <span className="absolute inset-x-0 top-3/4 h-0.5 bg-ball" />
      </div>
      <span aria-hidden className="absolute left-2 top-16 size-9 rounded-full bg-ball sm:left-3 sm:top-24 sm:size-12" />
      <div className="relative mt-20 rounded-lg bg-surface-raised p-4 shadow-card sm:mx-4 sm:mt-24 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-semibold text-ink">{t("when")}</p>
          <span className={ui.badgeBall}>{t("missing")}</span>
        </div>
        <ul className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          {SLOTS.map((s) => (
            <li key={s.initials} className="flex min-h-24 flex-col items-center justify-between rounded-md bg-brand-tint px-1 py-3 text-center sm:min-h-28">
              <span className="font-semibold text-brand" aria-hidden>{s.initials}</span>
              <span className="text-xs leading-4 text-ink sm:text-sm sm:leading-[18px]">{s.first}<br className="hidden sm:inline" /> <span className="hidden sm:inline">{s.last}</span></span>
            </li>
          ))}
          <li className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-ink-muted sm:min-h-28">
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" {...ICON}><path d="M12 5v14M5 12h14" /></svg>
            <span className="text-xs sm:text-sm">{t("free")}</span>
          </li>
        </ul>
        <span className={cx(ui.btnBase, ui.btnWhatsapp, "mt-4 min-h-12 w-full select-none px-4")}>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" {...ICON}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
          {t("whatsapp")}
        </span>
      </div>
    </div>
  );
}

export function Hero() {
  const t = useTranslations("landing.hero");
  return (
    <section className="py-10 md:py-16 lg:py-20">
      <div className={cx(wrap, "grid items-center gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16")}>
        <div className="enter">
          <p className="inline-block rounded-sm bg-ball px-3 py-1 text-sm font-bold uppercase tracking-[0.08em] text-on-ball">{t("eyebrow")}</p>
          <h1 className="mt-4 font-display text-[52px] font-bold leading-[50px] text-ink md:text-[72px] md:leading-[70px] lg:text-[80px] lg:leading-[76px]">
            {t.rich("title", { accent: (c) => <span className="text-brand">{c}</span> })}
          </h1>
          <p className="mt-6 max-w-xl text-base font-medium text-ink-muted md:text-[22px] md:leading-8">{t("lead")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={contactHref()} className={cx(ui.btnBase, ui.btnPrimary, btnLg)}>{t("cta")}</a>
            <a href={demoHref()} className={cx(ui.btnBase, ui.btnSecondary, btnLg)}>{t("secondary")}</a>
          </div>
          <p className="mt-5 text-sm font-medium text-ink-muted">{t("note")}</p>
          <p className="mt-3 text-sm font-semibold text-ink">{t("proof")}</p>
        </div>
        <div className="enter" style={stagger(2)}>
          <MatchCard />
        </div>
      </div>
    </section>
  );
}

export function Benefits() {
  const t = useTranslations("landing.benefits");
  const items = [
    { key: "players", icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.7c2 .6 3.2 2.3 3.5 5.3" /></> },
    { key: "quarter", icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14M3 12h4M17 12h4" /></> },
    { key: "consent", icon: <path d="M12 3 4.5 6v5.5c0 4.5 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5 7.5-9.5V6L12 3Z" /> },
  ] as const;
  return (
    <section id="beneficios" className="py-16 md:py-20">
      <div className={wrap}>
        <p className={eyebrow}>{t("eyebrow")}</p>
        <h2 className={h2}>{t("title")}</h2>
        <ul className="mt-10 grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {items.map((it, i) => (
            <li key={it.key} className={cx(ui.card, "enter space-y-3 sm:p-6")} style={stagger(i)}>
              <IconBox>{it.icon}</IconBox>
              <h3 className="pt-1 text-xl font-semibold leading-7 text-ink">{t(`${it.key}.title`)}</h3>
              <p className="text-[15px] leading-[22px] text-ink-muted">{t(`${it.key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Pain() {
  const t = useTranslations("landing.pain");
  return (
    <section id="calculadora" className="bg-surface-sunken py-16 md:py-20">
      <div className={wrap}>
        <p className={eyebrow}>{t("eyebrow")}</p>
        <h2 className={h2}>{t("title")}</h2>
        <div className="mt-10">
          <PainCalculator ctaHref={contactHref()} />
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  const t = useTranslations("landing.pricing");
  const locale = useLocale();
  const plan = planFor(locale);
  return (
    <section id="precio" className="py-16 md:py-20">
      <div className={wrap}>
        <p className={eyebrow}>{t("eyebrow")}</p>
        <h2 className={h2}>{t("title", { price: formatMoney(plan.monthly, locale) })}</h2>
        <div className="mt-10 max-w-xl space-y-3 rounded-lg border border-line-strong bg-surface-raised p-6 shadow-card sm:p-8">
          <span className={ui.badgeBall}>{t("trial")}</span>
          <h3 className="text-xl font-semibold text-ink">{t("planName")}</h3>
          <p className="text-[15px] leading-[22px] text-ink-muted">{t(plan.key === "ars" ? "planForArs" : "planForUsd")}</p>
          <p className="text-[15px] leading-[22px] text-ink">{t("setup")}</p>
          <p className="text-[15px] leading-[22px] text-ink-muted">{t("annual", { annual: formatMoney(plan.annual, locale) })}</p>
          <a href={contactHref()} className={cx(ui.btnBase, ui.btnPrimary, btnLg, "mt-2 w-full sm:w-auto")}>{t("button")}</a>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const t = useTranslations("landing.steps");
  const keys = ["share", "signup", "complete"] as const;
  return (
    <section id="como-funciona" className="bg-surface-sunken py-16 md:py-20">
      <div className={wrap}>
        <p className={eyebrow}>{t("eyebrow")}</p>
        <h2 className={h2}>{t("title")}</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {keys.map((k, i) => (
            <li key={k} className="border-t-2 border-line-strong pt-4">
              <span aria-hidden className="font-display text-[56px] font-bold leading-[54px] text-brand">{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold text-ink">{t(`${k}.title`)}</h3>
              <p className="mt-1.5 text-[15px] leading-[22px] text-ink-muted">{t(`${k}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Faq() {
  const t = useTranslations("landing.faq");
  const keys = ["q1", "q2", "q3", "q4"] as const;
  return (
    <section id="preguntas" className="py-16 md:py-20">
      <div className={wrap}>
        <p className={eyebrow}>{t("eyebrow")}</p>
        <h2 className={h2}>{t("title")}</h2>
        <div className="mt-8 max-w-3xl border-t border-line-strong">
          {keys.map((k, i) => (
            <details key={k} name="faq" open={i === 0} className="group border-b border-line-strong">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                {t(`${k}.q`)}
                <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-muted transition-transform duration-200 group-open:rotate-90" {...ICON}>
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </summary>
              <p className="max-w-2xl pb-5 text-[15px] leading-[22px] text-ink-muted">{t(`${k}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  const t = useTranslations("landing.cta");
  return (
    <section className="pb-16 md:pb-20">
      <div className={wrap}>
        <div className="flex flex-col gap-6 rounded-lg bg-brand p-6 text-on-brand sm:p-10 md:flex-row md:items-center md:justify-between md:px-14 md:py-12">
          <h2 className="max-w-xl font-display text-[32px] font-bold leading-[34px] md:text-[40px] md:leading-10">{t("title")}</h2>
          <a href={contactHref()} className={cx(ui.btnBase, "min-h-12 shrink-0 bg-ball px-6 text-on-ball hover:brightness-95")}>{t("button")}</a>
        </div>
      </div>
    </section>
  );
}
