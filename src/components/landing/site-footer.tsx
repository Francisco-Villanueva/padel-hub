import { useLocale, useTranslations } from "next-intl";
import { Logo } from "../logo";

export function SiteFooter() {
  const t = useTranslations("landing.footer");
  const tApp = useTranslations("app");
  const locale = useLocale();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-16">
        <div className="space-y-2">
          <Logo alt={tApp("name")} className="h-7" />
          <p className="text-xs font-medium text-ink-muted">{tApp("poweredBy")}</p>
        </div>
        <a
          href={`/api/auth/refresh?next=${encodeURIComponent(`/${locale}/app`)}`}
          className="inline-flex min-h-12 items-center text-sm font-semibold text-brand underline underline-offset-4 hover:text-brand-hover sm:min-h-10"
        >
          {t("login")}
        </a>
      </div>
    </footer>
  );
}
