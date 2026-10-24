import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryOptions } from "@/components/category-label";
import { PageHead } from "@/components/page-head";
import { FormSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { getClubContext } from "@/server/club-context";
import { createPlayerAction } from "../actions";
import { PlayerForm } from "../player-form";

async function NewPlayer({ locale }: { locale: string }) {
  const t = await getTranslations();
  await getClubContext(locale);
  return (
    <div className="space-y-6">
      <PageHead
        crumb={<><Link href="/app/players" className="hover:text-ink hover:underline">{t("players.crumb")}</Link> / {t("players.new")}</>}
        title={t("players.form.createTitle")}
        description={t("players.form.createLead")}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className={cx(ui.card, "enter")} style={stagger(1)}>
          <PlayerForm mode="create" action={createPlayerAction} categories={categoryOptions(t)} />
        </div>
        <aside className={cx(ui.card, "enter space-y-2")} style={stagger(2)}>
          <h2 className="text-lg font-bold">{t("players.form.sideTitle")}</h2>
          <p className="text-sm text-ink-muted">{t("players.form.sideBody")}</p>
        </aside>
      </div>
    </div>
  );
}

export default async function NewPlayerPage({ params }: PageProps<"/[locale]/app/players/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewPlayer locale={locale} />
    </Suspense>
  );
}
