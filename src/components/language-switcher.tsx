"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ui } from "./ui";

const NAMES: Record<string, string> = { es: "Español", en: "English", pt: "Português" };

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <select
      aria-label={t("language")}
      value={locale}
      className={className ?? `${ui.input} !w-auto`}
      onChange={(e) => router.replace(`${pathname}${window.location.search}`, { locale: e.target.value })}
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>{NAMES[l]}</option>
      ))}
    </select>
  );
}
