import { getFormatter, getTranslations } from "next-intl/server";
import { cx, ui } from "@/components/ui";
import type { BoardMatch } from "@/lib/tournament/board";
import { roundKeyForParticipants } from "@/lib/tournament/points";
import { utcToLocalInputs } from "@/lib/tz";

const setsText = (sets: [number, number][] | null) => (sets ?? []).map(([a, b]) => `${a}-${b}`).join("  ");

/**
 * Tablero de partidos de un torneo: arriba los que se están jugando, abajo todos en orden, agrupados por día.
 * Lo usan la vista pública (televisor, solo lectura, letra grande) y la del club, que pasa `actions` para mostrar
 * debajo de cada partido sus acciones (comenzar, cargar resultado, cambiar horario) y usa letra normal.
 */
export async function TournamentBoard<T extends BoardMatch>({
  matches, timezone, actions,
}: { matches: T[]; timezone: string; actions?: (m: T) => React.ReactNode }) {
  const t = await getTranslations();
  const format = await getFormatter();
  const tv = !actions;

  const phase = (m: BoardMatch) => {
    if (m.stage === "zona") return m.zoneName ?? t("tournaments.tv.zone");
    return t(`tournaments.bracket.round.${roundKeyForParticipants(2 ** ((m.maxRound ?? m.round) - m.round + 1))}`);
  };
  const dayOf = (m: BoardMatch) => (m.scheduledAt ? utcToLocalInputs(m.scheduledAt, timezone).date : "");
  const dayLabel = (m: BoardMatch) => format.dateTime(m.scheduledAt!, { weekday: "long", day: "numeric", month: "long", timeZone: timezone });
  const hour = (m: BoardMatch) => format.dateTime(m.scheduledAt!, { hour: "2-digit", minute: "2-digit", timeZone: timezone });
  const slot = (name: string | null, src: BoardMatch["srcA"]) => name ?? (src ? t("tournaments.bracket.slot", { position: src.position, zone: src.zone }) : t("tournaments.zones.tbd"));
  const names = (m: BoardMatch) => [slot(m.nameA, m.srcA), slot(m.nameB, m.srcB)] as const;

  const live = matches.filter((m) => m.status === "en_juego");
  const nextUp = matches.find((m) => m.status === "pendiente" && m.nameA && m.nameB);
  const days: { key: string; label: string; rows: T[] }[] = [];
  for (const m of matches) {
    const key = dayOf(m);
    let g = days.find((d) => d.key === key);
    if (!g) { g = { key, label: key ? dayLabel(m) : t("tournaments.tv.noSchedule"), rows: [] }; days.push(g); }
    g.rows.push(m);
  }
  const label = "text-sm font-semibold uppercase tracking-wide text-ink-muted";

  return (
    <div className="space-y-6">
      <section aria-labelledby="live-title" className="space-y-3">
        <h2 id="live-title" className={cx(label, tv && "lg:text-lg")}>{t("tournaments.tv.liveNow")}</h2>
        {live.length === 0 ? (
          <p className={cx(ui.card, "text-ink-muted", tv ? "text-lg lg:text-2xl" : "text-base")}>{t("tournaments.tv.noLive")}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {live.map((m, i) => {
              const [a, b] = names(m);
              return (
                <li key={i} className={cx("rounded-lg border-2 border-brand bg-brand-tint p-4", tv && "lg:p-5")}>
                  <p className={cx("flex flex-wrap items-center gap-2 text-sm font-semibold text-brand", tv && "lg:text-lg")}>
                    <span className={ui.badgeWarning}>{t("tournaments.schedule.live")}</span>
                    <span>{phase(m)}</span>
                    {m.scheduledAt && <span className="text-ink-muted">· {hour(m)}</span>}
                  </p>
                  <p className={cx("mt-2 text-xl font-bold", tv && "lg:text-3xl")}>{a}</p>
                  <p className={cx("text-sm font-semibold text-ink-muted", tv && "lg:text-xl")}>vs</p>
                  <p className={cx("text-xl font-bold", tv && "lg:text-3xl")}>{b}</p>
                  {actions && <div className="mt-3">{actions(m)}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="all-title" className="space-y-3">
        <h2 id="all-title" className={cx(label, tv && "lg:text-lg")}>{t("tournaments.tv.allMatches")}</h2>
        {matches.length === 0 ? (
          <p className="text-ink-muted">{t("tournaments.tv.empty")}</p>
        ) : (
          days.map((d) => (
            <div key={d.key || "none"} className={cx(ui.card, "overflow-hidden !p-0")}>
              <h3 className={cx("bg-surface-sunken px-4 py-2.5 text-base font-bold first-letter:uppercase", tv && "lg:text-xl")}>{d.label}</h3>
              <table className={cx("w-full text-base", tv && "lg:text-xl")}>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t("tournaments.tv.time")}</th>
                    <th scope="col">{t("tournaments.tv.phase")}</th>
                    <th scope="col">{t("tournaments.tv.match")}</th>
                    <th scope="col">{t("tournaments.tv.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.rows.map((m, i) => {
                    const [a, b] = names(m);
                    const played = m.status === "jugado";
                    const isLive = m.status === "en_juego";
                    return (
                      <tr key={i} className={cx("align-top", isLive && "bg-brand-tint font-semibold", played && "text-ink-muted")}>
                        <td className={cx("w-20 whitespace-nowrap px-4 py-3 font-display text-2xl font-bold", tv ? "lg:w-32 lg:text-4xl" : "sm:w-24")}>{m.scheduledAt ? hour(m) : "—"}</td>
                        <td className={cx("hidden w-36 px-2 py-3 text-ink-muted sm:table-cell", tv && "lg:w-56")}>{phase(m)}</td>
                        <td className="px-2 py-3">
                          <span className="text-xs font-medium text-ink-muted sm:hidden">{phase(m)}<br /></span>
                          <span className={cx(m.winner === "a" && "font-bold")}>{a}</span>
                          <span className="mx-2 text-ink-muted">vs</span>
                          <span className={cx(m.winner === "b" && "font-bold")}>{b}</span>
                          {actions && <div className="mt-2 font-normal">{actions(m)}</div>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {isLive && <span className={ui.badgeWarning}>{t("tournaments.schedule.live")}</span>}
                          {m === nextUp && <span className={ui.badgeInfo}>{t("tournaments.tv.next")}</span>}
                          {played && <span className={cx("text-sm", tv && "lg:text-lg")}>{setsText(m.sets)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
