"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
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
type Action = (prev: TState, fd: FormData) => Promise<TState>;
type Confirm = { title: string; body: string; label: string };

/** Diálogo de confirmación de una server action (campos ocultos + botón de confirmar). Se cierra solo si la acción sale bien. */
export function ConfirmActionDialog({
  open, onClose, action, fields, confirm, tone = "danger", icon,
}: { open: boolean; onClose: () => void; action: Action; fields: Record<string, string>; confirm: Confirm; tone?: "danger" | "primary"; icon?: IconName }) {
  const locale = useLocale();
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.status === "ok") onClose();
    return res;
  }, idle);
  const message = errorText(state);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={confirm.title}
      description={confirm.body}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}><Icon name="x" />{tc("cancel")}</button>
          <form action={formAction} className="contents">
            <input type="hidden" name="locale" value={locale} />
            {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <button type="submit" disabled={pending} className={cx(ui.btn, tone === "danger" ? ui.btnDangerSolid : ui.btnPrimary)}>{icon && <Icon name={icon} />}{confirm.label}</button>
          </form>
        </>
      }
    >
      {message && <p role="alert" className={ui.error}>{message}</p>}
    </Modal>
  );
}

/**
 * Botón que dispara una server action con campos ocultos (id…). Con `confirm` abre antes un diálogo de confirmación.
 * Deshabilitado con `disabled`; muestra el error de la acción debajo. `icon` va a la izquierda del texto.
 */
export function ActionButton({
  action, fields, children, variant = "secondary", confirm, small, disabled, className, icon,
}: {
  action: Action;
  fields: Record<string, string>;
  children: React.ReactNode;
  variant?: Variant;
  confirm?: Confirm;
  small?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: IconName;
}) {
  const locale = useLocale();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, idle);
  const cls = cx(small ? ui.btnSm : ui.btn, VARIANT[variant], className);
  const content = <>{icon && <Icon name={icon} />}{children}</>;
  const message = errorText(state);
  if (confirm) {
    return (
      <>
        <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={cls}>{content}</button>
        <ConfirmActionDialog open={open} onClose={() => setOpen(false)} action={action} fields={fields} confirm={confirm} tone={variant === "primary" ? "primary" : "danger"} icon={icon} />
      </>
    );
  }
  return (
    <>
      <form action={formAction} className="contents">
        <input type="hidden" name="locale" value={locale} />
        {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <button type="submit" disabled={disabled || pending} className={cls}>{content}</button>
      </form>
      {message && <p role="alert" className={cx(ui.error, "w-full")}>{message}</p>}
    </>
  );
}
