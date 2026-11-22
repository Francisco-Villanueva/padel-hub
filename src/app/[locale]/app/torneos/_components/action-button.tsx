"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import type { TState } from "../actions";

const idle: TState = { status: "idle" };

/** Mensaje de error de una acción: el código del servicio se traduce en tournaments.errors.*; el motivo de una pareja inválida, en pairReasons.* */
export function useErrorText() {
  const t = useTranslations("tournaments");
  return (s: TState) => {
    if (s.status !== "error" || !s.error) return null;
    if (s.error === "pair_invalid" && s.values?.reason) return t(`pairReasons.${s.values.reason}`);
    return t(`errors.${s.error}`, (s.values ?? {}) as Record<string, string | number>);
  };
}

export type Variant = "primary" | "secondary" | "danger" | "dangerSolid" | "ghost";
const VARIANT: Record<Variant, string> = {
  primary: ui.btnPrimary, secondary: ui.btnSecondary, danger: ui.btnDanger, dangerSolid: ui.btnDangerSolid, ghost: ui.btnGhost,
};

/**
 * Botón que dispara una server action con campos ocultos (id…). Con `confirm` abre antes un diálogo de confirmación.
 * Deshabilitado con `disabled`; muestra el error de la acción debajo.
 */
export function ActionButton({
  action, fields, children, variant = "secondary", confirm, small, disabled, className,
}: {
  action: (prev: TState, fd: FormData) => Promise<TState>;
  fields: Record<string, string>;
  children: React.ReactNode;
  variant?: Variant;
  confirm?: { title: string; body: string; label: string };
  small?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.status === "ok") setOpen(false);
    return res;
  }, idle);
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
  const cls = cx(small ? ui.btnSm : ui.btn, VARIANT[variant], className);
  const message = errorText(state);
  return (
    <>
      {confirm ? (
        <>
          <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={cls}>{children}</button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title={confirm.title}
            description={confirm.body}
            actions={
              <>
                <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
                <form action={formAction} className="contents">
                  {hidden}
                  <button type="submit" disabled={pending} className={cx(ui.btn, VARIANT[variant === "danger" ? "dangerSolid" : variant])}>{confirm.label}</button>
                </form>
              </>
            }
          >
            {message && <p role="alert" className={ui.error}>{message}</p>}
          </Modal>
        </>
      ) : (
        <form action={formAction} className={cx("contents")}>
          {hidden}
          <button type="submit" disabled={disabled || pending} className={cls}>{children}</button>
        </form>
      )}
      {!confirm && message && <p role="alert" className={cx(ui.error, "w-full")}>{message}</p>}
    </>
  );
}
