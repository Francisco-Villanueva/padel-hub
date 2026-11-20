"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { cx, stagger, ui } from "@/components/ui";
import { deleteTemplateAction, saveTemplateAction, type TState } from "../actions";
import { ActionButton, useErrorText } from "./action-button";

export interface TemplateRow { id: string; name: string; championPoints: number; participationPoints: number }
const idle: TState = { status: "idle" };

/** Lista de plantillas con alta y edición en un diálogo, y borrado con confirmación. */
export function TemplateManager({ templates }: { templates: TemplateRow[] }) {
  const t = useTranslations("tournaments.templates");
  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing("new")} className={cx(ui.btn, ui.btnPrimary, "w-full sm:w-auto")}>{t("new")}</button>
      </div>
      {templates.length === 0 ? (
        <div className={cx(ui.card, "enter text-center")}>
          <h2 className="text-lg font-bold">{t("emptyTitle")}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t("emptyBody")}</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {templates.map((x, i) => (
            <li key={x.id} className={cx(ui.card, "enter flex flex-wrap items-center justify-between gap-3 !p-4")} style={stagger(i)}>
              <div className="min-w-0">
                <p className="truncate font-semibold">{x.name}</p>
                <p className="text-sm text-ink-muted">{t("summary", { champion: x.championPoints, participation: x.participationPoints })}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(x)} className={cx(ui.btnSm, ui.btnSecondary)}>{t("edit")}</button>
                <ActionButton action={deleteTemplateAction} fields={{ id: x.id }} variant="danger" small confirm={{ title: t("deleteTitle"), body: t("deleteBody", { name: x.name }), label: t("delete") }}>{t("delete")}</ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateDialog key={editing === "new" ? "new" : editing.id} template={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateDialog({ template, onClose }: { template: TemplateRow | null; onClose: () => void }) {
  const t = useTranslations("tournaments.templates");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await saveTemplateAction(prev, fd);
    if (res.status === "ok") onClose();
    return res;
  }, idle);
  const message = errorText(state) ?? (state.error === "validation" ? t("validation") : null);
  return (
    <Modal
      open
      onClose={onClose}
      title={template ? t("editTitle") : t("newTitle")}
      description={t("formBody")}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
          <button type="submit" form="template-form" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{t("save")}</button>
        </>
      }
    >
      <form id="template-form" action={formAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        {template && <input type="hidden" name="id" value={template.id} />}
        <div>
          <label htmlFor="tp-name" className={ui.label}>{t("name")}</label>
          <input id="tp-name" name="name" required maxLength={80} autoComplete="off" defaultValue={template?.name} placeholder={t("namePlaceholder")} className={ui.input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tp-champ" className={ui.label}>{t("champion")}</label>
            <input id="tp-champ" name="championPoints" type="number" inputMode="numeric" min={1} required defaultValue={template?.championPoints ?? 100} className={ui.input} />
          </div>
          <div>
            <label htmlFor="tp-part" className={ui.label}>{t("participation")}</label>
            <input id="tp-part" name="participationPoints" type="number" inputMode="numeric" min={0} defaultValue={template?.participationPoints ?? 5} className={ui.input} />
          </div>
        </div>
        <p className={ui.hint}>{t("percentsNote")}</p>
        {message && <p role="alert" className={ui.error}>{message}</p>}
      </form>
    </Modal>
  );
}
