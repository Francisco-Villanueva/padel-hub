"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { setLiveAction, setScheduleAction, type TState } from "../actions";
import { ActionButton, useErrorText } from "./action-button";

const idle: TState = { status: "idle" };

/**
 * Herramientas de un partido para el club: cargar o cambiar el día y la hora, y marcar si se está jugando ahora.
 * `scheduled` son el día y la hora locales del club (ya convertidos en el servidor).
 */
export function MatchTools({
  matchId, label, scheduled, status, ready,
}: { matchId: string; label: string; scheduled: { date: string; time: string } | null; status: string; ready: boolean }) {
  const t = useTranslations("tournaments.schedule");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ScheduleButton matchId={matchId} label={label} scheduled={scheduled} />
      {ready && status === "pendiente" && (
        <ActionButton action={setLiveAction} fields={{ id: matchId, live: "1" }} variant="secondary" small>{t("startLive")}</ActionButton>
      )}
      {ready && status === "en_juego" && (
        <ActionButton action={setLiveAction} fields={{ id: matchId, live: "0" }} variant="ghost" small>{t("stopLive")}</ActionButton>
      )}
    </div>
  );
}

export function ScheduleButton({ matchId, label, scheduled }: { matchId: string; label: string; scheduled: { date: string; time: string } | null }) {
  const t = useTranslations("tournaments.schedule");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await setScheduleAction(prev, fd);
    if (res.status === "ok") setOpen(false);
    return res;
  }, idle);
  const message = errorText(state);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btnSm, ui.btnSecondary)}>{scheduled ? t("change") : t("set")}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("title")}
        description={label}
        actions={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
            <button type="submit" form={`schedule-${matchId}`} disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{t("save")}</button>
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
    </>
  );
}
