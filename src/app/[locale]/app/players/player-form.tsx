"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { ChoiceChip } from "@/components/choice-chip";
import { cx, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { GENDERS, POSITIONS, SLOTS } from "@/lib/player-schema";
import type { FormState } from "./actions";

export type PlayerFormValues = {
  firstName: string; lastName: string; gender: string; category: string; position: string;
  slots: string[]; phone: string; instagram: string; locality: string; notes: string;
};
export const EMPTY_PLAYER: PlayerFormValues = {
  firstName: "", lastName: "", gender: "", category: "", position: "", slots: [], phone: "", instagram: "", locality: "", notes: "",
};

type Option = { id: string; label: string };
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function PlayerForm({
  mode, action, categories, initial = EMPTY_PLAYER, playerId,
}: { mode: "create" | "edit"; action: Action; categories: Option[]; initial?: PlayerFormValues; playerId?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as FormState);

  // Tras un error se conserva lo que escribió la persona.
  const v = { ...initial, ...(state.values as Partial<PlayerFormValues> | undefined) };
  const bad = (f: string) => state.fields?.includes(f);
  const invalid = (f: string) => ({ "aria-invalid": bad(f) || undefined, "aria-describedby": bad(f) ? `err-${f}` : undefined });
  const fieldError = (f: string) => bad(f) && state.error && state.error !== "validation"
    ? <p id={`err-${f}`} className={ui.error}>{t(`players.errors.${state.error}`)}</p> : null;
  const req = <span aria-hidden className="text-danger"> *</span>;

  return (
    <form action={formAction} className="space-y-6" noValidate={false}>
      <input type="hidden" name="locale" value={locale} />
      {playerId && <input type="hidden" name="id" value={playerId} />}

      {state.status === "error" && state.error && (
        <p role="alert" className={cx(ui.notice, ui.noticeError, "enter")}>
          {t(`players.errors.${state.error}`)}
        </p>
      )}
      {state.status === "ok" && (
        <p role="status" className={cx(ui.notice, ui.noticeOk, "enter")}>
          {t("players.saved")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className={ui.label}>{t("players.form.firstName")}{req}</label>
          <input id="firstName" name="firstName" required maxLength={80} autoComplete="off" defaultValue={v.firstName} className={ui.input} {...invalid("firstName")} />
        </div>
        <div>
          <label htmlFor="lastName" className={ui.label}>{t("players.form.lastName")}{req}</label>
          <input id="lastName" name="lastName" required maxLength={80} autoComplete="off" defaultValue={v.lastName} className={ui.input} {...invalid("lastName")} />
        </div>

        <fieldset>
          <legend className={ui.label}>{t("players.form.gender")}{req}</legend>
          <div className="grid grid-cols-2 gap-2">
            {GENDERS.map((g, i) => (
              <ChoiceChip key={g} type="radio" name="gender" value={g} defaultChecked={v.gender === g} required={i === 0}>{t(`gender.${g}`)}</ChoiceChip>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="category" className={ui.label}>{t("players.form.category")}</label>
          <select id="category" name="category" defaultValue={v.category} className={ui.input} {...invalid("category")}>
            <option value="">{t("players.form.select")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {fieldError("category")}
        </div>

        <div>
          <label htmlFor="position" className={ui.label}>{t("players.form.position")}</label>
          <select id="position" name="position" defaultValue={v.position} className={ui.input}>
            <option value="">{t("players.form.select")}</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{t(`position.${p}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="phone" className={ui.label}>{t("players.form.phone")}{req}</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" required maxLength={40} autoComplete="off" defaultValue={v.phone} className={ui.input} {...invalid("phone")} />
          {fieldError("phone") ?? <p className={ui.hint}>{t("players.form.phoneHint")}</p>}
        </div>

        <fieldset className="sm:col-span-2">
          <legend className={ui.label}>{t("players.form.slots")}</legend>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {SLOTS.map((s) => (
              <ChoiceChip key={s} type="checkbox" name="slots" value={s} defaultChecked={v.slots.includes(s)}>{t(`slot.${s}`)}</ChoiceChip>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="instagram" className={ui.label}>{t("players.form.instagram")}</label>
          <input id="instagram" name="instagram" maxLength={120} autoComplete="off" autoCapitalize="none" defaultValue={v.instagram} className={ui.input} {...invalid("instagram")} />
          <p className={ui.hint}>{t("players.form.instagramHint")}</p>
        </div>
        <div>
          <label htmlFor="locality" className={ui.label}>{t("players.form.locality")}</label>
          <input id="locality" name="locality" maxLength={80} autoComplete="off" defaultValue={v.locality} className={ui.input} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className={ui.label}>{t("players.form.notes")}</label>
          <textarea id="notes" name="notes" rows={3} maxLength={500} defaultValue={v.notes} className={ui.input} />
          <p className={ui.hint}>{t("players.form.notesHint")}</p>
        </div>

        {mode === "create" && (
          <div className="sm:col-span-2">
            <label className={cx("flex cursor-pointer items-start gap-3 rounded-md border p-3.5 text-sm text-ink-muted transition-colors hover:bg-surface-sunken/60", bad("consent") ? "border-danger" : "border-line-strong")}>
              <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
              <span>
                {t("players.form.consent")}
                <span className="mt-1 block text-ink-muted">{t("players.form.consentHint")}</span>
              </span>
            </label>
          </div>
        )}
      </div>

      {/* En celular los botones quedan fijos abajo para no perderlos en un formulario largo. */}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Link href="/app/players" className={cx(ui.btn, ui.btnSecondary, "basis-1/3 sm:basis-auto")}>{t("players.form.cancel")}</Link>
        <button type="submit" disabled={pending} className={cx(ui.btn, ui.btnPrimary, "flex-1 sm:flex-none")}>
          {pending ? t("players.form.saving") : mode === "create" ? t("players.form.create") : t("players.form.save")}
        </button>
      </div>
    </form>
  );
}
