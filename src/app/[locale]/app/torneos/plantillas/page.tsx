import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { Link } from "@/i18n/navigation";
import { requireFeature } from "@/server/auth/session";
import { withTenant } from "@/server/db/client";
import { listTemplates } from "@/server/services/tournament-templates";
import { TemplateManager } from "../_components/template-manager";

async function Plantillas({ locale }: { locale: string }) {
  const session = await requireFeature(locale, "tournaments");
  const t = await getTranslations("tournaments");
  const templates = await withTenant(session.clubId, (tx) => listTemplates(tx, { clubId: session.clubId }));
  return (
    <div className="space-y-6">
      <PageHead
        crumb={<><Link href="/app/torneos" className="hover:text-ink hover:underline">{t("title")}</Link> / {t("templates.title")}</>}
        title={t("templates.title")}
        description={t("templates.sub")}
      />
      <TemplateManager templates={templates.map((x) => ({ id: x.id, name: x.name, championPoints: x.championPoints, participationPoints: x.participationPoints }))} />
    </div>
  );
}

export default async function PlantillasPage({ params }: PageProps<"/[locale]/app/torneos/plantillas">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Plantillas locale={locale} />
    </Suspense>
  );
}
