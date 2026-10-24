"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { cx, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { requestResetAction, type RecoveryState } from "./actions";

export function RequestForm({ available }: { available: boolean }) {
  const t = useTranslations("recovery");
  const locale = useLocale();
  const [state, action, pending] = useActionState(requestResetAction, { status: "idle" } as RecoveryState);
  const unavailable = !available || state.error === "unavailable";

  return (
    <div className={cx(ui.card, "space-y-4 sm:p-6")}>
      <div className="space-y-1.5">
        <h1 className="font-display text-3xl font-bold leading-tight">{unavailable ? t("unavailableTitle") : t("requestTitle")}</h1>
        <p className="text-ink-muted">{unavailable ? t("unavailableBody") : t("requestLead")}</p>
      </div>

      {!unavailable && (
        <form action={action} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <div>
            <label htmlFor="email" className={ui.label}>{t("email")}</label>
            <input id="email" name="email" type="email" required autoComplete="username" maxLength={254} autoFocus className={ui.input} />
          </div>
          {state.status === "error" && state.error && <p role="alert" className={cx(ui.notice, ui.noticeError)}>{t(state.error)}</p>}
          {state.status === "sent" && <p role="status" className={cx(ui.notice, ui.noticeOk)}>{t("sent")}</p>}
          <button type="submit" disabled={pending} className={cx(ui.btn, ui.btnPrimary, "w-full")}>{pending ? t("sending") : t("send")}</button>
        </form>
      )}

      <p className="text-center">
        <Link href="/login" className={cx(ui.link, "text-sm")}>{t("back")}</Link>
      </p>
    </div>
  );
}
