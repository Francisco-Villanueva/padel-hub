"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { ChoiceChip } from "@/components/choice-chip";
import { cx, ui } from "@/components/ui";
import { GENDERS, POSITIONS, SLOTS } from "@/lib/player-schema";
import { submitSignupAction, type SignupState } from "./actions";

type Option = { id: string; label: string };
type Props = { slug: string; token: string; clubName: string; country: string; categories: Option[]; kiosk: boolean };

/** Tras guardar, la tablet vuelve sola al formulario vacío para la persona que sigue. */
const KIOSK_RESET_MS = 7000;

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export function SignupFlow(props: Props) {
  // Cambiar la `key` monta un formulario nuevo: es la forma de "empezar de cero" sin tocar el estado de la acción.
  const [round, setRound] = useState(0);
  return <SignupForm key={round} {...props} onRestart={() => setRound((r) => r + 1)} />;
}

function SignupForm({ slug, token, clubName, country, categories, kiosk, onRestart }: Props & { onRestart: () => void }) {
  const t = useTranslations("signup");
  const tc = useTranslations();
  const locale = useLocale();
  const [state, action, pending] = useActionState(submitSignupAction, { status: "idle" } as SignupState);
  // Momento en que se mostró el formulario (lo lee el servidor para detectar envíos instantáneos). Sin JS queda en 0 y no se evalúa.
  const startedAt = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (startedAt.current) startedAt.current.value = String(Date.now());
  }, []);

  const done = state.status === "ok" || state.status === "exists";
  useEffect(() => {
    if (!kiosk || !done) return;
    const id = window.setTimeout(onRestart, KIOSK_RESET_MS);
    return () => window.clearTimeout(id);
  }, [kiosk, done, onRestart]);

  if (state.status === "ok") {
    return (
      <div role="status" className="enter flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
        <span className="flex size-24 items-center justify-center rounded-full bg-brand text-on-brand">
          <svg aria-hidden viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
        </span>
        <h2 className="font-display text-5xl font-bold leading-none">{t("doneTitle", { name: state.name ?? "" })}</h2>
        <p className="max-w-sm text-ink-muted">{t("doneBody", { club: clubName })}</p>
        <button type="button" onClick={onRestart} className={cx(ui.btn, ui.btnSecondary, kiosk && "min-h-12")}>{t("another")}</button>
      </div>
    );
  }

  if (state.status === "exists") {
    return (
      <div role="status" className="enter flex flex-1 flex-col justify-center gap-5 py-10">
        <div className={cx(ui.notice, ui.noticeWarning, "flex items-start gap-3")}>
          <Icon><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></Icon>
          <div>
            <p className="font-semibold">{t("existsTitle")}</p>
            <p className="font-normal">{t("existsBody", { club: clubName })}</p>
          </div>
        </div>
        <p className="text-ink-muted">{t("existsHelp")}</p>
        <button type="button" onClick={onRestart} className={cx(ui.btn, ui.btnSecondary)}>{t("another")}</button>
      </div>
    );
  }

  const v = (state.values ?? {}) as Record<string, string | string[]>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const slots = Array.isArray(v.slots) ? (v.slots as string[]) : [];
  const bad = (f: string) => state.fields?.includes(f);
  const invalid = (f: string) => ({ "aria-invalid": bad(f) || undefined, "aria-describedby": bad(f) ? `err-${f}` : undefined });
  const fieldError = (f: string) =>
    bad(f) && state.error && state.error !== "validation" ? <p id={`err-${f}`} className={ui.error}>{t(`errors.${state.error}`)}</p> : null;
  const req = <span aria-hidden className="text-danger"> *</span>;
  const opt = <span className="font-normal text-ink-muted"> {t("optional")}</span>;
  const lg = kiosk ? "min-h-12 text-base sm:min-h-12 sm:text-base" : "";

  return (
    <form action={action} className="flex flex-1 flex-col gap-5" aria-describedby={state.status === "error" ? "form-error" : undefined}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <input ref={startedAt} type="hidden" name="startedAt" defaultValue="0" />
      {/* Campo trampa: invisible para personas y lectores de pantalla; un bot que lo completa se descarta. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.status === "error" && state.error && (
        <p id="form-error" role="alert" className={cx(ui.notice, ui.noticeError, "enter flex items-start gap-3")}>
          <Icon><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></Icon>
          {t(`errors.${state.error}`)}
        </p>
      )}

      <div className={cx("grid grid-cols-1 gap-5", kiosk && "md:grid-cols-2")}>
        <div>
          <label htmlFor="firstName" className={ui.label}>{tc("players.form.firstName")}{req}</label>
          <input id="firstName" name="firstName" required maxLength={80} autoComplete="given-name" defaultValue={str("firstName")} className={cx(ui.input, lg)} {...invalid("firstName")} />
        </div>
        <div>
          <label htmlFor="lastName" className={ui.label}>{tc("players.form.lastName")}{req}</label>
          <input id="lastName" name="lastName" required maxLength={80} autoComplete="family-name" defaultValue={str("lastName")} className={cx(ui.input, lg)} {...invalid("lastName")} />
        </div>
        <div>
          <label htmlFor="phone" className={ui.label}>{t("whatsapp")}{req}</label>
          <input
            id="phone" name="phone" type="tel" inputMode="tel" required maxLength={40} autoComplete="tel"
            placeholder={country === "AR" ? "+54 9 341 555 0100" : undefined} defaultValue={str("phone")} className={cx(ui.input, lg)} {...invalid("phone")}
          />
          {fieldError("phone") ?? <p className={ui.hint}>{t("whatsappHint")}</p>}
        </div>
        <div>
          <label htmlFor="locality" className={ui.label}>{t("locality")}{opt}</label>
          <input id="locality" name="locality" maxLength={80} autoComplete="address-level2" defaultValue={str("locality")} className={cx(ui.input, lg)} />
        </div>
        <div>
          <label htmlFor="category" className={ui.label}>{t("category")}{req}</label>
          <select id="category" name="category" required defaultValue={str("category")} className={cx(ui.input, lg)} {...invalid("category")}>
            <option value="">{t("categoryPlaceholder")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {fieldError("category")}
        </div>
        <fieldset>
          <legend className={ui.label}>{tc("players.form.gender")}{req}</legend>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g, i) => (
              <ChoiceChip key={g} type="radio" name="gender" value={g} defaultChecked={str("gender") === g} required={i === 0} large={kiosk}>{tc(`gender.${g}`)}</ChoiceChip>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className={ui.label}>{tc("players.form.position")}{opt}</legend>
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => <ChoiceChip key={p} type="radio" name="position" value={p} defaultChecked={str("position") === p} large={kiosk}>{tc(`position.${p}`)}</ChoiceChip>)}
        </div>
      </fieldset>

      <fieldset>
        <legend className={ui.label}>{t("slots")}</legend>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((s) => <ChoiceChip key={s} type="checkbox" name="slots" value={s} defaultChecked={slots.includes(s)} large={kiosk}>{tc(`slot.${s}`)}</ChoiceChip>)}
        </div>
      </fieldset>

      {!kiosk && (
        <div>
          <label htmlFor="instagram" className={ui.label}>{t("instagram")}{opt}</label>
          <input id="instagram" name="instagram" maxLength={120} autoComplete="off" autoCapitalize="none" placeholder="usuario" defaultValue={str("instagram")} className={ui.input} {...invalid("instagram")} />
          <p className={ui.hint}>{t("instagramHint")}</p>
        </div>
      )}

      <div>
        <label className={cx("flex cursor-pointer items-start gap-3 text-sm", bad("consent") && "text-danger")}>
          <input type="checkbox" name="consent" required className="mt-0.5 size-6 shrink-0 accent-[var(--brand)]" {...invalid("consent")} />
          <span>{t("consent", { club: clubName })}</span>
        </label>
        <details className="mt-2 pl-9 text-sm text-ink-muted">
          <summary className="cursor-pointer font-semibold text-brand underline-offset-4 hover:underline">{t("consentMore")}</summary>
          <div className="mt-2 space-y-2">
            {t("consentInfo", { club: clubName }).split("\n").map((p) => <p key={p}>{p}</p>)}
            {country === "AR" && <p>{t("consentInfoAr")}</p>}
          </div>
        </details>
        {bad("consent") && <p id="err-consent" className={cx(ui.error, "pl-9")}>{t("errors.consent_required")}</p>}
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        {kiosk ? <p className={cx(ui.badgeInfo, "self-start")}>{t("restartHint")}</p> : <p className="order-2 text-center text-xs text-ink-muted sm:order-1 sm:text-left">{t("protected")}</p>}
        <button type="submit" disabled={pending} className={cx(ui.btn, ui.btnPrimary, "min-h-12 w-full sm:order-2", kiosk && "sm:w-auto sm:min-w-40")}>
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
    </form>
  );
}
