import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryLabel } from "@/components/category-label";
import { AutoRefresh } from "@/components/auto-refresh";
import { ClubMark } from "@/components/club-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TournamentBoard } from "@/components/tournament-board";
import { clubBrandCss } from "@/lib/color";
import { withPlatform } from "@/server/db/client";
import { publicTournamentBoard, publicTournamentInfo } from "@/server/services/public-board";
import { publicRankingClub } from "@/server/services/public-ranking";

// Tablero del torneo para el televisor del club y para los jugadores. Link por id (no se indexa).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Sin textos: el idioma de la ruta todavía no se conoce mientras se resuelven los params dinámicos (slug, id).
function Fallback() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6" aria-busy="true">
      <div className="skeleton h-10 w-64" />
      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-72 w-full" />
    </div>
  );
}

async function Board({ page }: { page: PageProps<"/[locale]/c/[slug]/torneo/[id]"> }) {
  // Las props se leen acá adentro (dentro de <Suspense>): leerlas en la página bloquearía el prerender (slug e id son dinámicos).
  const { locale, slug, id } = await page.params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const club = await withPlatform((tx) => publicRankingClub(tx, slug));
  const info = club ? await withPlatform((tx) => publicTournamentInfo(tx, slug, id)) : null;
  if (!club || !info) notFound();
  const matches = await withPlatform((tx) => publicTournamentBoard(tx, slug, id));
  const brandCss = clubBrandCss(club.colorPrimary, club.colorAccent);
  const rule = info.ruleKind === "sum" ? t("tournaments.rule.sum", { n: info.ruleValue }) : categoryLabel(t, info.ruleValue);

  return (
    <>
      {brandCss && <style>{brandCss}</style>}
      <AutoRefresh seconds={20} />
      <div className="club-brand flex min-h-dvh flex-col bg-surface text-ink">
        <header className="bg-brand text-on-brand">
          <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <ClubMark name={club.name} logoUrl={club.logoUrl} tone="ink" />
              <span className="truncate text-base font-semibold">{club.name}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 lg:py-8">
          <div className="space-y-1">
            <h1 className="font-display text-4xl font-bold leading-none lg:text-6xl">{info.name}</h1>
            <p className="text-lg text-ink-muted lg:text-2xl">{rule} · {t(`tournaments.modality.${info.modality}`)}</p>
          </div>
          <TournamentBoard matches={matches} timezone={info.timezone} />
          <footer className="pt-4 text-xs text-ink-muted">{t("tournaments.tv.autoRefresh")} · {t("app.poweredBy")}</footer>
        </main>
      </div>
    </>
  );
}

export default function PublicTournamentPage(props: PageProps<"/[locale]/c/[slug]/torneo/[id]">) {
  return (
    <Suspense fallback={<Fallback />}>
      <Board page={props} />
    </Suspense>
  );
}
