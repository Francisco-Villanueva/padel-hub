"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { initials } from "@/components/avatar";
import { LocaleChips } from "@/components/locale-chips";
import { Logo } from "@/components/logo";
import { cx, ui } from "@/components/ui";

type Club = { clubId: string; name: string; role: string };

// Cancha en líneas gruesas color pelota, anclada abajo a la derecha del panel verde.
function CourtLines() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 262"
      className="pointer-events-none absolute -right-6 bottom-12 hidden h-64 w-auto text-ball xl:block"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
    >
      <rect x="2" y="2" width="296" height="258" />
      <path d="M2 131h296M100 2v258M200 2v258" />
    </svg>
  );
}

function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className={cx(ui.notice, ui.noticeError, "enter flex items-start gap-3 border border-danger")}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      {children}
    </p>
  );
}

export function LoginScreen({ next, expired }: { next: string; expired?: boolean }) {
  const t = useTranslations("auth");
  const tApp = useTranslations("app");
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [picked, setPicked] = useState<string>("");

  async function submit(email: string, password: string, clubId?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, clubId, locale }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.status === "choose_club") {
        setCreds({ email, password });
        setClubs(body.clubs);
        setPicked(body.clubs[0]?.clubId ?? "");
      } else if (res.ok && body.status === "ok") {
        // Si venía de una página protegida, vuelve ahí; si no, a su inicio.
        window.location.assign(next || body.redirect);
      } else {
        setError(t(`errors.${body.error ?? "generic"}`));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  // Elegir club (pantalla 07): tarjeta centrada, una opción por club.
  if (clubs && creds) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
        <Logo alt={tApp("name")} className="h-9" />
        <form
          className={cx(ui.card, "enter w-full max-w-lg space-y-4 sm:p-6")}
          onSubmit={(e) => {
            e.preventDefault();
            submit(creds.email, creds.password, picked);
          }}
        >
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold leading-tight">{t("chooseClub")}</h1>
            <p className="text-sm text-ink-muted">{t("chooseClubSubtitle")}</p>
          </div>
          <fieldset className="space-y-2.5">
            <legend className="sr-only">{t("chooseClub")}</legend>
            {clubs.map((c) => (
              <label key={c.clubId} className="block">
                <input type="radio" name="club" value={c.clubId} checked={picked === c.clubId} onChange={() => setPicked(c.clubId)} className="peer sr-only" />
                <span className="flex min-h-16 cursor-pointer items-center gap-3 rounded-md border border-line-strong bg-surface-raised px-4 py-3 transition-colors hover:bg-surface-sunken peer-checked:border-2 peer-checked:border-brand peer-checked:bg-brand-tint peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                  <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-surface-raised">
                    {picked === c.clubId && <span className="size-2.5 rounded-full bg-brand" />}
                  </span>
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-on-brand">{initials(c.name)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block text-sm text-ink-muted">{t(`role.${c.role}`)}</span>
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && <ErrorAlert>{error}</ErrorAlert>}
          <button disabled={busy || !picked} className={cx(ui.btn, ui.btnPrimary, "w-full")}>{busy ? t("entering") : t("enter")}</button>
        </form>
        <p className="text-xs text-ink-muted">{tApp("poweredBy")}</p>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[3fr_2fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-on-brand lg:flex">
        <Logo variant="horizontal-on-brand" alt={tApp("name")} className="h-12" />
        <CourtLines />
        <div className="relative max-w-md space-y-3">
          <h2 className="font-display text-6xl font-bold leading-[0.95]">{t("heroTitle")}</h2>
          <p>{t("heroBody")}</p>
        </div>
      </aside>

      <section className="flex flex-col justify-center gap-8 px-4 py-10 sm:px-12 lg:px-16">
        <Logo alt={tApp("name")} className="h-8 lg:hidden" />
        <div className="enter w-full max-w-md space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-bold leading-tight">{t("heading")}</h1>
            <p className="text-ink-muted">{t("subtitle")}</p>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              submit(String(f.get("email")), String(f.get("password")));
            }}
          >
            {expired && !error && (
              <p role="status" className={cx(ui.notice, ui.noticeInfo, "border border-info")}>{t("expired")}</p>
            )}
            {error && <ErrorAlert>{error}</ErrorAlert>}
            <div>
              <label htmlFor="email" className={ui.label}>{t("email")}</label>
              <input id="email" name="email" type="email" required autoComplete="username" maxLength={254} className={ui.input} />
            </div>
            <div>
              <label htmlFor="password" className={ui.label}>{t("password")}</label>
              <input id="password" name="password" type="password" required autoComplete="current-password" maxLength={200} className={ui.input} />
            </div>
            <button disabled={busy} className={cx(ui.btn, ui.btnPrimary, "mt-1 w-full")}>{busy ? t("entering") : t("enter")}</button>
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
