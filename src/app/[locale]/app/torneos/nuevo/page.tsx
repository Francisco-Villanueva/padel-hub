import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryOptions } from "@/components/category-label";
import { PageHead } from "@/components/page-head";
import { FormSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { requireFeature } from "@/server/auth/session";
import { withTenant } from "@/server/db/client";
import { listTemplates } from "@/server/services/tournament-templates";
import { createTournamentAction } from "../actions";
import { TournamentForm } from "../_components/tournament-form";

async function Nuevo({ locale }: { locale: string }) {
  const session = await requireFeature(locale, "tournaments");
  const t = await getTranslations();
  const templates = await withTenant(session.clubId, (tx) => listTemplates(tx, { clubId: session.clubId }));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <PageHead
        crumb={<><Link href="/app/torneos" className="hover:text-ink hover:underline">{t("tournaments.title")}</Link> / {t("tournaments.new")}</>}
        title={t("tournaments.form.title")}
        description={t("tournaments.form.lead")}
      />
      <div className={cx(ui.card, "enter")} style={stagger(1)}>
        <TournamentForm
          action={createTournamentAction}
          categories={categoryOptions(t)}
          templates={templates.map((x) => ({ id: x.id, name: x.name, championPoints: x.championPoints, participationPoints: x.participationPoints, roundPercents: x.roundPercents }))}
          today={today}
        />
      </div>
    </div>
  );
}

export default async function NuevoTorneoPage({ params }: PageProps<"/[locale]/app/torneos/nuevo">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Nuevo locale={locale} />
    </Suspense>
  );
}
