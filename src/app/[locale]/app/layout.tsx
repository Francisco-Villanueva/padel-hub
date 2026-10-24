import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ClubMark } from "@/components/club-mark";
import type { NavItem } from "@/components/nav-items";
import { getClubContext } from "@/server/club-context";

// El panel es privado: nada de esto debe indexarse.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Las entradas exclusivas del dueño se ocultan al empleado; cada ruta además lo valida en el servidor (requireOwner).
const ITEMS: NavItem[] = [
  { href: "/app", label: "home", icon: "home", exact: true },
  { href: "/app/players", label: "players", icon: "players" },
  { href: "/app/falta-el-cuarto", label: "cuarto", icon: "cuarto" },
];
const OWNER_ITEMS: NavItem[] = [{ href: "/app/settings", label: "settings", icon: "settings" }];

async function Shell({ locale, children }: { locale: string; children: React.ReactNode }) {
  const t = await getTranslations();
  const { session, club } = await getClubContext(locale);
  const role = t(`auth.role.${session.role}`);

  return (
    <AppShell
      items={session.role === "owner" ? [...ITEMS, ...OWNER_ITEMS] : ITEMS}
      userName={role}
      userRole={club.name}
      heading={
        <>
          <span className="hidden sm:inline-flex"><ClubMark name={club.name} logoUrl={club.logoUrl} /></span>
          <span className="truncate text-base font-semibold">{club.name}</span>
        </>
      }
    >
      {children}
    </AppShell>
  );
}

export default async function ClubLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface" />}>
      <Shell locale={locale}>{children}</Shell>
    </Suspense>
  );
}
