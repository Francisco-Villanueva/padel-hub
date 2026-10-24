"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { PasswordFields } from "@/components/password-fields";
import { cx, ui } from "@/components/ui";
import { completeResetAction, type RecoveryState } from "../actions";

export function SetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("recovery");
  const locale = useLocale();
  const [state, action, pending] = useActionState(completeResetAction, { status: "idle" } as RecoveryState);
  const [valid, setValid] = useState(false);

  return (
    <form action={action} className={cx(ui.card, "space-y-4 sm:p-6")}>
      <h1 className="font-display text-3xl font-bold leading-tight">{t("newTitle")}</h1>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <PasswordFields
        autoFocus
        onValidChange={setValid}
        labels={{ password: t("password"), repeat: t("repeat"), ruleLength: t("ruleLength"), ruleMatch: t("ruleMatch"), mismatch: t("mismatch") }}
      />
      {state.status === "error" && state.error && <p role="alert" className={cx(ui.notice, ui.noticeError)}>{t(state.error)}</p>}
      <button type="submit" disabled={pending || !valid} className={cx(ui.btn, ui.btnPrimary, "w-full")}>{pending ? t("saving") : t("save")}</button>
    </form>
  );
}
