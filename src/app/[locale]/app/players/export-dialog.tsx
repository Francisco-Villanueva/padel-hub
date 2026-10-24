"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { exportCsvAction, type ExportState } from "./export-actions";

type Props = { filteredCount: number; allCount: number; filterSummary: string; hasFilters: boolean; filters: Record<string, string> };

/** Exportar CSV (solo se renderiza para el dueño; la acción igual lo verifica en el servidor). */
export function ExportDialog({ filteredCount, allCount, filterSummary, hasFilters, filters }: Props) {
  const t = useTranslations("players");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Al terminar bien, se baja el archivo y se cierra el diálogo. El CSV se arma en el servidor y viaja en la respuesta.
  const [state, action, pending] = useActionState(async (prev: ExportState, fd: FormData) => {
    const res = await exportCsvAction(prev, fd);
    if (res.status === "ok") {
      const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    }
    return res;
  }, { status: "idle" } as ExportState);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btn, ui.btnSecondary, "flex-1 sm:flex-none")}>
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        {t("export")}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("exportDialog.title")}
        actions={
          <>
            <button type="button" onClick={() => setOpen(false)} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
            <button type="submit" form="export-form" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>
              {pending ? t("exportDialog.downloading") : t("exportDialog.download")}
            </button>
          </>
        }
      >
        <form id="export-form" action={action} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          {Object.entries(filters).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}

          <fieldset className="space-y-2">
            <legend className="sr-only">{t("exportDialog.title")}</legend>
            {hasFilters && (
              <label className="flex cursor-pointer items-start gap-3">
                <input type="radio" name="scope" value="filters" defaultChecked className="mt-1 size-5 accent-[var(--brand)]" />
                <span>
                  <span className="block font-semibold">{t("exportDialog.scopeFilters")}</span>
                  <span className="block text-sm text-ink-muted">{t("exportDialog.count", { count: filteredCount })}{filterSummary && `: ${filterSummary}`}</span>
                </span>
              </label>
            )}
            <label className="flex cursor-pointer items-start gap-3">
              <input type="radio" name="scope" value="all" defaultChecked={!hasFilters} className="mt-1 size-5 accent-[var(--brand)]" />
              <span>
                <span className="block font-semibold">{t("exportDialog.scopeAll")}</span>
                <span className="block text-sm text-ink-muted">{t("exportDialog.count", { count: allCount })}</span>
              </span>
            </label>
          </fieldset>

          <label className="flex cursor-pointer items-center gap-3 font-semibold">
            <input type="checkbox" name="phones" defaultChecked className="size-5 accent-[var(--brand)]" />
            {t("exportDialog.phones")}
          </label>

          <div className={cx(ui.notice, ui.noticeWarning, "flex items-start gap-3 border border-warning")}>
            <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
            <div>
              <p className="font-semibold">{t("exportDialog.warnTitle")}</p>
              <p className="font-normal">{t("exportDialog.warnBody")}</p>
            </div>
          </div>

          <div>
            <label htmlFor="export-password" className={ui.label}>{t("exportDialog.password")}</label>
            <input
              id="export-password" name="password" type="password" required autoComplete="current-password" maxLength={200} className={ui.input}
              aria-invalid={state.status === "error" && state.error === "invalid_password" ? true : undefined}
              aria-describedby={state.status === "error" ? "export-error" : undefined}
            />
            {state.status === "error" ? (
              <p id="export-error" role="alert" className={ui.error}>{t(`exportDialog.errors.${state.error}`)}</p>
            ) : (
              <p className={ui.hint}>{t("exportDialog.passwordHint")}</p>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
