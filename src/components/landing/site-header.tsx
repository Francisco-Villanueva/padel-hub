import { useLocale, useTranslations } from "next-intl";
import { Suspense } from "react";
import { LanguageSwitcher } from "../language-switcher";
import { Logo } from "../logo";
import { cx, ui } from "../ui";
import { contactHref } from "./contact";
import { MobileMenu } from "./mobile-menu";

const NAV = [
  { href: "#beneficios", key: "forClubs" },
  { href: "#como-funciona", key: "howItWorks" },
  { href: "#preguntas", key: "faq" },
] as const;

const linkClass =
  "rounded-md px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink";

export function SiteHeader() {
  const t = useTranslations("landing.nav");
  const tApp = useTranslations("app");
  const locale = useLocale();
  // Ingresar pasa por el refresh: con sesión vigente entra al panel, y si no, cae en el login.
  const loginHref = `/api/auth/refresh?next=${encodeURIComponent(`/${locale}/app`)}`;
  const contact = contactHref();
  const lang = (
    <Suspense fallback={<div className="h-11 w-36" aria-hidden />}>
      <LanguageSwitcher />
    </Suspense>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:h-20 lg:px-16">
        <a
          href={`/${locale}`}
          aria-label={tApp("name")}
          className="shrink-0 rounded-md"
        >
          <Logo alt={tApp("name")} className="h-7 md:h-8" />
        </a>

        <nav
          aria-label={t("main")}
          className="hidden items-center gap-1 lg:flex"
        >
          {NAV.map((n) => (
            <a key={n.key} href={n.href} className={linkClass}>
              {t(n.key)}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {lang}
          <a
            href={loginHref}
            className={cx(
              ui.btnBase,
              "min-h-10 px-3 text-brand hover:bg-surface-sunken",
            )}
          >
            {t("login")}
          </a>
          <a
            href={contact}
            className={cx(ui.btnBase, ui.btnPrimary, "min-h-10 px-4")}
          >
            {t("cta")}
          </a>
        </div>

        <MobileMenu label={t("menu")}>
          <nav aria-label={t("main")} className="flex flex-col">
            {NAV.map((n) => (
              <a
                key={n.key}
                href={n.href}
                className="flex min-h-12 items-center border-b border-line text-base font-semibold text-ink"
              >
                {t(n.key)}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-3">
            <a
              href={contact}
              className={cx(ui.btnBase, ui.btnPrimary, "min-h-12 px-5")}
            >
              {t("cta")}
            </a>
            <a
              href={loginHref}
              className={cx(ui.btnBase, ui.btnSecondary, "min-h-12 px-5")}
            >
              {t("login")}
            </a>
            {lang}
          </div>
        </MobileMenu>
      </div>
    </header>
  );
}
