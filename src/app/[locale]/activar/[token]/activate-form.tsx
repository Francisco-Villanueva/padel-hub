"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ClubMark } from "@/components/club-mark";
import { PasswordFields } from "@/components/password-fields";
import { cx, ui } from "@/components/ui";
import { activateAction, type ActivateState } from "../actions";

export function ActivateForm({ token, name, clubName, role }: { token: string; name: string; clubName: string; role: "owner" | "staff" }) {
  const t = useTranslations("activate");
  const tRole = useTranslations("email.role");
  const locale = useLocale();
  const [state, action, pending] = useActionState(activateAction, { status: "idle" } as ActivateState);
  const [valid, setValid] = useState(false);

  return (
    <form action={action} className={cx(ui.card, "space-y-4 sm:p-6")}>
      <h1 className="font-display text-3xl font-bold leading-tight">{t("title")}</h1>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />

      <div className="flex items-center gap-3">
        <ClubMark name={clubName} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">{clubName}</p>
          <p className="text-sm text-ink-muted">{t("invitedAs", { role: tRole(role) })}</p>
        </div>
      </div>

      <div>
        <label htmlFor="name" className={ui.label}>{t("name")}</label>
        <input id="name" name="name" defaultValue={name} required minLength={1} maxLength={80} autoComplete="name" className={ui.input} />
      </div>

      <PasswordFields
        onValidChange={setValid}
        labels={{ password: t("password"), repeat: t("repeat"), ruleLength: t("ruleLength"), ruleMatch: t("ruleMatch"), mismatch: t("mismatch") }}
      />

      {state.status === "error" && state.error && <p role="alert" className={cx(ui.notice, ui.noticeError)}>{t(state.error)}</p>}
      <button type="submit" disabled={pending || !valid} className={cx(ui.btn, ui.btnPrimary, "w-full")}>{pending ? t("submitting") : t("submit")}</button>
      <p className="text-xs text-ink-muted">{t("expiry")}</p>
    </form>
  );
}
