"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { setScheduleAction, type TState } from "../actions";
import { useErrorText } from "./action-button";

const idle: TState = { status: "idle" };

/**
 * Diálogo para cargar, cambiar o quitar el día y la hora de un partido. `scheduled` = día y hora locales del club
 * (ya convertidos en el servidor). Se monta cuando se pide y se desmonta al cerrar.
 */
export function ScheduleDialog({ onClose, matchId, label, scheduled }: { onClose: () => void; matchId: string; label: string; scheduled: { date: string; time: string } | null }) {
  const t = useTranslations("tournaments.schedule");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await setScheduleAction(prev, fd);
    if (res.status === "ok") onClose();
    return res;
  }, idle);
  const message = errorText(state);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={label}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}><Icon name="x" />{tc("cancel")}</button>
          <button type="submit" form={`schedule-${matchId}`} disabled={pending} className={cx(ui.btn, ui.btnPrimary)}><Icon name="check" />{t("save")}</button>
        </>
      }
    >
      <form id={`schedule-${matchId}`} action={formAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={matchId} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`sd-${matchId}`} className={ui.label}>{t("date")}</label>
            <input id={`sd-${matchId}`} name="date" type="date" defaultValue={scheduled?.date ?? ""} className={ui.input} />
          </div>
          <div>
            <label htmlFor={`st-${matchId}`} className={ui.label}>{t("time")}</label>
            <input id={`st-${matchId}`} name="time" type="time" step={900} defaultValue={scheduled?.time ?? ""} className={ui.input} />
          </div>
        </div>
        <p className={ui.hint}>{t("clearHint")}</p>
        {message && <p role="alert" className={ui.error}>{message}</p>}
      </form>
    </Modal>
  );
}
