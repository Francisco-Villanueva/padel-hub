import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { requireFeature } from "@/server/auth/session";
import { withTenant } from "@/server/db/client";
import { listTournaments } from "@/server/services/tournaments";
import { ruleLabel, statusBadge } from "./_components/shared";

// Con el flag apagado: 404 para dueño y empleado (requireFeature).
const GROUPS = [
  { key: "live", statuses: ["zonas", "llave"] },
  { key: "registration", statuses: ["inscripcion"] },
  { key: "draft", statuses: ["borrador"] },
  { key: "closed", statuses: ["cerrado"] },
  { key: "cancelled", statuses: ["cancelado"] },
] as const;

async function Torneos({ locale }: { locale: string }) {
  const session = await requireFeature(locale, "tournaments");
  const t = await getTranslations();
  const format = await getFormatter();
  const list = await withTenant(session.clubId, (tx) => listTournaments(tx, { clubId: session.clubId }));
  let n = 0;

  return (
    <div className="space-y-6">
      <PageHead
        title={t("tournaments.title")}
        description={t("tournaments.sub")}
        actions={
          <>
            <Link href="/app/torneos/ranking" className={cx(ui.btn, ui.btnSecondary, "flex-1 sm:flex-none")}>{t("tournaments.ranking.title")}</Link>
            <Link href="/app/torneos/plantillas" className={cx(ui.btn, ui.btnSecondary, "flex-1 sm:flex-none")}>{t("tournaments.templates.title")}</Link>
            <Link href="/app/torneos/nuevo" className={cx(ui.btn, ui.btnPrimary, "w-full sm:w-auto")}>{t("tournaments.new")}</Link>
          </>
        }
      />
      {list.length === 0 ? (
        <section className={cx(ui.card, "enter text-center")}>
          <h2 className="text-lg font-bold">{t("tournaments.empty.title")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{t("tournaments.empty.body")}</p>
        </section>
      ) : (
        GROUPS.map((g) => {
          const rows = list.filter((x) => (g.statuses as readonly string[]).includes(x.status));
          if (rows.length === 0) return null;
          return (
            <section key={g.key} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t(`tournaments.sections.${g.key}`)} · {rows.length}</h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((x) => (
                  <li key={x.id} className="enter" style={stagger(n++)}>
                    <Link href={`/app/torneos/${x.id}`} className={cx(ui.card, "block !p-4 transition-colors hover:bg-surface-sunken/60")}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-base font-semibold">{x.name}</p>
                        <span className={statusBadge(x.status)}>{t(`tournaments.status.${x.status}`)}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink-muted">
                        {ruleLabel(t, x.categoryRuleKind, x.categoryRuleValue)} · {t(`tournaments.modality.${x.modality}`)}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                        <span>{format.dateTime(new Date(`${x.startsOn}T12:00:00`), { dateStyle: "medium" })}</span>
                        <span className={x.isRanked ? ui.badgeAccent : ui.badge}>{x.isRanked ? t("tournaments.ranked") : t("tournaments.notRanked")}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

export default async function TorneosPage({ params }: PageProps<"/[locale]/app/torneos">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Torneos locale={locale} />
    </Suspense>
  );
}
