import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ClubMark } from "@/components/club-mark";
import type { NavItem } from "@/components/nav-items";
import { getEnabledFeatures, requireClubSession } from "@/server/auth/session";
import { getClubContext } from "@/server/club-context";

// El panel es privado: nada de esto debe indexarse.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Las entradas exclusivas del dueño se ocultan al empleado; cada ruta además lo valida en el servidor (requireOwner).
const ITEMS: NavItem[] = [
  { href: "/app", label: "home", icon: "home", exact: true },
  { href: "/app/players", label: "players", icon: "players" },
  { href: "/app/falta-el-cuarto", label: "cuarto", icon: "cuarto" },
];
// Solo si el superadmin habilitó la función para el club (cada ruta lo exige también en el servidor).
const TOURNAMENT_ITEM: NavItem = { href: "/app/torneos", label: "tournaments", icon: "trophy" };
const OWNER_ITEMS: NavItem[] = [{ href: "/app/settings", label: "settings", icon: "settings" }];

async function Shell({ locale, children }: { locale: string; children: React.ReactNode }) {
  // La sesión sale de una cookie (memoizada por request): con su clubId, club y funciones se piden a la vez, sin cascada.
  const session = await requireClubSession(locale);
  const [t, { club }, features] = await Promise.all([getTranslations(), getClubContext(locale), getEnabledFeatures(session.clubId)]);
  const role = t(`auth.role.${session.role}`);
  const items = features.includes("tournaments") ? [...ITEMS, TOURNAMENT_ITEM] : ITEMS;
  const trialDays = club.trialDaysLeft;

  return (
    <AppShell
      items={session.role === "owner" ? [...items, ...OWNER_ITEMS] : items}
      userName={role}
      userRole={club.name}
      heading={
        <>
          <span className="hidden sm:inline-flex"><ClubMark name={club.name} logoUrl={club.logoUrl} /></span>
          <span className="truncate text-base font-semibold">{club.name}</span>
        </>
      }
    >
      {trialDays !== null && session.role === "owner" && (
        <p role="status" className="mb-4 rounded-md border border-info bg-info-tint px-4 py-3 text-sm font-medium text-ink">
          {t("app.trialBanner", { days: trialDays })}
        </p>
      )}
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
