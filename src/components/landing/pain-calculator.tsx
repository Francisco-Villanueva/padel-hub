"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { cx, ui } from "../ui";
import { formatMoney, planFor } from "./pricing";

const DEFAULT_PER_WEEK = 7; // un turno vacío por día
const WEEKS_PER_MONTH = 4;

/** Calculadora: cuánta plata NO ingresa el club por mes por sus turnos vacíos, y cuántos turnos llenos pagan PadelHub. */
export function PainCalculator({ ctaHref }: { ctaHref: string }) {
  const t = useTranslations("landing.pain");
  const locale = useLocale();
  const plan = planFor(locale);
  const priceId = useId();
  const weekId = useId();
  const [price, setPrice] = useState(String(plan.sampleSlotPrice));
  const [perWeek, setPerWeek] = useState(DEFAULT_PER_WEEK);

  const slotPrice = Number(price.replace(/\D/g, ""));
  const valid = slotPrice > 0;
  const loss = slotPrice * perWeek * WEEKS_PER_MONTH;
  const breakEven = valid ? Math.ceil(plan.monthly / slotPrice) : 0;

  return (
    <div className="grid gap-6 rounded-lg border border-line-strong bg-surface-raised p-5 shadow-card sm:p-8 md:grid-cols-2 md:gap-10">
      <div className="space-y-6">
        <div>
          <label htmlFor={priceId} className={ui.label}>{t("priceLabel", { currency: plan.currency })}</label>
          <input
            id={priceId}
            inputMode="numeric"
            autoComplete="off"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 7))}
            className={ui.input}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor={weekId} className="text-sm font-semibold text-ink">{t("weekLabel")}</label>
            <output htmlFor={weekId} className="text-sm font-semibold text-brand">{t("weekValue", { count: perWeek })}</output>
          </div>
          <input
            id={weekId}
            type="range"
            min={1}
            max={28}
            step={1}
            value={perWeek}
            onChange={(e) => setPerWeek(Number(e.target.value))}
            className="h-11 w-full cursor-pointer accent-brand"
          />
        </div>
      </div>

      <div className="flex flex-col justify-between gap-6 rounded-md bg-surface-sunken p-5" aria-live="polite">
        {valid ? (
          <div className="space-y-2">
            <p className="font-display text-[28px] font-bold leading-8 text-ink md:text-[32px] md:leading-9">
              {t.rich("lose", { loss: formatMoney(loss, locale), b: (c) => <span className="text-danger">{c}</span> })}
            </p>
            <p className="text-base font-medium text-ink-muted">{t("cost", { price: formatMoney(plan.monthly, locale) })}</p>
            <p className="text-base font-semibold text-brand">{t("breakEven", { n: breakEven })}</p>
          </div>
        ) : (
          <p className="text-base font-medium text-ink-muted">{t("empty")}</p>
        )}
        <a href={ctaHref} className={cx(ui.btnBase, ui.btnPrimary, "min-h-12 px-5")}>{t("button")}</a>
      </div>
    </div>
  );
}
