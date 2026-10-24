"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cx } from "./ui";

/** Selector de idioma en chips (ES · EN · PT) para pantallas públicas y de tablet. El idioma queda en la URL. */
export function LocaleChips({ className, onBrand }: { className?: string; onBrand?: boolean }) {
  const t = useTranslations("signup");
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div role="group" aria-label={t("language")} className={cx("flex gap-2", className)}>
      {routing.locales.map((l) => {
        const active = l === current;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            onClick={() => router.replace(pathname, { locale: l })}
            className={cx(
              "inline-flex min-h-12 min-w-14 items-center justify-center gap-1 rounded-full border px-3 text-sm font-semibold transition-colors sm:min-h-10",
              onBrand
                ? active ? "border-on-brand bg-on-brand text-brand" : "border-on-brand/60 text-on-brand hover:bg-on-brand/10"
                : active ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
            )}
          >
            {active && (
              <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 5 5L20 7" />
              </svg>
            )}
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
