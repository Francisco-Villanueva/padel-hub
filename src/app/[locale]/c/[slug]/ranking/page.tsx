import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryLabel } from "@/components/category-label";
import { ClubMark } from "@/components/club-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { clubBrandCss } from "@/lib/color";
import { RANKING_WINDOWS, type RankingWindow } from "@/lib/tournament/ranking-window";
import { bucketKey as keyOf, loadPublicRanking, wantedGroup, wantedWindow } from "@/server/services/public-cache";
import type { PublicBucket } from "@/server/services/public-ranking";

// Público, pero sin indexar: muestra nombres de jugadores (nombre de pila e inicial del apellido, nunca contacto).
export const metadata: Metadata = { robots: { index: false, follow: false } };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function PublicRanking({ page }: { page: PageProps<"/[locale]/c/[slug]/ranking"> }) {
  // Las props se leen acá adentro (dentro de <Suspense>): leerlas en la página bloquearía el prerender (slug es dinámico).
  const { locale, slug } = await page.params;
  setRequestLocale(locale);
  const sp = await page.searchParams;
  const t = await getTranslations();
  // 404 si el club no existe, está suspendido o no tiene torneos activados (datos cacheados unos segundos en el servidor).
  const window = wantedWindow(first(sp.w));
  const data = await loadPublicRanking(slug, wantedGroup(first(sp.g)), window);
  if (!data) notFound();
  const { club, buckets, group, rows } = data;
  const href = (g: PublicBucket, win: RankingWindow) => `/c/${slug}/ranking?g=${keyOf(g)}&w=${win}`;
  const label = (g: PublicBucket) => `${g.ruleKind === "sum" ? t("tournaments.rule.sum", { n: g.ruleValue }) : categoryLabel(t, g.ruleValue)} · ${t(`tournaments.modality.${g.modality}`)}`;
  const brandCss = clubBrandCss(club.colorPrimary, club.colorAccent);

  return (
    <>
      {brandCss && <style>{brandCss}</style>}
      <div className="club-brand flex min-h-dvh flex-col bg-surface text-ink">
        <header className="bg-brand text-on-brand">
          <div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <ClubMark name={club.name} logoUrl={club.logoUrl} tone="ink" />
              <span className="truncate text-base font-semibold">{club.name}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
          <div className="enter space-y-2">
            <h1 className="font-display text-[2.5rem] font-bold leading-none sm:text-5xl">{t("tournaments.ranking.title")}</h1>
            <p className="text-ink-muted">{t("tournaments.ranking.publicLead")}</p>
          </div>
          {!group ? (
            <section className={cx(ui.card, "enter text-center")}>
              <h2 className="text-lg font-bold">{t("tournaments.ranking.noGroupsTitle")}</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{t("tournaments.ranking.publicNoGroupsBody")}</p>
            </section>
          ) : (
            <>
              <div className="space-y-3">
                <nav aria-label={t("tournaments.ranking.group")} className="flex flex-wrap gap-2">
                  {buckets.map((b) => (
                    <Link key={keyOf(b)} href={href(b, window)} aria-current={keyOf(b) === keyOf(group) ? "true" : undefined} className={cx(ui.chip, keyOf(b) === keyOf(group) && ui.chipActive)}>{label(b)}</Link>
                  ))}
                </nav>
                <nav aria-label={t("tournaments.ranking.windowLabel")} className="flex flex-wrap gap-2">
                  {RANKING_WINDOWS.map((x) => (
                    <Link key={x} href={href(group, x)} aria-current={x === window ? "true" : undefined} className={cx(ui.chip, x === window && ui.chipActive)}>{t(`tournaments.ranking.window.${x}`)}</Link>
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
                        <th scope="col" className="px-4 py-2.5 text-right">{t("tournaments.ranking.points")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((r, i) => (
                        <tr key={`${r.position}-${i}`} className="enter" style={stagger(i)}>
                          <td className="px-4 py-3 font-display text-lg font-bold">{r.position}</td>
                          <td className="px-4 py-3 font-medium">{r.firstName} {r.lastInitial}.</td>
                          <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">{r.category ? categoryLabel(t, r.category) : "—"}</td>
                          <td className="px-4 py-3 text-right font-semibold">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </>
          )}
          <footer className="pt-8 text-xs text-ink-muted">{t("app.poweredBy")}</footer>
        </main>
      </div>
    </>
  );
}

// Sin textos: el idioma de la ruta todavía no se conoce mientras se resuelven los params dinámicos (slug).
function Fallback() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6" aria-busy="true">
      <div className="skeleton h-10 w-48" />
      <div className="skeleton h-11 w-full" />
      <div className="skeleton h-64 w-full" />
    </div>
  );
}

export default function PublicRankingPage(props: PageProps<"/[locale]/c/[slug]/ranking">) {
  // Los params dinámicos (slug) se leen dentro de <Suspense>; por eso el idioma se fija en el componente interno.
  return (
    <Suspense fallback={<Fallback />}>
      <PublicRanking page={props} />
    </Suspense>
  );
}
