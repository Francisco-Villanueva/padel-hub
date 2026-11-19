"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LocaleChips } from "@/components/locale-chips";
import { Logo } from "@/components/logo";
import { NewPasswordFields } from "@/components/password-input";
import { cx, ui } from "@/components/ui";
import { COUNTRIES, slugify } from "@/lib/club-schema";

export function RegisterScreen() {
  const t = useTranslations("register");
  const tApp = useTranslations("app");
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Mientras no toque el identificador, sigue al nombre del club.
  const [slugTouched, setSlugTouched] = useState(false);
  const countries = new Intl.DisplayNames([locale], { type: "region" });
  const bad = (f: string) => fields.includes(f) || undefined;

  async function submit(f: FormData) {
    setBusy(true);
    setError(null);
    setFields([]);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, slug, locale,
          country: f.get("country"), ownerName: f.get("ownerName"), ownerEmail: f.get("ownerEmail"), ownerPassword: f.get("ownerPassword"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.status === "ok") {
        window.location.assign(body.redirect);
        return;
      }
      setError(t(`errors.${body.error ?? "generic"}`));
      if (body.error === "slug_taken") setFields(["slug"]);
      else if (body.error === "email_taken") setFields(["ownerEmail"]);
      else if (Array.isArray(body.fields)) setFields(body.fields.map((x: string) => (x === "ownerEmail" ? "ownerEmail" : x)));
    } catch {
      setError(t("errors.generic"));
    }
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[2fr_3fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-on-brand lg:flex">
        <Logo variant="horizontal-on-brand" alt={tApp("name")} className="h-12" />
        <div className="relative max-w-md space-y-3">
          <h2 className="font-display text-6xl font-bold leading-[0.95]">{t("heroTitle")}</h2>
          <p>{t("heroBody")}</p>
        </div>
      </aside>

      <section className="flex flex-col justify-center gap-8 px-4 py-10 sm:px-12 lg:px-16">
        <a href={`/${locale}`} className="w-fit rounded-md lg:hidden"><Logo alt={tApp("name")} className="h-8" /></a>
        <div className="enter w-full max-w-xl space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-bold leading-tight">{t("heading")}</h1>
            <p className="text-ink-muted">{t("subtitle")}</p>
          </div>
          <form method="post" className="space-y-5" onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
            {error && <p role="alert" className={cx(ui.notice, ui.noticeError, "border border-danger")}>{error}</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className={ui.label}>{t("clubName")}</label>
                <input
                  id="name" required minLength={2} maxLength={80} autoComplete="organization" value={name} className={ui.input} aria-invalid={bad("name")}
                  onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
                />
              </div>
              <div>
                <label htmlFor="country" className={ui.label}>{t("country")}</label>
                <select id="country" name="country" defaultValue="AR" className={ui.input}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{countries.of(c) ?? c}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="slug" className={ui.label}>{t("slug")}</label>
                <input
                  id="slug" required pattern="[a-z0-9\-]{3,40}" maxLength={40} autoCapitalize="none" spellCheck={false} value={slug}
                  className={cx(ui.input, "font-mono")} aria-invalid={bad("slug")}
                  onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
                />
                <p className={ui.hint}>{t("slugHint")}</p>
              </div>
            </div>

            <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
              <div>
                <label htmlFor="ownerName" className={ui.label}>{t("ownerName")}</label>
                <input id="ownerName" name="ownerName" required minLength={2} maxLength={80} autoComplete="name" className={ui.input} aria-invalid={bad("ownerName")} />
              </div>
              <div>
                <label htmlFor="ownerEmail" className={ui.label}>{t("ownerEmail")}</label>
                <input id="ownerEmail" name="ownerEmail" type="email" required maxLength={254} autoComplete="email" className={ui.input} aria-invalid={bad("ownerEmail")} />
              </div>
              <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                <NewPasswordFields id="ownerPassword" name="ownerPassword" label={t("password")} hint={t("passwordHint")} invalid={!!bad("ownerPassword")} />
              </div>
            </div>

            <button disabled={busy} className={cx(ui.btn, ui.btnPrimary, "w-full")}>{busy ? t("submitting") : t("submit")}</button>
            <p className="text-center text-sm text-ink-muted">
              {t("haveAccount")} <a href={`/${locale}/login`} className={ui.link}>{t("login")}</a>
            </p>
          </form>
          <div className="flex items-center justify-between gap-4">
            <LocaleChips />
            <p className="text-xs text-ink-muted">{tApp("poweredBy")}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
