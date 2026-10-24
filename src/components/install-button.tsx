"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { getInstallMode, promptInstall, subscribeInstall, type InstallMode } from "@/lib/install-prompt";

/** Instalar la app: solo aparece si el navegador lo permite y la app todavía no está instalada. */
export function InstallButton({ variant = "icon", className }: { variant?: "full" | "icon"; className?: string }) {
  const t = useTranslations("install");
  const mode = useSyncExternalStore(subscribeInstall, getInstallMode, () => "none" as InstallMode);
  const [help, setHelp] = useState(false);
  if (mode === "none") return null;

  async function install() {
    if (!(await promptInstall())) setHelp(true);
  }

  return (
    <>
      <button
        type="button"
        aria-label={variant === "icon" ? t("button") : undefined}
        title={variant === "icon" ? t("button") : undefined}
        className={cx(ui.btn, ui.btnGhost, "gap-2", variant === "icon" && "size-12 !p-0 sm:size-10", className)}
        onClick={install}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        {variant === "full" && t("button")}
      </button>
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        title={t("iosTitle")}
        description={t("iosBody")}
        actions={
          <button type="button" className={cx(ui.btn, ui.btnPrimary)} onClick={() => setHelp(false)}>
            {t("close")}
          </button>
        }
      />
    </>
  );
}
