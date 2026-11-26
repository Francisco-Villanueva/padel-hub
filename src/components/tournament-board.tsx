import { getFormatter, getTranslations } from "next-intl/server";
import { cx, ui } from "@/components/ui";
import { WinnerMark } from "@/components/winner-mark";
import type { BoardMatch } from "@/lib/tournament/board";
import { roundKeyForParticipants } from "@/lib/tournament/points";
import { utcToLocalInputs } from "@/lib/tz";

/**
 * Tablero de partidos de un torneo: arriba los que se están jugando, abajo todos en orden, agrupados por día.
 * Lo usan la vista pública (televisor, solo lectura, letra grande) y la del club, que pasa `actions` para mostrar a la
 * derecha de cada partido sus acciones (comenzar, cargar resultado, cambiar horario) y usa letra normal.
 * Cada partido es un marcador: una fila por pareja con los games de cada set pegados al nombre, la ganadora con corona.
 */
export async function TournamentBoard<T extends BoardMatch>({
  matches, timezone, actions, select, selectGroup,
}: {
  matches: T[]; timezone: string; actions?: (m: T) => React.ReactNode;
  /** Casilla para elegir un partido (modo "programar varios" del club). */
  select?: (m: T) => React.ReactNode;
  /** Casilla para elegir todos los partidos de un día. */
  selectGroup?: (rows: T[], label: string) => React.ReactNode;
}) {
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

  /** Marcador del partido: una fila por pareja y los games de cada set en columnas, pegados al nombre. */
  const teams = (m: BoardMatch) => (
    <div className={cx("w-full", tv ? "max-w-xl lg:max-w-3xl" : "max-w-md")}>
      {(["a", "b"] as const).map((side, i) => {
        const won = m.winner === side;
        const name = names(m)[i];
        const tbd = !(side === "a" ? m.nameA : m.nameB);
        return (
          <div key={side} className={cx("flex items-center gap-2 rounded-md px-2", tv ? "py-1 lg:py-1.5" : "py-1", won && "bg-brand-tint")}>
            <span className={cx("flex w-5 shrink-0 justify-center", tv && "lg:w-7")}>{won && <WinnerMark label={t("tournaments.winner")} className={tv ? "lg:size-7" : undefined} />}</span>
            <p className={cx("min-w-0 flex-1 truncate", won ? "font-bold text-ink" : tbd ? "italic text-ink-muted" : m.winner ? "text-ink-muted" : "text-ink")} title={name}>{name}</p>
            {(m.sets ?? []).map(([x, y], k) => {
              const mine = side === "a" ? x : y, other = side === "a" ? y : x;
              return <span key={k} className={cx("w-6 shrink-0 text-center font-display text-xl tabular-nums leading-none", tv && "lg:w-9 lg:text-3xl", mine > other ? "font-bold text-ink" : "text-ink-muted")}>{mine}</span>;
            })}
          </div>
        );
      })}
    </div>
  );

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
            {live.map((m, i) => (
              <li key={i} className={cx("rounded-lg border-2 border-brand bg-brand-tint p-3", tv && "lg:p-5", tv ? "text-xl font-bold lg:text-3xl" : "text-base font-semibold")}>
                <div className="mb-2 flex min-h-9 items-center justify-between gap-2">
                  <p className={cx("flex flex-wrap items-center gap-2 text-sm font-semibold text-brand", tv && "lg:text-lg")}>
                    <span className={ui.badgeWarning}>{t("tournaments.schedule.live")}</span>
                    <span>{phase(m)}</span>
                    {m.scheduledAt && <span className="text-ink-muted">{hour(m)}</span>}
                  </p>
                  {actions?.(m)}
                </div>
                <div className="rounded-md bg-surface-raised/70 p-1">{teams(m)}</div>
              </li>
            ))}
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
              <div className="flex items-center justify-between gap-3 bg-surface-sunken px-4 py-2.5">
                <h3 className={cx("text-base font-bold first-letter:uppercase", tv && "lg:text-xl")}>{d.label}</h3>
                {selectGroup?.(d.rows, d.label)}
              </div>
              <ul className={cx("divide-y divide-line text-base", tv && "lg:text-xl")}>
                {d.rows.map((m, i) => {
                  const isLive = m.status === "en_juego";
                  const badges = (isLive || m === nextUp) && (
                    <span className="flex items-center gap-2">
                      {isLive && <span className={ui.badgeWarning}>{t("tournaments.schedule.live")}</span>}
                      {m === nextUp && <span className={ui.badgeInfo}>{t("tournaments.tv.next")}</span>}
                    </span>
                  );
                  return (
                    <li
                      key={i}
                      className={cx(
                        "grid items-center gap-x-3 px-4 py-3",
                        tv ? "grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:grid-cols-[5.5rem_8rem_minmax(0,1fr)_auto] lg:grid-cols-[8rem_14rem_minmax(0,1fr)_auto]" : "grid-cols-[6.25rem_minmax(0,1fr)_auto] sm:grid-cols-[7rem_8rem_minmax(0,1fr)_auto]",
                        isLive && "bg-brand-tint",
                      )}
                    >
                      <span className={cx("flex items-center gap-2 font-display text-2xl font-bold", tv && "lg:text-4xl", m.status === "jugado" && "text-ink-muted")}>{select?.(m)}{m.scheduledAt ? hour(m) : "—"}</span>
                      <span className={cx("hidden text-ink-muted sm:block", tv && "lg:text-xl")}>{phase(m)}</span>
                      <div className="min-w-0">
                        <p className="mb-0.5 px-2 text-xs font-medium text-ink-muted sm:hidden">{phase(m)}</p>
                        {teams(m)}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        {badges}
                        {actions?.(m)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
