import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryLabel, categoryOptions } from "@/components/category-label";
import { Icon } from "@/components/icons";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { utcToLocalInputs } from "@/lib/tz";
import { roundKeyForParticipants } from "@/lib/tournament/points";
import { bracketSource, decodeSlot } from "@/lib/tournament/template";
import { requireFeature } from "@/server/auth/session";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { tournamentPoints, tournamentView } from "@/server/services/tournament-view";
import { closeTournamentAction, openRegistrationAction, resolveTieAction, startTournamentAction } from "../actions";
import { ActionButton } from "../_components/action-button";
import type { Option } from "../_components/adjust-dialogs";
import { BracketTree } from "../_components/bracket-tree";
import { MatchCard } from "../_components/match-card";
import { MatchMenu, type SlotEditor } from "../_components/match-menu";
import { PairPicker } from "../_components/pair-picker";
import { PairsSheet, type PairRow } from "../_components/pairs-sheet";
import { playerLabel, pairName, ruleLabel, statusBadge } from "../_components/shared";
import { TournamentMenu } from "../_components/tournament-menu";
import { TvDialog } from "../_components/tv-dialog";
import { ViewTabs } from "../_components/view-tabs";
import { ZoneMoveButton } from "../_components/zone-move";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type View = NonNullable<Awaited<ReturnType<typeof tournamentView>>>;
type Match = View["bracket"][number];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Detalle({ params, searchParams }: { params: PageProps<"/[locale]/app/torneos/[id]">["params"]; searchParams: PageProps<"/[locale]/app/torneos/[id]">["searchParams"] }) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await requireFeature(locale, "tournaments");
  if (!UUID.test(id)) notFound();
  const ctx = { clubId: session.clubId };
  // Consultas independientes: se piden a la vez (el club ya está memoizado por el layout).
  const [t, format, view, { club }] = await Promise.all([
    getTranslations(),
    getFormatter(),
    withTenant(session.clubId, (tx) => tournamentView(tx, ctx, id)),
    getClubContext(locale),
  ]);
  if (!view) notFound();
  const { tournament: tr, entries } = view;
  const status = tr.status;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const boardUrl = `${origin}/${locale}/c/${club.slug}/torneo/${id}`;
  const points = status === "cerrado" ? await withTenant(session.clubId, (tx) => tournamentPoints(tx, ctx, id)) : [];

  const byId = new Map(entries.map((e) => [e.id, e]));
  const name = (entryId: string | null) => pairName(entryId ? byId.get(entryId) : null, t("tournaments.zones.tbd"));
  const missing = Math.max(0, tr.minPairs - view.activeCount);
  const playing = status === "zonas" || status === "llave"; // zonas y llave corren a la vez
  const hasMatches = ["zonas", "llave", "cerrado"].includes(status);
  const lastRound = view.bracket.length ? Math.max(...view.bracket.map((m) => m.round)) : 0;
  const finalMatch = view.bracket.find((m) => m.round === lastRound && m.position === 0);
  const finalDone = Boolean(finalMatch?.winnerEntryId);
  const pendingDraw = view.zones.some((z) => z.standings.needsDraw.length > 0);

  const zoneByPos = new Map(view.zones.map((z) => [z.zone.position, z.zone.name]));
  const slotText = (m: Match, side: "a" | "b") => {
    const entryId = side === "a" ? m.entryAId : m.entryBId;
    if (entryId) return name(entryId);
    const src = decodeSlot(bracketSource(view.bracket, m, side)), zone = src ? zoneByPos.get(src.zone + 1) : null;
    return src && zone ? t("tournaments.bracket.slot", { position: src.position, zone }) : t("tournaments.zones.tbd");
  };
  // Lugares editables de la primera ronda (partidos sin empezar; el lado vacío de un libre no se edita).
  const firstRound = view.bracket.filter((m) => m.round === 1);
  const slotOptions = (self: Match, side: "a" | "b"): Option[] => firstRound.flatMap((m) => (["a", "b"] as const)
    .filter((s) => !(m.id === self.id && s === side) && !(m.status === "bye" && s === "b") && m.status !== "jugado" && m.status !== "en_juego")
    .map((s) => ({ value: `${m.id}:${s}`, label: `${t("tournaments.adjust.match", { n: m.position + 1 })} · ${slotText(m, s)}` })));
  const entryOptions: Option[] = entries.map((e) => ({ value: e.id, label: pairName(e, "") }));
  const slotEditors = (m: Match): SlotEditor[] => (["a", "b"] as const)
    .filter((side) => !(m.status === "jugado" || m.status === "en_juego" || (m.status === "bye" && side === "b")))
    .map((side) => ({ side, label: slotText(m, side), entries: entryOptions, slots: slotOptions(m, side), fixed: side === "a" ? m.lockA : m.lockB, hasSource: Boolean(side === "a" ? m.sourceA : m.sourceB) }));

  // Un partido como marcador: parejas, games por set, ganador con corona y, para el club, el menú de acciones.
  const matchCard = (m: Match, opts: { roundLabel?: string; bracket?: boolean; flat?: boolean; compact?: boolean }) => {
    const winner = !m.winnerEntryId ? null : m.winnerEntryId === m.entryAId ? "a" as const : "b" as const;
    const live = m.status === "en_juego";
    return (
      <MatchCard
        key={m.id}
        a={opts.bracket ? slotText(m, "a") : name(m.entryAId)} b={opts.bracket ? slotText(m, "b") : name(m.entryBId)}
        tbdA={!m.entryAId} tbdB={!m.entryBId} winner={winner} sets={m.sets} winnerLabel={t("tournaments.winner")}
        className={opts.flat ? "!bg-surface !shadow-none" : undefined} compact={opts.compact}
        head={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {opts.roundLabel && <span className="font-medium">{opts.roundLabel}</span>}
            <span className="inline-flex items-center gap-1">
              <Icon name="calendar" className="size-3.5" />
              {m.scheduledAt
                ? <span className="font-medium text-ink">{format.dateTime(m.scheduledAt, opts.compact ? { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: club.timezone } : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: club.timezone })}</span>
                : t("tournaments.schedule.none")}
            </span>
            {live && <span className={ui.badgeWarning}>{t("tournaments.schedule.live")}</span>}
          </span>
        }
        menu={playing ? (
          <MatchMenu
            matchId={m.id} nameA={name(m.entryAId)} nameB={name(m.entryBId)} sets={m.sets} status={m.status as "pendiente" | "en_juego" | "jugado"}
            ready={Boolean(m.entryAId && m.entryBId)} scheduled={m.scheduledAt ? utcToLocalInputs(m.scheduledAt, club.timezone) : null}
            slotEditors={opts.bracket && m.round === 1 ? slotEditors(m) : []} compact={opts.compact}
          />
        ) : null}
      />
    );
  };

  const idField = { id };
  const primary = (
    <>
      {status === "borrador" && <ActionButton action={openRegistrationAction} fields={idField} variant="primary" icon="userPlus" className="flex-1 sm:flex-none">{t("tournaments.detail.openRegistration")}</ActionButton>}
      {status === "inscripcion" && <ActionButton action={startTournamentAction} fields={idField} variant="primary" icon="play" disabled={missing > 0} className="flex-1 sm:flex-none">{t("tournaments.detail.start")}</ActionButton>}
      {(status === "llave" || (status === "zonas" && finalDone)) && <ActionButton action={closeTournamentAction} fields={idField} variant="primary" icon="flag" className="flex-1 sm:flex-none">{t("tournaments.detail.close")}</ActionButton>}
    </>
  );

  const pairRows: PairRow[] = entries.map((e) => ({
    id: e.id, name: pairName(e, ""), p1: { id: e.player1Id, name: playerLabel(e.player1) }, p2: { id: e.player2Id, name: playerLabel(e.player2) },
    categories: [e.player1.category, e.player2.category].map((c) => (c ? categoryLabel(t, c) : "—")).join(" + "), seed: e.seed,
  }));
  const free: Option[] = view.free.map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}${p.category ? ` · ${categoryLabel(t, p.category)}` : ""}` }));

  // Vista activa: zonas o cruces (si hay llave). Cerrado abre en cruces, porque ahí está el resultado final.
  const hasBracket = view.bracket.length > 0, hasZones = view.zones.length > 0;
  const requested = first(sp.vista);
  const vista = hasBracket && hasZones ? (requested === "zonas" || requested === "cruces" ? requested : status === "cerrado" ? "cruces" : "zonas") : hasBracket ? "cruces" : "zonas";

  const meta = (icon: "calendar" | "trophy" | "ranking", children: React.ReactNode) => (
    <span className="inline-flex items-center gap-1.5"><Icon name={icon} className="size-4 text-ink-muted" />{children}</span>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <PageHead
          crumb={<><Link href="/app/torneos" className="hover:text-ink hover:underline">{t("tournaments.title")}</Link> / {tr.name}</>}
          title={<>{tr.name} <span className={cx(statusBadge(status), "align-middle")}>{t(`tournaments.status.${status}`)}</span></>}
          description={`${ruleLabel(t, tr.categoryRuleKind, tr.categoryRuleValue)} · ${t(`tournaments.modality.${tr.modality}`)}`}
          actions={
            <>
              {hasMatches && <TvDialog url={boardUrl} manageHref={`/app/torneos/${id}/tablero`} />}
              {primary}
              <TournamentMenu
                id={id} name={tr.name} canRebuild={playing} canReopen={status === "cerrado"}
                canCancel={["borrador", "inscripcion", "zonas", "llave"].includes(status)}
              />
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
          {meta("calendar", <span className="font-medium text-ink">{format.dateTime(new Date(`${tr.startsOn}T12:00:00`), { weekday: "short", day: "numeric", month: "long" })}</span>)}
          <PairsSheet pairs={pairRows} free={free} removable={status === "inscripcion" || status === "borrador"} replaceable={playing || status === "inscripcion"} missing={status === "inscripcion" ? missing : 0} min={tr.minPairs} />
          {meta("trophy", <span>{t("tournaments.detail.pointsValue", { champion: tr.championPoints, participation: tr.participationPoints })}</span>)}
          {meta("ranking", <span>{tr.isRanked ? t("tournaments.ranked") : t("tournaments.notRanked")}</span>)}
        </div>
      </header>

      {status === "cancelado" && <p role="status" className={cx(ui.notice, ui.noticeError, "enter")}>{t("tournaments.detail.cancelledNotice")}</p>}
      {playing && pendingDraw && <p role="status" className={cx(ui.notice, ui.noticeWarning, "enter")}>{t("tournaments.zones.drawNeeded")}</p>}

      {finalDone && finalMatch && (
        <section className="enter flex items-center gap-4 rounded-lg bg-brand p-4 text-on-brand sm:p-5">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-ball text-on-ball"><Icon name="crown" className="size-6" /></span>
          <div className="min-w-0">
            <p className="text-sm font-medium opacity-90">{t("tournaments.closed.champion")}</p>
            <p className="truncate font-display text-3xl font-bold leading-tight sm:text-4xl">{name(finalMatch.winnerEntryId)}</p>
          </div>
        </section>
      )}

      {status === "inscripcion" && (
        <section className={cx(ui.card, "enter space-y-3")} style={stagger(1)}>
          <h2 className="text-xl font-bold">{t("tournaments.entries.addTitle")}</h2>
          <PairPicker
            tournamentId={id}
            categories={categoryOptions(t)}
            players={view.eligible.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}`, categoryLabel: p.category ? categoryLabel(t, p.category) : "—" }))}
          />
        </section>
      )}
      {status === "borrador" && <p className={cx(ui.card, "enter text-sm text-ink-muted")}>{t("tournaments.detail.draftHint")}</p>}

      {hasBracket && hasZones && (
        <ViewTabs
          label={t("tournaments.views.label")}
          active={vista}
          hrefFor={(key) => `/app/torneos/${id}?vista=${key}`}
          tabs={[{ key: "zonas", label: t("tournaments.views.zones"), icon: "zones" }, { key: "cruces", label: t("tournaments.views.bracket"), icon: "bracket" }]}
        />
      )}

      {hasZones && vista === "zonas" && (
        <section className="grid gap-4 xl:grid-cols-2" aria-label={t("tournaments.zones.title")}>
          {view.zones.map((z, zi) => {
            const done = z.matches.filter((m) => m.status === "jugado").length;
            const untouched = !z.matches.some((m) => m.status === "jugado" || m.status === "en_juego");
            return (
              <div key={z.zone.id} className={cx(ui.card, "enter space-y-3 !p-4")} style={stagger(zi)}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold">{z.zone.name}</h2>
                  {z.standings.complete
                    ? <span className={ui.badgeAccent}><Icon name="check" className="size-3" />{t("tournaments.zones.complete")}</span>
                    : <span className="text-xs font-medium text-ink-muted">{t("tournaments.zones.progress", { done, total: z.matches.length })}</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-ink-muted">
                        <th scope="col" className="w-7 py-1.5">{t("tournaments.zones.pos")}</th>
                        <th scope="col" className="py-1.5">{t("tournaments.zones.pair")}</th>
                        <th scope="col" className="px-2 py-1.5 text-right">{t("tournaments.zones.played")}</th>
                        <th scope="col" className="px-2 py-1.5 text-right">{t("tournaments.zones.wins")}</th>
                        <th scope="col" className="px-2 py-1.5 text-right">{t("tournaments.zones.diff")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {z.standings.rows.map((r, i) => (
                        <tr key={r.entryId} className={r.qualified ? "font-semibold" : undefined}>
                          <td className="py-1.5 text-ink-muted">{r.position ?? "·"}</td>
                          <td className="py-1.5">
                            <span className="inline-flex flex-wrap items-center gap-x-2">
                              {name(r.entryId)}
                              {r.qualified && <span className={ui.badgeAccent}>{t("tournaments.zones.qualified")}</span>}
                              {z.standings.complete && i === z.standings.rows.length - 1 && !r.qualified && r.position && <span className={ui.badge}>{t("tournaments.zones.out")}</span>}
                              {playing && untouched && (
                                <ZoneMoveButton
                                  entryId={r.entryId} name={name(r.entryId)}
                                  options={view.zones.filter((o) => o.zone.id !== z.zone.id).flatMap((o) => o.entryIds.map((eid) => ({ value: eid, label: `${name(eid)} · ${o.zone.name}` })))}
                                />
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-ink-muted">{r.played}</td>
                          <td className="px-2 py-1.5 text-right">{r.wins}</td>
                          <td className="px-2 py-1.5 text-right">{r.gameDiff > 0 ? `+${r.gameDiff}` : r.gameDiff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2">
                  {z.matches.map((m) => matchCard(m, { roundLabel: t("tournaments.zones.round", { n: m.round }), flat: true }))}
                </div>
                {z.standings.needsDraw.length > 0 && playing && (
                  <div className={cx(ui.notice, ui.noticeWarning, "space-y-2")}>
                    <p>{t("tournaments.zones.drawBody")}</p>
                    <ActionButton action={resolveTieAction} fields={{ id: z.zone.id }} variant="primary" small icon="shuffle">{t("tournaments.zones.drawButton")}</ActionButton>
                  </div>
                )}
                {Boolean(z.zone.tieDraw) && <p className="text-xs text-ink-muted">{t("tournaments.zones.drawDone")}</p>}
              </div>
            );
          })}
        </section>
      )}

      {hasBracket && vista === "cruces" && (
        <section aria-label={t("tournaments.bracket.title")}>
          <BracketTree
            rounds={lastRound}
            matches={view.bracket}
            label={t("tournaments.bracket.title")}
            roundTitle={(r) => t(`tournaments.bracket.round.${roundKeyForParticipants(2 ** (lastRound - r + 1))}`)}
            render={(m) => m.status === "bye" ? (
              <div className="flex min-h-9 items-center justify-between gap-2 rounded-lg border border-dashed border-line-strong bg-surface-raised px-3 py-1.5">
                <p className="min-w-0 truncate text-[13px] font-semibold" title={slotText(m, "a")}>{slotText(m, "a")}</p>
                <span className={ui.badge}>{t("tournaments.bracket.bye")}</span>
              </div>
            ) : matchCard(m, { bracket: true, compact: true })}
          />
        </section>
      )}

      {status === "cerrado" && tr.isRanked && points.length > 0 && (
        <details className={cx(ui.card, "enter group")}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-lg font-bold">
            <span className="inline-flex items-center gap-2"><Icon name="ranking" className="size-5" />{t("tournaments.closed.title")}</span>
            <span className="text-sm font-medium text-ink-muted group-open:hidden">{t("tournaments.closed.show")}</span>
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {points.map((p) => (
              <li key={p.playerId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium">{playerLabel(p)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-ink-muted">{p.roundReached ? t(`tournaments.rounds.${p.roundReached}`) : t("tournaments.rounds.zone")}</span>
                  <span className={ui.badgeAccent}>{t("tournaments.closed.pts", { n: p.points })}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {status === "cerrado" && !tr.isRanked && <p className="text-sm text-ink-muted">{t("tournaments.closed.notRanked")}</p>}
    </div>
  );
}

export default async function TorneoPage({ params, searchParams }: PageProps<"/[locale]/app/torneos/[id]">) {
  // El idioma se fija antes del <Suspense> (el layout raíz ya lo conoce al prerenderizar).
  setRequestLocale((await params).locale);
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <Detalle params={params} searchParams={searchParams} />
    </Suspense>
  );
}
