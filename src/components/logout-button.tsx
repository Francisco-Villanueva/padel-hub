"use client";

import { useLocale, useTranslations } from "next-intl";
import { cx, ui } from "@/components/ui";

/** `full`: botón con texto · `icon`: solo ícono (con nombre accesible), para barras angostas. */
export function LogoutButton({ variant = "full", className }: { variant?: "full" | "icon"; className?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  return (
    <button
      type="button"
      aria-label={variant === "icon" ? t("signOut") : undefined}
      title={variant === "icon" ? t("signOut") : undefined}
      className={cx(ui.btn, ui.btnGhost, variant === "icon" && "size-12 !p-0 sm:size-10", className)}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        // Navegación completa a propósito: descarta el caché de RSC de la sesión anterior.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/${locale}/login`);
      }}
    >
      {variant === "icon" ? (
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      ) : (
        t("signOut")
      )}
    </button>
  );
}
