// Zonas y cuadro de cruces en la vista pública del torneo: lo mismo que ve el club, de solo lectura.
// Pensado primero para el celular: una zona por fila, nombres completos y el cuadro desplazable columna por columna.
import { getFormatter, getTranslations } from "next-intl/server";
import { ByeSlot } from "@/components/bracket-parts";
import { BracketTree } from "@/components/bracket-tree";
import { Icon } from "@/components/icons";
import { MatchCard } from "@/components/match-card";
import { ui } from "@/components/ui";
import { ZoneCard } from "@/components/zone-card";
import type { DrawMatch, PublicZone } from "@/lib/tournament/board";
import { roundKeyForParticipants } from "@/lib/tournament/points";

async function matchRenderer(timezone: string) {
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const slot = (m: DrawMatch, side: "a" | "b") => {
    const name = side === "a" ? m.nameA : m.nameB, src = side === "a" ? m.srcA : m.srcB;
    return name ?? (src ? t("tournaments.bracket.slot", { position: src.position, zone: src.zone }) : t("tournaments.zones.tbd"));
  };
  const card = (m: DrawMatch, opts: { roundLabel?: string; compact?: boolean }) => (
    <MatchCard
      key={m.id}
      a={slot(m, "a")} b={slot(m, "b")} tbdA={!m.nameA} tbdB={!m.nameB} winner={m.winner} sets={m.sets} winnerLabel={t("tournaments.winner")}
      compact={opts.compact} wrap={!opts.compact} className={opts.compact ? undefined : "!bg-surface !p-2 !shadow-none"}
      head={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {opts.roundLabel && <span className="font-medium">{opts.roundLabel}</span>}
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" className="size-3.5" />
            {m.scheduledAt
              ? <span className="font-medium text-ink">{format.dateTime(m.scheduledAt, { weekday: "short", day: "numeric", ...(opts.compact ? {} : { month: "short" }), hour: "2-digit", minute: "2-digit", timeZone: timezone })}</span>
              : t("tournaments.schedule.none")}
          </span>
          {m.status === "en_juego" && <span className={ui.badgeWarning}>{t("tournaments.schedule.live")}</span>}
        </span>
      }
    />
  );
  return { t, slot, card };
}

export async function PublicZones({ zones, timezone }: { zones: PublicZone[]; timezone: string }) {
  const { t, card } = await matchRenderer(timezone);
  const anchor = (i: number) => `zona-${i + 1}`;
  return (
    <section className="space-y-4" aria-label={t("tournaments.zones.title")}>
      {zones.length > 2 && (
        // Atajos para ir a la zona de cada uno sin recorrer toda la lista (en el celular son muchas pantallas).
        <nav aria-label={t("tournaments.zones.jump")} className="flex flex-wrap gap-2">
          {zones.map((z, i) => (
            <a key={z.name} href={`#${anchor(i)}`} className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface-raised px-3.5 text-sm font-semibold hover:bg-brand-tint sm:min-h-9">
              {z.name}
            </a>
          ))}
        </nav>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {zones.map((z, i) => (
          <ZoneCard
            key={z.name} id={anchor(i)} index={i} title={z.name} complete={z.complete} rows={z.standings}
            done={z.matches.filter((m) => m.status === "jugado").length} total={z.matches.length}
          >
            <div className="space-y-2">{z.matches.map((m) => card(m, { roundLabel: t("tournaments.zones.round", { n: m.round }) }))}</div>
            {z.drawn && <p className="text-xs text-ink-muted">{t("tournaments.zones.drawDone")}</p>}
          </ZoneCard>
        ))}
      </div>
    </section>
  );
}

export async function PublicBracket({ matches, timezone }: { matches: DrawMatch[]; timezone: string }) {
  const { t, slot, card } = await matchRenderer(timezone);
  const rounds = Math.max(...matches.map((m) => m.round));
  return (
    <section className="space-y-3 [--bracket-col:min(17.5rem,82vw)] sm:[--bracket-col:14rem]" aria-label={t("tournaments.bracket.title")}>
      {rounds > 1 && <p className="text-sm text-ink-muted lg:hidden">{t("tournaments.bracket.swipe")}</p>}
      <BracketTree
        rounds={rounds}
        matches={matches}
        // Columna casi tan ancha como la pantalla del celular (asoma la ronda siguiente); más angosta desde tablet.
        minCol="var(--bracket-col)"
        label={t("tournaments.bracket.title")}
        roundTitle={(r) => t(`tournaments.bracket.round.${roundKeyForParticipants(2 ** (rounds - r + 1))}`)}
        render={(m) => (m.status === "bye" ? <ByeSlot name={slot(m, "a")} label={t("tournaments.bracket.bye")} /> : card(m, { compact: true }))}
      />
    </section>
  );
}
