"use client";

import { useLocale, useTranslations } from "next-intl";
import { cx, ui } from "@/components/ui";
import { logContactAction } from "../falta-el-cuarto/actions";

/** Abre WhatsApp con el jugador y deja constancia del contacto. El enlace funciona aunque el registro falle. */
export function WhatsAppButton({ href, playerId, className }: { href: string; playerId: string; className?: string }) {
  const t = useTranslations("cuarto");
  const locale = useLocale();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void logContactAction(playerId, locale, "otro")}
      className={cx(ui.btn, ui.btnWhatsapp, className)}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
      {t("writeLong")}
    </a>
  );
}
