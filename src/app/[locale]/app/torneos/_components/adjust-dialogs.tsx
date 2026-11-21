"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { replacePlayerAction, restoreSlotAction, setSlotEntryAction, swapSlotsAction, swapZoneEntriesAction, type TState } from "../actions";
import { useErrorText } from "./action-button";

const idle: TState = { status: "idle" };
export interface Option { value: string; label: string }

type Act = (prev: TState, fd: FormData) => Promise<TState>;

/** Formulario de un diálogo: campos ocultos + un selector. Cierra el diálogo si la acción sale bien. */
function SelectForm({
  id, action, fields, name, label, options, blank, submit, onDone,
}: { id: string; action: Act; fields: Record<string, string>; name: string; label: string; options: Option[]; blank?: string; submit: string; onDone: () => void }) {
  const locale = useLocale();
  const errorText = useErrorText();
  const [value, setValue] = useState("");
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.status === "ok") onDone();
    return res;
  }, idle);
  const message = errorText(state);
  return (
    <form action={formAction} className="space-y-2" id={id}>
      <input type="hidden" name="locale" value={locale} />
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor={`${id}-sel`} className={ui.label}>{label}</label>
      <select id={`${id}-sel`} name={name} value={value} onChange={(e) => setValue(e.target.value)} className={ui.input} required={!blank}>
        {blank ? <option value="">{blank}</option> : <option value="" disabled>—</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {message && <p role="alert" className={ui.error}>{message}</p>}
      <button type="submit" disabled={pending || (!blank && !value)} className={cx(ui.btnSm, ui.btnPrimary)}>{submit}</button>
    </form>
  );
}

/** Botón + diálogo con un selector: cambiar de zona a una pareja, o reemplazar a un jugador. */
export function SelectDialog({
  trigger, title, description, action, fields, name, label, options, submit,
}: { trigger: string; title: string; description?: string; action: "swapZone" | "replacePlayer"; fields: Record<string, string>; name: string; label: string; options: Option[]; submit: string }) {
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const act = action === "swapZone" ? swapZoneEntriesAction : replacePlayerAction;
  const formId = `sd-${Object.values(fields).join("-")}`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btnSm, ui.btnGhost)}>{trigger}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        actions={<button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>}
      >
        {open && <SelectForm id={formId} action={act} fields={fields} name={name} label={label} options={options} submit={submit} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

/**
 * Editar un lugar de la primera ronda de la llave: poner a mano cualquier pareja, intercambiarlo con otro lugar o volver al
 * automático (la pareja que sale de la zona).
 */
export function SlotDialog({
  matchId, side, label, entries, slots, fixed, hasSource,
}: { matchId: string; side: "a" | "b"; label: string; entries: Option[]; slots: Option[]; fixed: boolean; hasSource: boolean }) {
  const t = useTranslations("tournaments.adjust");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await restoreSlotAction(prev, fd);
    if (res.status === "ok") setOpen(false);
    return res;
  }, idle);
  const message = errorText(state);
  const base = { id: matchId, side };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btnSm, ui.btnGhost)} aria-label={`${t("edit")}: ${label}`}>{t("edit")}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("slotTitle")}
        description={`${label}${fixed ? ` · ${t("fixed")}` : ""}`}
        actions={<button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>}
      >
        {open && (
          <div className="space-y-5">
            <SelectForm id={`slot-${matchId}-${side}-set`} action={setSlotEntryAction} fields={base} name="entry" label={t("setPair")} options={entries} blank={t("automatic")} submit={t("apply")} onDone={() => setOpen(false)} />
            <SelectForm id={`slot-${matchId}-${side}-swap`} action={swapSlotsAction} fields={base} name="other" label={t("swapWith")} options={slots} submit={t("swap")} onDone={() => setOpen(false)} />
            {hasSource && fixed && (
              <form action={formAction} className="space-y-2">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="id" value={matchId} />
                <input type="hidden" name="side" value={side} />
                <button type="submit" disabled={pending} className={cx(ui.btnSm, ui.btnSecondary)}>{t("restore")}</button>
                {message && <p role="alert" className={ui.error}>{message}</p>}
              </form>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
