"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { ClubMark } from "@/components/club-mark";
import { cx, ui } from "@/components/ui";
import { LOGO_ACCEPT, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/logo";
import { removeLogoAction, saveLogoAction, type SettingsState } from "../actions";

const idle: SettingsState = { status: "idle" };

/**
 * Logo del club. Es una tarjeta aparte (con sus propios formularios) para no anidar formularios dentro del de marca.
 * El navegador solo adelanta una vista previa y avisa de los errores obvios; la validación de verdad la hace el servidor.
 */
export function LogoCard({ name, logoUrl }: { name: string; logoUrl: string }) {
  const t = useTranslations("settings.brand");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [upState, upAction, upPending] = useActionState(saveLogoAction, idle);
  const [rmState, rmAction, rmPending] = useActionState(removeLogoAction, idle);
  const [rawPicked, setPicked] = useState<{ name: string; url: string; at: SettingsState } | null>(null);
  // Subido con éxito (cambió el estado de la acción): la página trae el logo nuevo y la vista previa local deja de mostrarse.
  const picked = rawPicked && !(upState.status === "ok" && upState !== rawPicked.at) ? rawPicked : null;
  const [clientError, setClientError] = useState<string | null>(null);
  const pickedUrl = useRef<string | null>(null);

  const forget = () => {
    if (pickedUrl.current) URL.revokeObjectURL(pickedUrl.current);
    pickedUrl.current = null;
    setPicked(null);
  };
  useEffect(() => () => { if (pickedUrl.current) URL.revokeObjectURL(pickedUrl.current); }, []);
  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    forget();
    setClientError(null);
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) { setClientError("too_large"); e.target.value = ""; return; }
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) { setClientError("bad_type"); e.target.value = ""; return; }
    pickedUrl.current = URL.createObjectURL(file);
    setPicked({ name: file.name, url: pickedUrl.current, at: upState });
  }

  const error = clientError ?? (upState.status === "error" ? upState.error : rmState.status === "error" ? rmState.error : null);
  const ok = !error && !picked && (upState.status === "ok" ? "logoSaved" : rmState.status === "ok" ? "logoRemoved" : null);
  const hasLogo = Boolean(logoUrl);

  return (
    <section className={cx(ui.card, "enter space-y-4")} aria-labelledby="logo-title">
      <div>
        <h2 id="logo-title" className="text-lg font-bold">{t("logoTitle")}</h2>
        <p className={ui.hint}>{t("logoHelp")}</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <ClubMark name={name} logoUrl={picked?.url ?? (hasLogo ? logoUrl : null)} size="xl" className="self-start sm:self-center" />

        <div className="min-w-0 flex-1 space-y-3">
          {!hasLogo && !picked && <p className="text-sm text-ink-muted">{t("logoNone")}</p>}
          {picked && <p className="truncate text-sm text-ink-muted">{t("logoSelected", { name: picked.name })}</p>}

          <form action={upAction} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <input type="hidden" name="locale" value={locale} />
            <label className={cx(ui.btn, ui.btnSecondary, "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus")}>
              {hasLogo || picked ? t("logoReplace") : t("logoChoose")}
              <input name="logo" type="file" accept={LOGO_ACCEPT} onChange={onPick} className="sr-only" />
            </label>
            {picked && (
              <button type="submit" disabled={upPending} className={cx(ui.btn, ui.btnPrimary)}>
                {upPending ? t("logoSaving") : t("logoUpload")}
              </button>
            )}
            {picked && (
              <button type="button" onClick={forget} className={cx(ui.btn, ui.btnSecondary)}>
                {tc("cancel")}
              </button>
            )}
          </form>

          {hasLogo && !picked && (
            <form action={rmAction}>
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" disabled={rmPending} className={cx(ui.btn, ui.btnDanger)}>{t("logoRemove")}</button>
            </form>
          )}
        </div>
      </div>

      {error && <p role="alert" className={cx(ui.notice, ui.noticeError)}>{t(`logoErrors.${error}`)}</p>}
      {ok && <p role="status" className={cx(ui.notice, ui.noticeOk)}>{t(ok)}</p>}
    </section>
  );
}
