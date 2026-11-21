import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryLabel } from "@/components/category-label";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { CATEGORY_RULE_KINDS, MODALITIES, type CategoryRuleKind, type Modality } from "@/lib/tournament/constants";
import { DEFAULT_RANKING_WINDOW, RANKING_WINDOWS, type RankingWindow } from "@/lib/tournament/ranking-window";
import { requireFeature } from "@/server/auth/session";
import { withTenant } from "@/server/db/client";
import { getRanking, listRankingBuckets, type RankingGroup } from "@/server/services/ranking";
import { ruleLabel } from "../_components/shared";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const keyOf = (g: RankingGroup) => `${g.ruleKind}-${g.ruleValue}-${g.modality}`;

function parseGroup(raw: string | undefined, buckets: RankingGroup[]): RankingGroup | null {
  const [kind, value, modality] = (raw ?? "").split("-");
  const g = { ruleKind: kind as CategoryRuleKind, ruleValue: Number(value), modality: modality as Modality };
  if (!CATEGORY_RULE_KINDS.includes(g.ruleKind) || !MODALITIES.includes(g.modality)) return buckets[0] ?? null;
  return buckets.find((b) => keyOf(b) === keyOf(g)) ?? buckets[0] ?? null;
}

async function Ranking({ locale, searchParams }: { locale: string; searchParams: PageProps<"/[locale]/app/torneos/ranking">["searchParams"] }) {
  const session = await requireFeature(locale, "tournaments");
  const t = await getTranslations();
  const sp = await searchParams;
  const ctx = { clubId: session.clubId };
  const buckets = await withTenant(session.clubId, (tx) => listRankingBuckets(tx, ctx));
  const group = parseGroup(first(sp.g), buckets);
  const w = first(sp.w) as RankingWindow | undefined;
  const window: RankingWindow = w && RANKING_WINDOWS.includes(w) ? w : DEFAULT_RANKING_WINDOW;
  const rows = group ? await withTenant(session.clubId, (tx) => getRanking(tx, ctx, group, window)) : [];
  const href = (g: RankingGroup, win: RankingWindow) => `/app/torneos/ranking?g=${keyOf(g)}&w=${win}`;

  return (
    <div className="space-y-6">
      <PageHead
        crumb={<><Link href="/app/torneos" className="hover:text-ink hover:underline">{t("tournaments.title")}</Link> / {t("tournaments.ranking.title")}</>}
        title={t("tournaments.ranking.title")}
        description={t("tournaments.ranking.sub")}
      />
      {!group ? (
        <section className={cx(ui.card, "enter text-center")}>
          <h2 className="text-lg font-bold">{t("tournaments.ranking.noGroupsTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{t("tournaments.ranking.noGroupsBody")}</p>
        </section>
      ) : (
        <>
          <div className="space-y-3">
            <nav aria-label={t("tournaments.ranking.group")} className="flex flex-wrap gap-2">
              {buckets.map((b) => (
                <Link key={keyOf(b)} href={href(b, window)} aria-current={keyOf(b) === keyOf(group) ? "true" : undefined}
                  className={cx(ui.chip, keyOf(b) === keyOf(group) && ui.chipActive)}>
                  {ruleLabel(t, b.ruleKind, b.ruleValue)} · {t(`tournaments.modality.${b.modality}`)}
                </Link>
              ))}
            </nav>
            <nav aria-label={t("tournaments.ranking.windowLabel")} className="flex flex-wrap gap-2">
              {RANKING_WINDOWS.map((x) => (
                <Link key={x} href={href(group, x)} aria-current={x === window ? "true" : undefined} className={cx(ui.chip, x === window && ui.chipActive)}>
                  {t(`tournaments.ranking.window.${x}`)}
                </Link>
              ))}
            </nav>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("tournaments.ranking.empty")}</p>
          ) : (
            <section className={cx(ui.card, "enter overflow-x-auto !p-0")}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-sunken text-left text-[13px] font-semibold text-ink-muted">
                    <th scope="col" className="w-14 px-4 py-2.5">{t("tournaments.ranking.position")}</th>
                    <th scope="col" className="px-4 py-2.5">{t("tournaments.ranking.player")}</th>
                    <th scope="col" className="hidden px-4 py-2.5 sm:table-cell">{t("tournaments.ranking.category")}</th>
                    <th scope="col" className="hidden px-4 py-2.5 text-right sm:table-cell">{t("tournaments.ranking.tournaments")}</th>
                    <th scope="col" className="px-4 py-2.5 text-right">{t("tournaments.ranking.points")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r, i) => (
                    <tr key={r.playerId} className="enter" style={stagger(i)}>
                      <td className="px-4 py-3 font-display text-lg font-bold">{r.position}</td>
                      <td className="px-4 py-3 font-medium">{r.lastName}, {r.firstName}</td>
                      <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">{r.category ? categoryLabel(t, r.category) : "—"}</td>
                      <td className="hidden px-4 py-3 text-right text-ink-muted sm:table-cell">{r.tournaments}</td>
                      <td className="px-4 py-3 text-right font-semibold">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default async function RankingPage({ params, searchParams }: PageProps<"/[locale]/app/torneos/ranking">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Ranking locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
