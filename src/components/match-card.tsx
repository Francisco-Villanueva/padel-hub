import { cx, ui } from "@/components/ui";
import { WinnerMark } from "@/components/winner-mark";

/**
 * Partido como un marcador de cancha: una fila por pareja con los games de cada set en columnas. La pareja ganadora lleva la
 * corona, el nombre en negrita y el fondo resaltado; el marcador del set lo gana quien tiene más games.
 * `head` es la línea de arriba (horario, "en juego") y `menu` el botón de acciones del partido.
 */
export function MatchCard({
  a, b, winner, sets, head, menu, winnerLabel, tbdA, tbdB, className, compact, wrap,
}: {
  a: string; b: string; winner: "a" | "b" | null; sets: [number, number][] | null;
  head: React.ReactNode; menu?: React.ReactNode; winnerLabel: string; tbdA?: boolean; tbdB?: boolean; className?: string;
  /** Versión angosta para el cuadro de cruces: menos relleno y nombres más chicos. */
  compact?: boolean;
  /** Los nombres largos bajan a otra línea en vez de cortarse. */
  wrap?: boolean;
}) {
  const row = (side: "a" | "b", name: string, tbd?: boolean) => {
    const won = winner === side;
    return (
      <div className={cx("flex items-center gap-2 rounded-md px-2", compact ? "py-1" : "py-1.5", won && "bg-brand-tint")}>
        <span className="flex w-5 shrink-0 justify-center">{won ? <WinnerMark label={winnerLabel} /> : null}</span>
        <p className={cx("min-w-0 flex-1", wrap ? "break-words" : "truncate", compact ? "text-[13px]" : "text-sm", won ? "font-bold text-ink" : tbd ? "italic text-ink-muted" : "text-ink", winner && !won && "text-ink-muted")} title={name}>{name}</p>
        {(sets ?? []).map(([x, y], i) => {
          const mine = side === "a" ? x : y, other = side === "a" ? y : x;
          return <span key={i} className={cx("w-5 shrink-0 text-center font-display tabular-nums leading-none", compact ? "text-lg" : "text-xl", mine > other ? "font-bold text-ink" : "text-ink-muted")}>{mine}</span>;
        })}
      </div>
    );
  };
  return (
    <div className={cx(ui.card, "space-y-1", compact ? "!p-2 sm:!p-2" : "!p-3 sm:!p-3", className)}>
      <div className={cx("flex items-center justify-between gap-1 pl-2", compact ? "min-h-7" : "min-h-8")}>
        <div className="min-w-0 text-xs text-ink-muted">{head}</div>
        {menu}
      </div>
      {row("a", a, tbdA)}
      {row("b", b, tbdB)}
    </div>
  );
}
