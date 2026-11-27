import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryLabel } from "@/components/category-label";
import { AutoRefresh } from "@/components/auto-refresh";
import { ChampionBanner } from "@/components/bracket-parts";
import { ClubMark } from "@/components/club-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PublicBracket, PublicZones } from "@/components/public-draw";
import { TournamentBoard } from "@/components/tournament-board";
import { cx } from "@/components/ui";
import { ViewTabs, type ViewTab } from "@/components/view-tabs";
import { clubBrandCss } from "@/lib/color";
import { loadPublicBoard } from "@/server/services/public-cache";

// Vista pública del torneo (partidos, zonas y cruces), para el televisor del club y para los jugadores. Link por id (no se indexa).
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
  const [{ locale, slug, id }, { vista: rawView }] = await Promise.all([page.params, page.searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations();
  // Datos cacheados unos segundos en el servidor: cada televisor se actualiza solo y no debe ir a la base cada vez.
  const data = await loadPublicBoard(slug, id);
  if (!data) notFound();
  const { club, info, matches, draw } = data;
  const brandCss = clubBrandCss(club.colorPrimary, club.colorAccent);
  const rule = info.ruleKind === "sum" ? t("tournaments.rule.sum", { n: info.ruleValue }) : categoryLabel(t, info.ruleValue);

  // Pestañas: solo las que tienen algo para mostrar. Sin ?vista (o con una que no existe) se abre el tablero de partidos.
  const tabs: ViewTab[] = [
    { key: "partidos", label: t("tournaments.views.matches"), icon: "scoreboard" },
    ...(draw.zones.length ? [{ key: "zonas", label: t("tournaments.views.zones"), icon: "zones" } as const] : []),
    ...(draw.bracket.length ? [{ key: "cruces", label: t("tournaments.views.bracket"), icon: "bracket" } as const] : []),
  ];
  const requested = Array.isArray(rawView) ? rawView[0] : rawView;
  const view = tabs.find((tab) => tab.key === requested)?.key ?? "partidos";

  const lastRound = Math.max(0, ...draw.bracket.map((m) => m.round));
  const final = draw.bracket.find((m) => m.round === lastRound && m.position === 0);
  const champion = final?.winner ? (final.winner === "a" ? final.nameA : final.nameB) : null;
  // El cuadro de cruces aprovecha todo el ancho en pantallas grandes (hasta 5 o 6 rondas).
  const width = view === "cruces" ? "max-w-[100rem]" : "max-w-6xl";

  return (
    <>
      {brandCss && <style>{brandCss}</style>}
      <AutoRefresh seconds={20} />
      <div className="club-brand flex min-h-dvh flex-col bg-surface text-ink">
        <header className="bg-brand text-on-brand">
          <div className={cx("mx-auto flex min-h-16 items-center justify-between gap-3 px-4", width)}>
            <div className="flex min-w-0 items-center gap-3">
              <ClubMark name={club.name} logoUrl={club.logoUrl} tone="ink" />
              <span className="truncate text-base font-semibold">{club.name}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </header>
        <main className={cx("mx-auto flex w-full flex-1 flex-col gap-4 px-4 py-5 sm:gap-6 sm:py-6 lg:py-8", width)}>
          <div className="space-y-1">
            <h1 className="font-display text-4xl font-bold leading-none lg:text-6xl">{info.name}</h1>
            <p className="text-lg text-ink-muted lg:text-2xl">{rule} · {t(`tournaments.modality.${info.modality}`)}</p>
          </div>
          {tabs.length > 1 && (
            // Quedan fijas arriba al bajar: en el celular se cambia de vista sin volver al principio.
            <div className="sticky top-0 z-20 -mx-4 bg-surface px-4 py-2">
              <ViewTabs stretch toTop label={t("tournaments.views.label")} active={view} hrefFor={(key) => `/c/${slug}/torneo/${id}?vista=${key}`} tabs={tabs} />
            </div>
          )}
          {champion && <ChampionBanner label={t("tournaments.closed.champion")} name={champion} />}
          {view === "partidos" && <TournamentBoard matches={matches} timezone={info.timezone} />}
          {view === "zonas" && <PublicZones zones={draw.zones} timezone={info.timezone} />}
          {view === "cruces" && <PublicBracket matches={draw.bracket} timezone={info.timezone} />}
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
