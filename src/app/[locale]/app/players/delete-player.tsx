"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { deletePlayerAction, type FormState } from "./actions";

/** Botón "Borrar" con confirmación. Solo se muestra al dueño; la acción lo vuelve a validar en el servidor. */
export function DeletePlayer({ playerId, name }: { playerId: string; name: string }) {
  const t = useTranslations("players");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deletePlayerAction, { status: "idle" } as FormState);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btn, ui.btnDanger, "flex-1 sm:flex-none")}>{t("delete")}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("form.deleteTitle")}
        description={`${t("form.confirmDelete")} ${name}. ${t("form.deleteHint")}`}
        actions={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
            <form action={action} className="contents">
              <input type="hidden" name="id" value={playerId} />
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" disabled={pending} className={cx(ui.btn, ui.btnDangerSolid)}>{t("delete")}</button>
            </form>
          </>
        }
      >
        {state.status === "error" && state.error && <p role="alert" className={ui.error}>{t(`errors.${state.error}`)}</p>}
      </Modal>
    </>
  );
}
