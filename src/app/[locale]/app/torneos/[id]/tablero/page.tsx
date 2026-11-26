import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Icon } from "@/components/icons";
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
import { MatchMenu } from "../../_components/match-menu";
import { GroupCheck, MatchCheck, ScheduleSelection } from "../../_components/schedule-selection";
import { ruleLabel } from "../../_components/shared";
import { TvDialog } from "../../_components/tv-dialog";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El mismo tablero que ve el público (televisor), pero con las acciones del club en cada partido: comenzarlo, cargar el
 * resultado y cambiar el horario (la acción que toca ahora a la vista y el resto en el menú). Solo mientras el torneo
 * está en zonas o en llave.
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

  // Los partidos a los que se les puede poner horario (los ya jugados no); en el modo "programar varios" se eligen con casillas.
  const schedulable = matches.filter((m) => m.status !== "jugado");
  const board = (
    <TournamentBoard
      matches={matches}
      timezone={club.timezone}
      select={editable ? (m) => (m.status === "jugado" ? null : <MatchCheck id={m.id} label={`${m.nameA ?? t("tournaments.zones.tbd")} vs ${m.nameB ?? t("tournaments.zones.tbd")}`} />) : undefined}
      selectGroup={editable ? (rows, label) => <GroupCheck ids={rows.filter((m) => m.status !== "jugado").map((m) => m.id)} label={label} /> : undefined}
      actions={editable ? (m) => (
        <MatchMenu
          matchId={m.id} nameA={m.nameA ?? t("tournaments.zones.tbd")} nameB={m.nameB ?? t("tournaments.zones.tbd")} sets={m.sets}
          status={m.status} ready={m.ready} scheduled={m.scheduledAt ? utcToLocalInputs(m.scheduledAt, club.timezone) : null} compact
        />
      ) : undefined}
    />
  );

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <PageHead
        crumb={<><Link href="/app/torneos" className="hover:text-ink hover:underline">{t("tournaments.title")}</Link> / <Link href={`/app/torneos/${id}`} className="hover:text-ink hover:underline">{tr.name}</Link> / {t("tournaments.board.panelCrumb")}</>}
        title={t("tournaments.board.panelTitle")}
        description={`${tr.name} · ${ruleLabel(t, tr.categoryRuleKind, tr.categoryRuleValue)} · ${t(`tournaments.modality.${tr.modality}`)}`}
        actions={
          <>
            <Link href={`/app/torneos/${id}`} className={cx(ui.btn, ui.btnSecondary, "flex-1 sm:flex-none")}><Icon name="trophy" />{t("tournaments.board.backToTournament")}</Link>
            <TvDialog url={publicUrl} manageHref={`/app/torneos/${id}/tablero`} />
          </>
        }
      />
      {!editable && <p role="status" className={cx(ui.notice, ui.noticeInfo)}>{t("tournaments.board.readOnly")}</p>}
      {editable ? <ScheduleSelection all={schedulable.map((m) => m.id)} unscheduled={schedulable.filter((m) => !m.scheduledAt).map((m) => m.id)}>{board}</ScheduleSelection> : board}
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
