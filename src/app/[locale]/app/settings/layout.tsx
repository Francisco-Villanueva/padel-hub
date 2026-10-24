import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PageHead } from "@/components/page-head";
import { FormSkeleton } from "@/components/skeleton";
import { Tabs } from "@/components/tabs";
import { requireOwner } from "@/server/auth/session";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { listMembers } from "@/server/services/club-users";

async function Frame({ locale, children }: { locale: string; children: React.ReactNode }) {
  // Solo el dueño: el empleado vuelve al inicio aunque conozca la URL.
  await requireOwner(locale);
  const t = await getTranslations("settings");
  const { session } = await getClubContext(locale);
  const members = await withTenant(session.clubId, (tx) => listMembers(tx));
  return (
    <div className="space-y-6">
      <PageHead title={t("title")} description={t("lead")} />
      <Tabs
        label={t("tabs.label")}
        items={[
          { href: "/app/settings/brand", label: t("tabs.brand") },
          { href: "/app/settings/users", label: t("tabs.users"), badge: members.length },
          { href: "/app/settings/links", label: t("tabs.links") },
        ]}
      />
      {children}
    </div>
  );
}

export default async function SettingsLayout({ children, params }: LayoutProps<"/[locale]/app/settings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Frame locale={locale}>{children}</Frame>
    </Suspense>
  );
}
