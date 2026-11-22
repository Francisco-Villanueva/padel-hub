"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { clearResultAction, recordResultAction, type TState } from "../actions";
import { ActionButton, useErrorText } from "./action-button";

const idle: TState = { status: "idle" };
type SetRow = [string, string];

/**
 * Diálogo para cargar o corregir el resultado de un partido: hasta 3 sets con los games de cada pareja. Pensado para completarse
 * rápido desde el celular. Se monta cuando se pide (así siempre arranca con el resultado actual) y se desmonta al cerrar.
 */
export function ResultDialog({ onClose, matchId, nameA, nameB, sets, played }: { onClose: () => void; matchId: string; nameA: string; nameB: string; sets: [number, number][] | null; played: boolean }) {
  const t = useTranslations("tournaments.result");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [rows, setRows] = useState<SetRow[]>(sets?.length ? sets.map(([a, b]) => [String(a), String(b)]) : [["", ""], ["", ""]]);
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await recordResultAction(prev, fd);
    if (res.status === "ok") onClose();
    return res;
  }, idle);

  const filled = rows.filter(([a, b]) => a !== "" || b !== "").map(([a, b]) => [Number(a), Number(b)]);
  const message = errorText(state);
  const set = (i: number, j: 0 | 1, v: string) => setRows((rs) => rs.map((r, k) => (k === i ? (j === 0 ? [v, r[1]] : [r[0], v]) : r)) as SetRow[]);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={`${nameA} vs ${nameB}`}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}><Icon name="x" />{tc("cancel")}</button>
          <button type="submit" form={`result-${matchId}`} disabled={pending || filled.length === 0} className={cx(ui.btn, ui.btnPrimary)}><Icon name="check" />{t("save")}</button>
        </>
      }
    >
      <form id={`result-${matchId}`} action={formAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={matchId} />
        <input type="hidden" name="sets" value={JSON.stringify(filled)} />
        <div className="grid grid-cols-[4rem_1fr_1fr] items-center gap-2 text-sm">
          <span />
          <span className="truncate font-semibold" title={nameA}>{nameA}</span>
          <span className="truncate font-semibold" title={nameB}>{nameB}</span>
          {rows.map((r, i) => (
            <div key={i} className="contents">
              <label htmlFor={`s${matchId}-${i}-a`} className="text-ink-muted">{t("set", { n: i + 1 })}</label>
              <input id={`s${matchId}-${i}-a`} inputMode="numeric" pattern="[0-9]*" maxLength={2} value={r[0]} onChange={(e) => set(i, 0, e.target.value.replace(/\D/g, ""))} aria-label={`${t("set", { n: i + 1 })} ${nameA}`} className={cx(ui.input, "text-center")} />
              <input inputMode="numeric" pattern="[0-9]*" maxLength={2} value={r[1]} onChange={(e) => set(i, 1, e.target.value.replace(/\D/g, ""))} aria-label={`${t("set", { n: i + 1 })} ${nameB}`} className={cx(ui.input, "text-center")} />
            </div>
          ))}
        </div>
        {rows.length < 3 && (
          <button type="button" onClick={() => setRows((rs) => [...rs, ["", ""]])} className={cx(ui.btnSm, ui.btnGhost)}><Icon name="plus" />{t("addSet")}</button>
        )}
        {message && <p role="alert" className={ui.error}>{message}</p>}
      </form>
      {played && (
        <div className="border-t border-line pt-3">
          <ActionButton action={clearResultAction} fields={{ id: matchId }} variant="danger" small icon="trash">{t("clear")}</ActionButton>
        </div>
      )}
    </Modal>
  );
}
