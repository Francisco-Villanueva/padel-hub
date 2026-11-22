"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Link } from "@/i18n/navigation";
import { cx, ui } from "@/components/ui";

/**
 * Botón con ícono de pantalla que abre un diálogo con el link público del tablero (el del televisor): copiarlo, abrirlo
 * o ir a gestionar los partidos desde el panel.
 */
export function TvDialog({ url, manageHref }: { url: string; manageHref: string }) {
  const t = useTranslations("tournaments.tvDialog");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: la persona puede seleccionar el link a mano.
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(ui.btn, ui.btnSecondary)} aria-haspopup="dialog">
        <Icon name="tv" className="size-5" />
        <span className="max-sm:sr-only">{t("trigger")}</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("title")}
        description={t("body")}
        actions={
          <>
            <Link href={manageHref} className={cx(ui.btn, ui.btnSecondary, "whitespace-nowrap")}><Icon name="scoreboard" />{t("manage")}</Link>
            <a href={url} target="_blank" rel="noreferrer" className={cx(ui.btn, ui.btnPrimary, "whitespace-nowrap")}><Icon name="external" />{t("open")}</a>
          </>
        }
      >
        <div className="space-y-1.5">
          <label htmlFor="tv-link" className={ui.label}>{t("link")}</label>
          <div className="flex gap-2">
            <input id="tv-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={cx(ui.input, "min-w-0 flex-1 text-sm")} />
            <button type="button" onClick={copy} className={cx(ui.btn, ui.btnSecondary, "shrink-0")}>
              <Icon name={copied ? "check" : "copy"} />
              <span aria-live="polite">{copied ? tc("copied") : tc("copy")}</span>
            </button>
          </div>
          <p className={ui.hint}>{t("hint")}</p>
        </div>
      </Modal>
    </>
  );
}
