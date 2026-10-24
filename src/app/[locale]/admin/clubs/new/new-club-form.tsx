"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { cx, ui } from "@/components/ui";
import { CLUB_LOCALES, COUNTRIES, TIMEZONES } from "@/lib/club-schema";
import { Link } from "@/i18n/navigation";
import { createClubAction, type AdminState } from "../../actions";

const LOCALE_NAMES: Record<string, string> = { es: "Español", en: "English", pt: "Português" };
const tzLabel = (tz: string) => tz.split("/").pop()!.replace(/_/g, " ");

export function NewClubForm({ mailEnabled }: { mailEnabled: boolean }) {
  const t = useTranslations("admin.new");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useActionState(createClubAction, { status: "idle" } as AdminState);
  const v = state.values ?? {};
  const [mode, setMode] = useState<"invite" | "password">(mailEnabled ? "invite" : "password");
  const bad = (f: string) => state.fields?.includes(f) || undefined;
  const countries = new Intl.DisplayNames([locale], { type: "region" });
  const err = (f: string) => (bad(f) && state.error && state.error !== "validation" ? <p id={`err-${f}`} className={ui.error}>{t(`errors.${state.error}`)}</p> : null);

  return (
    <form action={action} className={cx(ui.card, "enter space-y-5")}>
      <input type="hidden" name="locale" value={locale} />
      {state.status === "error" && state.error && <p role="alert" className={cx(ui.notice, ui.noticeError)}>{t(`errors.${state.error}`)}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={ui.label}>{t("name")}</label>
          <input id="name" name="name" required minLength={2} maxLength={80} defaultValue={v.name} className={ui.input} aria-invalid={bad("name")} />
        </div>
        <div>
          <label htmlFor="slug" className={ui.label}>{t("slug")}</label>
          <input id="slug" name="slug" required pattern="[a-z0-9\-]{3,40}" maxLength={40} defaultValue={v.slug} autoCapitalize="none" spellCheck={false} className={cx(ui.input, "font-mono")} aria-invalid={bad("slug")} aria-describedby="err-slug" />
          {err("slug") ?? <p className={ui.hint}>{t("slugHint")}</p>}
        </div>
        <div>
          <label htmlFor="country" className={ui.label}>{t("country")}</label>
          <select id="country" name="country" defaultValue={v.country ?? "AR"} className={ui.input}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{countries.of(c) ?? c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="clubLocale" className={ui.label}>{t("locale")}</label>
          <select id="clubLocale" name="clubLocale" defaultValue={v.clubLocale ?? "es"} className={ui.input}>
            {CLUB_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="timezone" className={ui.label}>{t("timezone")}</label>
          <select id="timezone" name="timezone" defaultValue={v.timezone ?? TIMEZONES[0]} className={ui.input}>
            {TIMEZONES.map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
        <div>
          <label htmlFor="ownerName" className={ui.label}>{t("ownerName")}</label>
          <input id="ownerName" name="ownerName" required minLength={2} maxLength={80} defaultValue={v.ownerName} autoComplete="off" className={ui.input} aria-invalid={bad("ownerName")} />
        </div>
        <div>
          <label htmlFor="ownerEmail" className={ui.label}>{t("ownerEmail")}</label>
          <input id="ownerEmail" name="ownerEmail" type="email" required maxLength={254} defaultValue={v.ownerEmail} autoComplete="off" className={ui.input} aria-invalid={bad("ownerEmail")} aria-describedby="err-ownerEmail" />
          {err("ownerEmail")}
        </div>
        {mailEnabled && (
          <fieldset className="sm:col-span-2">
            <legend className={ui.label}>{t("ownerAccess")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["invite", "password"] as const).map((m) => (
                <label key={m} className="block">
                  <input type="radio" name="ownerMode" value={m} checked={mode === m} onChange={() => setMode(m)} className="peer sr-only" />
                  <span className="block cursor-pointer rounded-md border border-line-strong bg-surface-raised px-4 py-3 transition-colors hover:bg-surface-sunken peer-checked:border-2 peer-checked:border-brand peer-checked:bg-brand-tint peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                    <span className="block font-semibold">{t(m === "invite" ? "modeInvite" : "modePassword")}</span>
                    <span className="block text-sm text-ink-muted">{t(m === "invite" ? "modeInviteHint" : "modePasswordHint")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {mode === "password" && (
          <div className="sm:col-span-2">
            <label htmlFor="ownerPassword" className={ui.label}>{t("ownerPassword")}</label>
            <input id="ownerPassword" name="ownerPassword" type="password" required minLength={10} maxLength={200} autoComplete="new-password" className={ui.input} aria-invalid={bad("ownerPassword")} />
            <p className={ui.hint}>{t("ownerPasswordHint")}</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/admin" className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</Link>
        <button type="submit" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{pending ? t("submitting") : t("submit")}</button>
      </div>
    </form>
  );
}
