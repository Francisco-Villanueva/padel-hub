"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cx } from "./ui";

/** Nombre de cada idioma en su propio idioma: sirve de etiqueta accesible de la bandera. */
const NAMES: Record<string, string> = { es: "Español", en: "English", pt: "Português" };

/** Banderas en SVG (los emojis de bandera no se ven en Windows). Círculo de 24×24. */
const FLAGS: Record<string, React.ReactNode> = {
  es: (
    <>
      <rect width="24" height="24" fill="#74acdf" />
      <rect y="8" width="24" height="8" fill="#fff" />
      <circle cx="12" cy="12" r="2.2" fill="#f6b40e" />
    </>
  ),
  en: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <path d="M0 3h24M0 9h24M0 15h24M0 21h24" stroke="#b22234" strokeWidth="3" />
      <rect width="14" height="13.5" fill="#3c3b6e" />
    </>
  ),
  pt: (
    <>
      <rect width="24" height="24" fill="#009b3a" />
      <path d="M12 3.5 22 12 12 20.5 2 12Z" fill="#fedf00" />
      <circle cx="12" cy="12" r="4.2" fill="#002776" />
    </>
  ),
};

/** Selector de idioma solo con banderas, discreto. El idioma queda en la URL. */
export function LocaleChips({ className, onBrand }: { className?: string; onBrand?: boolean }) {
  const t = useTranslations("signup");
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div role="group" aria-label={t("language")} className={cx("flex items-center gap-1", className)}>
      {routing.locales.map((l) => {
        const active = l === current;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            aria-label={NAMES[l]}
            title={NAMES[l]}
            onClick={() => router.replace(`${pathname}${window.location.search}`, { locale: l })}
            className="inline-flex size-11 items-center justify-center rounded-full sm:size-9"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className={cx(
                "size-6 overflow-hidden rounded-full transition-all",
                active
                  ? cx("ring-2 ring-offset-2", onBrand ? "ring-on-brand ring-offset-brand" : "ring-brand ring-offset-surface")
                  : "opacity-60 hover:opacity-100",
              )}
            >
              {FLAGS[l]}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
