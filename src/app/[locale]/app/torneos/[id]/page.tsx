import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryLabel, categoryOptions } from "@/components/category-label";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { roundKeyForParticipants } from "@/lib/tournament/points";
import { requireFeature } from "@/server/auth/session";
import { withTenant } from "@/server/db/client";
import { tournamentPoints, tournamentView } from "@/server/services/tournament-view";
import {
  cancelTournamentAction, closeTournamentAction, generateBracketAction, openRegistrationAction, removePairAction, reopenTournamentAction,
  resolveTieAction, startTournamentAction,
} from "../actions";
import { ActionButton } from "../_components/action-button";
import { PairPicker } from "../_components/pair-picker";
import { ResultButton } from "../_components/result-button";
import { pairName, ruleLabel, statusBadge } from "../_components/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type View = NonNullable<Awaited<ReturnType<typeof tournamentView>>>;
type T = Awaited<ReturnType<typeof getTranslations>>;

const setsText = (sets: [number, number][] | null) => (sets ?? []).map(([a, b]) => `${a}-${b}`).join("  ");

async function Detalle({ params }: { params: PageProps<"/[locale]/app/torneos/[id]">["params"] }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireFeature(locale, "tournaments");
  if (!UUID.test(id)) notFound();
  const t = await getTranslations();
  const format = await getFormatter();
  const ctx = { clubId: session.clubId };
  const view = await withTenant(session.clubId, (tx) => tournamentView(tx, ctx, id));
  if (!view) notFound();
  const { tournament: tr, entries } = view;
  const status = tr.status;
  const points = status === "cerrado" ? await withTenant(session.clubId, (tx) => tournamentPoints(tx, ctx, id)) : [];

  const byId = new Map(entries.map((e) => [e.id, e]));
  const name = (entryId: string | null) => pairName(entryId ? byId.get(entryId) : null, t("tournaments.zones.tbd"));
  const missing = Math.max(0, tr.minPairs - view.activeCount);
  const zonesDone = view.zones.length > 0 && view.zones.every((z) => z.standings.complete);
  const pendingDraw = view.zones.some((z) => z.standings.needsDraw.length > 0);

  const confirmCancel = { title: t("tournaments.detail.cancelTitle"), body: t("tournaments.detail.cancelBody", { name: tr.name }), label: t("tournaments.detail.cancelConfirm") };
  const idField = { id };

  const actions = (
    <>
      {status === "borrador" && <ActionButton action={openRegistrationAction} fields={idField} variant="primary" className="flex-1 sm:flex-none">{t("tournaments.detail.openRegistration")}</ActionButton>}
      {status === "inscripcion" && <ActionButton action={startTournamentAction} fields={idField} variant="primary" disabled={missing > 0} className="flex-1 sm:flex-none">{t("tournaments.detail.start")}</ActionButton>}
      {status === "zonas" && <ActionButton action={generateBracketAction} fields={idField} variant="primary" disabled={!zonesDone || pendingDraw} className="flex-1 sm:flex-none">{t("tournaments.detail.generateBracket")}</ActionButton>}
      {status === "llave" && <ActionButton action={closeTournamentAction} fields={idField} variant="primary" className="flex-1 sm:flex-none">{t("tournaments.detail.close")}</ActionButton>}
      {status === "cerrado" && <ActionButton action={reopenTournamentAction} fields={idField} className="flex-1 sm:flex-none">{t("tournaments.detail.reopen")}</ActionButton>}
      {["borrador", "inscripcion", "zonas", "llave"].includes(status) && (
        <ActionButton action={cancelTournamentAction} fields={idField} variant="danger" confirm={confirmCancel} className="flex-1 sm:flex-none">{t("tournaments.detail.cancel")}</ActionButton>
      )}
    </>
  );

  const info = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-ink-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
  );

  return (
    <div className="space-y-6">
      <PageHead
        crumb={<><Link href="/app/torneos" className="hover:text-ink hover:underline">{t("tournaments.title")}</Link> / {tr.name}</>}
        title={<>{tr.name} <span className={cx(statusBadge(status), "align-middle")}>{t(`tournaments.status.${status}`)}</span></>}
        description={`${ruleLabel(t, tr.categoryRuleKind, tr.categoryRuleValue)} · ${t(`tournaments.modality.${tr.modality}`)}`}
        actions={actions}
      />

      {status === "cancelado" && <p role="status" className={cx(ui.notice, ui.noticeError, "enter")}>{t("tournaments.detail.cancelledNotice")}</p>}
      {status === "inscripcion" && missing > 0 && <p role="status" className={cx(ui.notice, ui.noticeWarning, "enter")}>{t("tournaments.entries.missing", { count: missing, min: tr.minPairs })}</p>}
      {status === "zonas" && pendingDraw && <p role="status" className={cx(ui.notice, ui.noticeWarning, "enter")}>{t("tournaments.zones.drawNeeded")}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className={cx(ui.card, "enter")} style={stagger(1)}>
            <h2 className="text-lg font-bold">{t("tournaments.detail.data")}</h2>
            <dl className="mt-2 divide-y divide-line">
              {info(t("tournaments.detail.date"), format.dateTime(new Date(`${tr.startsOn}T12:00:00`), { dateStyle: "medium" }))}
              {info(t("tournaments.detail.minPairs"), tr.minPairs)}
              {info(t("tournaments.detail.points"), t("tournaments.detail.pointsValue", { champion: tr.championPoints, participation: tr.participationPoints }))}
              {info(t("tournaments.detail.ranking"), tr.isRanked ? t("tournaments.ranked") : t("tournaments.notRanked"))}
            </dl>
          </section>
          <EntriesList view={view} t={t} removable={status === "inscripcion" || status === "borrador"} />
        </aside>

        <div className="space-y-6">
          {status === "inscripcion" && (
            <section className={cx(ui.card, "enter space-y-3")} style={stagger(2)}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-bold">{t("tournaments.entries.addTitle")}</h2>
                <p className="text-sm font-medium text-ink-muted">{t("tournaments.entries.count", { count: view.activeCount, min: tr.minPairs })}</p>
              </div>
              <PairPicker
                tournamentId={id}
                categories={categoryOptions(t)}
                players={view.eligible.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}`, categoryLabel: p.category ? categoryLabel(t, p.category) : "—" }))}
              />
            </section>
          )}
          {status === "borrador" && <p className={cx(ui.card, "enter text-sm text-ink-muted")}>{t("tournaments.detail.draftHint")}</p>}

          {view.zones.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold">{t("tournaments.zones.title")}</h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {view.zones.map((z, zi) => (
                  <div key={z.zone.id} className={cx(ui.card, "enter space-y-3 !p-4")} style={stagger(zi + 2)}>
                    <h3 className="text-lg font-bold">{z.zone.name}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs font-semibold text-ink-muted">
                            <th scope="col" className="w-8 py-1.5">{t("tournaments.zones.pos")}</th>
                            <th scope="col" className="py-1.5">{t("tournaments.zones.pair")}</th>
                            <th scope="col" className="px-2 py-1.5 text-right">{t("tournaments.zones.played")}</th>
                            <th scope="col" className="px-2 py-1.5 text-right">{t("tournaments.zones.wins")}</th>
                            <th scope="col" className="px-2 py-1.5 text-right">{t("tournaments.zones.diff")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {z.standings.rows.map((r, i) => (
                            <tr key={r.entryId} className={r.qualified ? "font-semibold" : undefined}>
                              <td className="py-2 text-ink-muted">{r.position ?? "·"}</td>
                              <td className="py-2">
                                {name(r.entryId)}
                                {r.qualified && <span className={cx(ui.badgeAccent, "ml-2")}>{t("tournaments.zones.qualified")}</span>}
                                {z.standings.complete && i === z.standings.rows.length - 1 && !r.qualified && r.position && <span className={cx(ui.badge, "ml-2")}>{t("tournaments.zones.out")}</span>}
                              </td>
                              <td className="px-2 py-2 text-right text-ink-muted">{r.played}</td>
                              <td className="px-2 py-2 text-right">{r.wins}</td>
                              <td className="px-2 py-2 text-right">{r.gameDiff > 0 ? `+${r.gameDiff}` : r.gameDiff}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="divide-y divide-line border-t border-line">
                      {z.matches.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                          <div className="min-w-0 text-sm">
                            <p className="text-xs font-medium text-ink-muted">{t("tournaments.zones.round", { n: m.round })}</p>
                            <p className={cx(m.winnerEntryId === m.entryAId && "font-semibold")}>{name(m.entryAId)}</p>
                            <p className={cx(m.winnerEntryId === m.entryBId && "font-semibold")}>{name(m.entryBId)}</p>
                            {m.status === "jugado" && <p className="mt-0.5 text-xs text-ink-muted">{setsText(m.sets)}</p>}
                          </div>
                          {status === "zonas" && m.entryAId && m.entryBId && (
                            <ResultButton matchId={m.id} nameA={name(m.entryAId)} nameB={name(m.entryBId)} sets={m.sets} played={m.status === "jugado"} />
                          )}
                        </li>
                      ))}
                    </ul>
                    {z.standings.needsDraw.length > 0 && status === "zonas" && (
                      <div className={cx(ui.notice, ui.noticeWarning, "space-y-2")}>
                        <p>{t("tournaments.zones.drawBody")}</p>
                        <ActionButton action={resolveTieAction} fields={{ id: z.zone.id }} variant="primary" small>{t("tournaments.zones.drawButton")}</ActionButton>
                      </div>
                    )}
                    {Boolean(z.zone.tieDraw) && <p className="text-xs text-ink-muted">{t("tournaments.zones.drawDone")}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {view.bracket.length > 0 && <Bracket view={view} t={t} name={name} editable={status === "llave"} />}

          {status === "cerrado" && (
            <section className={cx(ui.card, "enter space-y-3")}>
              <h2 className="text-xl font-bold">{t("tournaments.closed.title")}</h2>
              {!tr.isRanked ? (
                <p className="text-sm text-ink-muted">{t("tournaments.closed.notRanked")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {points.map((p) => (
                    <li key={p.playerId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-medium">{p.lastName}, {p.firstName}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-ink-muted">{p.roundReached ? t(`tournaments.rounds.${p.roundReached}`) : t("tournaments.rounds.zone")}</span>
                        <span className={ui.badgeAccent}>{t("tournaments.closed.pts", { n: p.points })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function EntriesList({ view, t, removable }: { view: View; t: T; removable: boolean }) {
  return (
    <section className={cx(ui.card, "enter")} style={stagger(2)}>
      <h2 className="text-lg font-bold">{t("tournaments.entries.title")} · {view.entries.length}</h2>
      {view.entries.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{t("tournaments.entries.none")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {view.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.player1.lastName}, {e.player1.firstName}</p>
                <p className="truncate font-medium">{e.player2.lastName}, {e.player2.firstName}</p>
                <p className="text-xs text-ink-muted">
                  {[e.player1.category, e.player2.category].map((c) => (c ? categoryLabel(t, c) : "—")).join(" + ")}
                  {e.seed ? ` · ${t("tournaments.entries.seed", { n: e.seed })}` : ""}
                </p>
              </div>
              {removable && (
                <ActionButton action={removePairAction} fields={{ id: e.id }} variant="ghost" small
                  confirm={{ title: t("tournaments.entries.removeTitle"), body: t("tournaments.entries.removeBody", { name: pairName(e, "") }), label: t("tournaments.entries.remove") }}>
                  {t("tournaments.entries.remove")}
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Bracket({ view, t, name, editable }: { view: View; t: T; name: (id: string | null) => string; editable: boolean }) {
  const rounds = Math.max(...view.bracket.map((m) => m.round));
  const columns = Array.from({ length: rounds }, (_, i) => i + 1);
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{t("tournaments.bracket.title")}</h2>
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {columns.map((r) => {
          const key = roundKeyForParticipants(2 ** (rounds - r + 1));
          const ms = view.bracket.filter((m) => m.round === r);
          return (
            <div key={r} className="w-[85%] shrink-0 snap-start space-y-3 sm:w-72">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t(`tournaments.bracket.round.${key}`)}</h3>
              {ms.map((m, i) => (
                <div key={m.id} className={cx(ui.card, "enter space-y-2 !p-3")} style={stagger(i)}>
                  {m.status === "bye" ? (
                    <p className="text-sm"><span className="font-semibold">{name(m.entryAId ?? m.entryBId)}</span> <span className={ui.badge}>{t("tournaments.bracket.bye")}</span></p>
                  ) : (
                    <>
                      <p className={cx("text-sm", m.winnerEntryId && m.winnerEntryId === m.entryAId && "font-semibold")}>{name(m.entryAId)}</p>
                      <p className={cx("text-sm", m.winnerEntryId && m.winnerEntryId === m.entryBId && "font-semibold")}>{name(m.entryBId)}</p>
                      {m.status === "jugado" && <p className="text-xs text-ink-muted">{setsText(m.sets)}</p>}
                      {editable && m.entryAId && m.entryBId && (
                        <ResultButton matchId={m.id} nameA={name(m.entryAId)} nameB={name(m.entryBId)} sets={m.sets} played={m.status === "jugado"} />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function TorneoPage({ params }: PageProps<"/[locale]/app/torneos/[id]">) {
  // El idioma se fija antes del <Suspense> (el layout raíz ya lo conoce al prerenderizar).
  setRequestLocale((await params).locale);
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <Detalle params={params} />
    </Suspense>
  );
}
