import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { CopyButton } from "@/components/copy-button";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { TournamentBoard } from "@/components/tournament-board";
import { cx, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { utcToLocalInputs } from "@/lib/tz";
import { requireFeature } from "@/server/auth/session";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { panelBoardMatches, tournamentView } from "@/server/services/tournament-view";
import { setLiveAction } from "../../actions";
import { ActionButton } from "../../_components/action-button";
import { ScheduleButton } from "../../_components/match-tools";
import { ResultButton } from "../../_components/result-button";
import { ruleLabel } from "../../_components/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El mismo tablero que ve el público (televisor), pero con las acciones del club en cada partido:
 * comenzar el partido, cargar el resultado y cambiar el horario. Solo mientras el torneo está en zonas o en llave.
 */
async function Tablero({ params }: { params: PageProps<"/[locale]/app/torneos/[id]/tablero">["params"] }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireFeature(locale, "tournaments");
  if (!UUID.test(id)) notFound();
  const t = await getTranslations();
  const { club } = await getClubContext(locale);
  const view = await withTenant(session.clubId, (tx) => tournamentView(tx, { clubId: session.clubId }, id));
  if (!view) notFound();
  const { tournament: tr } = view;
  // Sin partidos todavía (borrador o inscripción): se vuelve al torneo.
  if (!["zonas", "llave", "cerrado"].includes(tr.status)) redirect(`/${locale}/app/torneos/${id}`);
  const editable = tr.status === "zonas" || tr.status === "llave";

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const publicUrl = `${origin}/${locale}/c/${club.slug}/torneo/${id}`;
  const matches = panelBoardMatches(view);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <PageHead
        crumb={<><Link href="/app/torneos" className="hover:text-ink hover:underline">{t("tournaments.title")}</Link> / <Link href={`/app/torneos/${id}`} className="hover:text-ink hover:underline">{tr.name}</Link> / {t("tournaments.board.panelCrumb")}</>}
        title={t("tournaments.board.panelTitle")}
        description={`${tr.name} · ${ruleLabel(t, tr.categoryRuleKind, tr.categoryRuleValue)} · ${t(`tournaments.modality.${tr.modality}`)}`}
        actions={
          <>
            <Link href={`/app/torneos/${id}`} className={cx(ui.btn, ui.btnSecondary, "flex-1 sm:flex-none")}>{t("tournaments.board.backToTournament")}</Link>
            <a href={publicUrl} target="_blank" rel="noreferrer" className={cx(ui.btn, ui.btnSecondary, "flex-1 sm:flex-none")}>{t("tournaments.board.open")}</a>
            <CopyButton value={publicUrl} className="flex-1 sm:flex-none" />
          </>
        }
      />
      {!editable && <p role="status" className={cx(ui.notice, ui.noticeInfo)}>{t("tournaments.board.readOnly")}</p>}
      <TournamentBoard
        matches={matches}
        timezone={club.timezone}
        actions={editable ? (m) => {
          const label = `${m.nameA ?? t("tournaments.zones.tbd")} vs ${m.nameB ?? t("tournaments.zones.tbd")}`;
          return (
            <div className="flex flex-wrap items-center gap-2">
              {m.ready && m.status === "pendiente" && (
                <ActionButton action={setLiveAction} fields={{ id: m.id, live: "1" }} variant="primary" small>{t("tournaments.schedule.startLive")}</ActionButton>
              )}
              {m.ready && m.status === "en_juego" && (
                <ActionButton action={setLiveAction} fields={{ id: m.id, live: "0" }} variant="ghost" small>{t("tournaments.schedule.stopLive")}</ActionButton>
              )}
              {m.ready && (
                <ResultButton matchId={m.id} nameA={m.nameA ?? ""} nameB={m.nameB ?? ""} sets={m.sets} played={m.status === "jugado"} />
              )}
              <ScheduleButton matchId={m.id} label={label} scheduled={m.scheduledAt ? utcToLocalInputs(m.scheduledAt, club.timezone) : null} />
            </div>
          );
        } : undefined}
      />
    </div>
  );
}

export default async function TableroPage({ params }: PageProps<"/[locale]/app/torneos/[id]/tablero">) {
  // El idioma se fija antes del <Suspense> (el layout raíz ya lo conoce al prerenderizar).
  setRequestLocale((await params).locale);
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <Tablero params={params} />
    </Suspense>
  );
}
