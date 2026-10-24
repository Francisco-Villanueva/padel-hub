import { useTranslations } from "next-intl";
import { Avatar } from "./avatar";
import { AppNav } from "./app-nav";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import type { NavItem } from "./nav-items";
import { LogoutButton } from "./logout-button";

/**
 * Cuerpo común de los paneles (club y superadmin).
 * lg+: barra lateral · tablet: barra superior con navegación en fila · celular: navegación inferior fija.
 * `heading` es lo que se ve a la izquierda de la barra superior (club o insignia de superadmin).
 */
export function AppShell({
  items,
  heading,
  userName,
  userRole,
  children,
}: {
  items: NavItem[];
  heading: React.ReactNode;
  userName: string;
  userRole: string;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <div className="min-h-dvh bg-surface text-ink lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="enter-fade hidden flex-col gap-6 border-r border-line bg-surface-raised p-4 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Logo alt={t("app.name")} className="h-8" />
        <AppNav items={items} orientation="vertical" />
        <div className="mt-auto flex items-center gap-3 border-t border-line pt-4">
          <Avatar name={userName} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{userName}</div>
            <div className="truncate text-xs text-ink-muted">{userRole}</div>
          </div>
          <LogoutButton variant="icon" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface-raised/90 backdrop-blur-md">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <Logo variant="mark" alt={t("app.name")} className="h-6 lg:hidden" />
              {heading}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <LanguageSwitcher />
              <LogoutButton variant="icon" className="lg:hidden" />
            </div>
          </div>
          <div className="hidden px-3 pb-2 sm:block sm:px-5 lg:hidden">
            <AppNav items={items} orientation="horizontal" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 sm:pb-6 lg:px-10 lg:py-10">{children}</main>
        <footer className="px-4 py-6 pb-24 text-center text-xs text-ink-muted sm:px-6 sm:pb-6 lg:text-left lg:px-10">{t("app.poweredBy")}</footer>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised px-2 pb-[env(safe-area-inset-bottom)] pt-1 sm:hidden">
        <AppNav items={items} orientation="bottom" />
      </div>
    </div>
  );
}
