"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ClubMark } from "@/components/club-mark";
import { cx, ui } from "@/components/ui";
import { CLUB_LOCALES, TIMEZONES } from "@/lib/club-schema";
import { lowContrastWithWhite, textOn } from "@/lib/color";
import { saveBrandAction, type SettingsState } from "../actions";
import { LogoCard } from "./logo-card";

export type BrandValues = { name: string; colorPrimary: string; colorAccent: string; locale: string; timezone: string; contactEmail: string; logoUrl: string };

const HEX = /^#[0-9a-fA-F]{6}$/;
const LOCALE_NAMES: Record<string, string> = { es: "Español", en: "English", pt: "Português" };
const tzLabel = (tz: string) => tz.split("/").pop()!.replace(/_/g, " ");

function ColorField({ id, label, value, onChange, hint, error }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; error?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className={ui.label}>{label}</label>
      <div className="flex gap-2">
        {/* El selector nativo y el campo de texto editan el mismo valor. */}
        <input
          type="color" aria-label={label} value={HEX.test(value) ? value : "#0b6b4f"} onChange={(e) => onChange(e.target.value)}
          className="size-12 shrink-0 cursor-pointer rounded-md border border-line-strong bg-surface-raised p-1 sm:size-10"
        />
        <input
          id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} placeholder="#0B6B4F" autoComplete="off" spellCheck={false}
          aria-invalid={error || undefined} className={cx(ui.input, "font-mono")}
        />
      </div>
      {hint && <p className={ui.hint}>{hint}</p>}
    </div>
  );
}

export function BrandForm({ initial }: { initial: BrandValues }) {
  // Cambiar la `key` descarta lo escrito y vuelve a los valores guardados.
  const [round, setRound] = useState(0);
  return <Inner key={round} initial={initial} onDiscard={() => setRound((r) => r + 1)} />;
}

function Inner({ initial, onDiscard }: { initial: BrandValues; onDiscard: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [state, action, pending] = useActionState(saveBrandAction, { status: "idle" } as SettingsState);
  const [v, setV] = useState(initial);
  const set = (k: keyof BrandValues) => (value: string) => setV((s) => ({ ...s, [k]: value }));
  const bad = (f: string) => state.fields?.includes(f);

  const primary = HEX.test(v.colorPrimary) ? v.colorPrimary : null;
  const accent = HEX.test(v.colorAccent) ? v.colorAccent : null;
  const warn = primary !== null && lowContrastWithWhite(primary);
  const previewBg = primary ?? "var(--brand)";
  const previewFg = primary ? textOn(primary) : "var(--on-brand)";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
      <LogoCard name={v.name} logoUrl={initial.logoUrl} />
      <form action={action} className={cx(ui.card, "enter space-y-5")}>
        <input type="hidden" name="locale" value={locale} />
        {state.status === "error" && state.error && (
          <p role="alert" className={cx(ui.notice, ui.noticeError)}>{t(`settings.errors.${state.error}`)}</p>
        )}
        {state.status === "ok" && <p role="status" className={cx(ui.notice, ui.noticeOk)}>{t("settings.saved")}</p>}

        <div>
          <label htmlFor="name" className={ui.label}>{t("settings.brand.name")}</label>
          <input id="name" name="name" required minLength={2} maxLength={80} value={v.name} onChange={(e) => set("name")(e.target.value)} className={ui.input} aria-invalid={bad("name") || undefined} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField id="colorPrimary" label={t("settings.brand.colorPrimary")} value={v.colorPrimary} onChange={set("colorPrimary")} error={bad("colorPrimary")} hint={t("settings.brand.colorHint")} />
          <ColorField id="colorAccent" label={t("settings.brand.colorAccent")} value={v.colorAccent} onChange={set("colorAccent")} error={bad("colorAccent")} />
        </div>

        {warn && (
          <div role="note" className={cx(ui.notice, ui.noticeWarning, "flex items-start gap-3 border border-warning")}>
            <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
            <div>
              <p className="font-semibold">{t("settings.brand.contrastTitle")}</p>
              <p className="font-normal">{t("settings.brand.contrastBody")}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="locale-select" className={ui.label}>{t("settings.brand.locale")}</label>
            <select id="locale-select" name="clubLocale" value={v.locale} onChange={(e) => set("locale")(e.target.value)} className={ui.input}>
              {CLUB_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="timezone" className={ui.label}>{t("settings.brand.timezone")}</label>
            <select id="timezone" name="timezone" value={v.timezone} onChange={(e) => set("timezone")(e.target.value)} className={ui.input}>
              {TIMEZONES.map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="contactEmail" className={ui.label}>{t("settings.brand.email")}</label>
          <input id="contactEmail" name="contactEmail" type="email" maxLength={254} value={v.contactEmail} onChange={(e) => set("contactEmail")(e.target.value)} className={ui.input} aria-invalid={bad("contactEmail") || undefined} />
          <p className={ui.hint}>{t("settings.brand.emailHint")}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onDiscard} className={cx(ui.btn, ui.btnSecondary)}>{t("settings.discard")}</button>
          <button type="submit" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{pending ? t("settings.saving") : t("settings.save")}</button>
        </div>
      </form>
      </div>

      <aside className="space-y-2" aria-label={t("settings.brand.preview")}>
        <p className="text-sm font-semibold">{t("settings.brand.preview")}</p>
        <div className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-card">
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: previewBg, color: previewFg }}>
            <ClubMark name={v.name} logoUrl={initial.logoUrl || null} size="sm" tone="ink" />
            <span className="truncate font-semibold">{v.name || "—"}</span>
          </div>
          <div className="space-y-3 p-4">
            <p className="font-display text-3xl font-bold leading-none">{t("settings.brand.previewTitle")}</p>
            <div className="h-9 rounded-md bg-surface-sunken" />
            <div className="h-9 rounded-md bg-surface-sunken" />
            <div className="flex gap-2">
              <span className="rounded-full border border-line-strong px-3 py-1 text-sm font-semibold">6ta</span>
              <span className="rounded-full px-3 py-1 text-sm font-semibold" style={{ background: accent ?? "var(--ball)", color: accent ? textOn(accent) : "var(--on-ball)" }}>Drive</span>
            </div>
            <div className="rounded-md py-2.5 text-center text-sm font-semibold" style={{ background: previewBg, color: previewFg }}>{t("signup.submit")}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
