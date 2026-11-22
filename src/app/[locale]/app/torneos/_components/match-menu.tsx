"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { MenuItem, Popover } from "@/components/popover";
import { cx, ui } from "@/components/ui";
import { setLiveAction, type TState } from "../actions";
import { useErrorText } from "./action-button";
import { SlotDialog, type Option } from "./adjust-dialogs";
import { ScheduleDialog } from "./match-tools";
import { ResultDialog } from "./result-button";

export interface SlotEditor { side: "a" | "b"; label: string; entries: Option[]; slots: Option[]; fixed: boolean; hasSource: boolean }
type Dlg = "result" | "schedule" | "slot-a" | "slot-b" | null;

/**
 * Acciones de un partido para el club. Una sola acción primaria a la vista (la que toca ahora: comenzar el partido o cargar su
 * resultado) y el resto en un menú de tres puntos: cargar o editar el resultado, cambiar el horario, sacarlo de juego y, en la
 * primera ronda de la llave, editar los lugares. Los diálogos viven acá (afuera del menú) y se abren desde él.
 */
export function MatchMenu({
  matchId, nameA, nameB, sets, status, ready, scheduled, slotEditors = [], compact,
}: {
  matchId: string; nameA: string; nameB: string; sets: [number, number][] | null; status: "pendiente" | "en_juego" | "jugado";
  ready: boolean; scheduled: { date: string; time: string } | null; slotEditors?: SlotEditor[];
  /** Acción primaria solo con el ícono (para tarjetas angostas, como las del cuadro de cruces). */
  compact?: boolean;
}) {
  const t = useTranslations("tournaments");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = `${nameA} vs ${nameB}`;

  const setLive = (live: boolean) => start(async () => {
    const fd = new FormData();
    fd.set("locale", locale); fd.set("id", matchId); fd.set("live", live ? "1" : "0");
    const res: TState = await setLiveAction({ status: "idle" }, fd);
    if (res.status === "error") setError(errorText(res));
  });

  const primary = ready && status === "pendiente" ? "start" : ready && status === "en_juego" ? "result" : null;
  const slot = (side: "a" | "b") => slotEditors.find((s) => s.side === side);

  return (
    <div className="flex items-center gap-1">
      {primary === "start" && (
        <button type="button" disabled={pending} onClick={() => setLive(true)} aria-label={t("schedule.startLive")} title={t("schedule.startLive")} className={cx(compact ? "inline-flex size-9 items-center justify-center rounded-md text-sm font-semibold transition-colors disabled:opacity-60" : ui.btnSm, ui.btnPrimary)}><Icon name="play" />{!compact && t("schedule.startLive")}</button>
      )}
      {primary === "result" && (
        <button type="button" onClick={() => setDlg("result")} aria-label={t("result.load")} title={t("result.load")} className={cx(compact ? "inline-flex size-9 items-center justify-center rounded-md text-sm font-semibold transition-colors" : ui.btnSm, ui.btnPrimary)}><Icon name="scoreboard" />{!compact && t("result.load")}</button>
      )}
      <Popover label={t("menu.matchActions")}>
        {(close) => (
          <>
            {ready && primary !== "result" && (
              <MenuItem icon="scoreboard" onSelect={() => { close(); setDlg("result"); }}>{status === "jugado" ? t("result.editFull") : t("result.load")}</MenuItem>
            )}
            {ready && status === "en_juego" && <MenuItem icon="stop" onSelect={() => { close(); setLive(false); }}>{t("schedule.stopLive")}</MenuItem>}
            <MenuItem icon="calendar" onSelect={() => { close(); setDlg("schedule"); }}>{scheduled ? t("schedule.change") : t("schedule.set")}</MenuItem>
            {(["a", "b"] as const).map((s) => slot(s) && (
              <MenuItem key={s} icon="pencilLine" onSelect={() => { close(); setDlg(s === "a" ? "slot-a" : "slot-b"); }}>{t("adjust.editSlot", { label: slot(s)!.label })}</MenuItem>
            ))}
          </>
        )}
      </Popover>

      {dlg === "result" && <ResultDialog onClose={() => setDlg(null)} matchId={matchId} nameA={nameA} nameB={nameB} sets={sets} played={status === "jugado"} />}
      {dlg === "schedule" && <ScheduleDialog onClose={() => setDlg(null)} matchId={matchId} label={label} scheduled={scheduled} />}
      {(dlg === "slot-a" || dlg === "slot-b") && slot(dlg === "slot-a" ? "a" : "b") && (() => {
        const s = slot(dlg === "slot-a" ? "a" : "b")!;
        return <SlotDialog onClose={() => setDlg(null)} matchId={matchId} side={s.side} label={s.label} entries={s.entries} slots={s.slots} fixed={s.fixed} hasSource={s.hasSource} />;
      })()}
      {error && (
        <Modal open onClose={() => setError(null)} title={t("errors.generic")} description={error} actions={<button type="button" onClick={() => setError(null)} className={cx(ui.btn, ui.btnSecondary)}><Icon name="x" />{tc("close")}</button>} />
      )}
    </div>
  );
}
