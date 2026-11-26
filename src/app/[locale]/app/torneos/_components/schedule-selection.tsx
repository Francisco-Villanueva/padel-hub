"use client";

import { useLocale, useTranslations } from "next-intl";
import { createContext, useActionState, useContext, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { setScheduleBulkAction, type TState } from "../actions";
import { useErrorText } from "./action-button";

const idle: TState = { status: "idle" };

interface Ctx {
  active: boolean;
  selected: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
}
const SelectionContext = createContext<Ctx | null>(null);

/**
 * Modo "programar varios": el club elige los partidos que comparten día y hora (los que se juegan en simultáneo) y les pone el
 * horario de una sola vez. Envuelve el tablero; las casillas de cada partido y de cada día se dibujan adentro (MatchCheck, GroupCheck).
 * `all` son los partidos que se pueden elegir y `unscheduled` los que todavía no tienen horario.
 */
export function ScheduleSelection({ all, unscheduled, children }: { all: string[]; unscheduled: string[]; children: React.ReactNode }) {
  const t = useTranslations("tournaments.bulk");
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const ctx = useMemo<Ctx>(() => ({
    active,
    selected,
    toggle: (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    setMany: (ids, on) => setSelected((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; }),
  }), [active, selected]);

  const exit = () => { setActive(false); setSelected(new Set()); setOpen(false); };

  return (
    <SelectionContext.Provider value={ctx}>
      <div className="flex justify-end">
        {!active && (
          <button type="button" onClick={() => setActive(true)} className={cx(ui.btn, ui.btnSecondary, "w-full sm:w-auto")}><Icon name="calendar" />{t("start")}</button>
        )}
      </div>
      {children}
      {active && (
        <div role="region" aria-label={t("barLabel")} className="sticky bottom-3 z-30 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-raised p-3 shadow-card">
          <p className="mr-auto min-w-0 text-sm font-semibold" aria-live="polite">
            {selected.size === 0 ? t("none") : t("selected", { count: selected.size })}
          </p>
          <button type="button" onClick={() => setSelected(new Set(unscheduled))} disabled={unscheduled.length === 0} className={cx(ui.btnSm, ui.btnGhost)}>{t("pickUnscheduled", { count: unscheduled.length })}</button>
          <button type="button" onClick={() => setSelected(new Set(all))} className={cx(ui.btnSm, ui.btnGhost)}>{t("pickAll")}</button>
          <button type="button" onClick={exit} className={cx(ui.btnSm, ui.btnSecondary)}><Icon name="x" />{t("exit")}</button>
          <button type="button" onClick={() => setOpen(true)} disabled={selected.size === 0} className={cx(ui.btn, ui.btnPrimary)}><Icon name="clock" />{t("setTime")}</button>
        </div>
      )}
      {open && <BulkDialog ids={[...selected]} onClose={() => setOpen(false)} onDone={exit} />}
    </SelectionContext.Provider>
  );
}

/** Casilla de un partido (solo se ve en modo "programar varios"). */
export function MatchCheck({ id, label }: { id: string; label: string }) {
  const c = useContext(SelectionContext);
  const t = useTranslations("tournaments.bulk");
  if (!c?.active) return null;
  return (
    <input
      type="checkbox" checked={c.selected.has(id)} onChange={() => c.toggle(id)} aria-label={t("pick", { label })}
      className="size-5 shrink-0 cursor-pointer accent-[var(--brand)]"
    />
  );
}

/** Casilla para elegir o soltar todos los partidos de un grupo (por ejemplo, de un día). */
export function GroupCheck({ ids, label }: { ids: string[]; label: string }) {
  const c = useContext(SelectionContext);
  const t = useTranslations("tournaments.bulk");
  if (!c?.active || ids.length === 0) return null;
  const all = ids.every((i) => c.selected.has(i));
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={all} onChange={() => c.setMany(ids, !all)} aria-label={t("pickGroup", { label })} className="size-5 cursor-pointer accent-[var(--brand)]" />
      {t("pickGroupShort")}
    </label>
  );
}

function BulkDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("tournaments.bulk");
  const ts = useTranslations("tournaments.schedule");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await setScheduleBulkAction(prev, fd);
    if (res.status === "ok") onDone();
    return res;
  }, idle);
  const message = errorText(state);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("dialogTitle", { count: ids.length })}
      description={t("dialogBody")}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}><Icon name="x" />{tc("cancel")}</button>
          <button type="submit" form="bulk-schedule" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}><Icon name="check" />{ts("save")}</button>
        </>
      }
    >
      <form id="bulk-schedule" action={formAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="bulk-date" className={ui.label}>{ts("date")}</label>
            <input id="bulk-date" name="date" type="date" autoFocus className={ui.input} />
          </div>
          <div>
            <label htmlFor="bulk-time" className={ui.label}>{ts("time")}</label>
            <input id="bulk-time" name="time" type="time" step={900} className={ui.input} />
          </div>
        </div>
        <p className={ui.hint}>{ts("clearHint")}</p>
        {message && <p role="alert" className={ui.error}>{message}</p>}
      </form>
    </Modal>
  );
}
