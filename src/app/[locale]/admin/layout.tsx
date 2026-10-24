import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-items";
import { ui } from "@/components/ui";
import { requireSuperadmin } from "@/server/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const ITEMS: NavItem[] = [{ href: "/admin", label: "clubs", icon: "clubs" }];

async function Shell({ locale, children }: { locale: string; children: React.ReactNode }) {
  const t = await getTranslations("nav");
  await requireSuperadmin(locale);
  return (
    <AppShell
      items={ITEMS}
      userName={t("superadmin")}
      userRole="Duxio"
      heading={
        <>
          <span className={ui.badgeWarning}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z" />
            </svg>
            {t("superadmin")}
          </span>
          <span className="hidden truncate text-sm text-ink-muted md:inline">{t("superadminNote")}</span>
        </>
      }
    >
      {children}
    </AppShell>
  );
}

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface" />}>
      <Shell locale={locale}>{children}</Shell>
    </Suspense>
  );
}
