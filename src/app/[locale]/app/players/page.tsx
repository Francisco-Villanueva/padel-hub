import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryOptions } from "@/components/category-label";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { StateView } from "@/components/state-view";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { playerFiltersSchema } from "@/lib/player-schema";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { countPlayers, listPlayers } from "@/server/services/players";
import { ExportDialog } from "./export-dialog";
import { FilterBar } from "./filter-bar";
import { Pagination, PlayerCards, PlayerTable } from "./player-views";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function PlayersContent({ locale, searchParams }: { locale: string; searchParams: PageProps<"/[locale]/app/players">["searchParams"] }) {
  const t = await getTranslations();
  const sp = await searchParams;
  const { session } = await getClubContext(locale);

  // Filtros inválidos en la URL se ignoran en vez de romper la página.
  const parsed = playerFiltersSchema.safeParse({
    q: first(sp.q), category: first(sp.category), gender: first(sp.gender), position: first(sp.position), slot: first(sp.slot), page: first(sp.page),
  });
  const filters = parsed.success ? parsed.data : playerFiltersSchema.parse({});

  const isOwner = session.role === "owner";
  const categories = categoryOptions(t);
  const { result, allCount } = await withTenant(session.clubId, async (tx) => ({
    result: await listPlayers(tx, filters),
    allCount: isOwner ? await countPlayers(tx) : 0,
  }));

  const hasFilters = Boolean(filters.q || filters.category || filters.gender || filters.position || filters.slot);
  const flash = first(sp.created) ? t("players.created") : first(sp.deleted) ? t("players.deleted") : null;
  const params: Record<string, string> = {};
  for (const k of ["q", "category", "gender", "position", "slot"] as const) if (filters[k]) params[k] = String(filters[k]);

  return (
    <div className="space-y-6">
      <PageHead
        title={t("players.title")}
        description={t("players.count", { count: result.total })}
        actions={
          <>
            {/* Solo el dueño exporta: acá se oculta la entrada y la acción lo vuelve a validar en el servidor. */}
            {isOwner && (
              <ExportDialog
                filteredCount={result.total}
                allCount={allCount}
                hasFilters={hasFilters}
                filters={params}
                filterSummary={[
                  filters.q && `“${filters.q}”`,
                  filters.category && categories.find((c) => c.id === String(filters.category))?.label,
                  filters.gender && t(`gender.${filters.gender}`),
                  filters.position && t(`position.${filters.position}`),
                  filters.slot && t(`slot.${filters.slot}`),
                ].filter(Boolean).join(", ")}
              />
            )}
            <Link href="/app/players/new" className={cx(ui.btn, ui.btnPrimary, "flex-1 sm:flex-none")}>+ {t("players.new")}</Link>
          </>
        }
      />

      {flash && <p role="status" className={cx(ui.notice, ui.noticeOk, "enter")}>{flash}</p>}

      <div className="enter" style={stagger(1)}>
        <FilterBar
          initial={{ q: filters.q ?? "", category: filters.category ? String(filters.category) : "", gender: filters.gender ?? "", position: filters.position ?? "", slot: filters.slot ?? "" }}
          categories={categories}
        />
      </div>

      {result.rows.length === 0 ? (
        <StateView level={2} icon={hasFilters ? "search" : "players"} title={hasFilters ? t("players.noResultsTitle") : t("players.emptyTitle")} body={hasFilters ? t("players.noResultsHint") : t("players.emptyHint")}>
          {!hasFilters && <Link href="/app/players/new" className={cx(ui.btn, ui.btnPrimary)}>+ {t("players.emptyAction")}</Link>}
        </StateView>
      ) : (
        <>
          <PlayerCards rows={result.rows} t={t} locale={locale} />
          <PlayerTable rows={result.rows} t={t} locale={locale} />
          <Pagination page={result.page} pageCount={result.pageCount} params={params} t={t} />
        </>
      )}
    </div>
  );
}

export default async function PlayersPage({ params, searchParams }: PageProps<"/[locale]/app/players">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PlayersContent locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
