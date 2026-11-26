import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons";
import { cx, stagger, ui } from "@/components/ui";
import type { ZoneRow } from "@/lib/tournament/board";

/**
 * Tarjeta de una zona: nombre y avance, tabla de posiciones y, como hijos, sus partidos. La comparten el panel del club
 * (que agrega acciones por fila con `rowAction`) y la vista pública, de solo lectura.
 */
export async function ZoneCard<R extends ZoneRow>({
  id, title, complete, done, total, rows, rowAction, index, children,
}: {
  /** Ancla para saltar a la zona; deja lugar a las pestañas fijas de la vista pública. */
  id?: string; title: string; complete: boolean; done: number; total: number; rows: R[]; rowAction?: (row: R) => React.ReactNode; index: number; children: React.ReactNode;
}) {
  const t = await getTranslations("tournaments.zones");
  return (
    <div id={id} className={cx(ui.card, "enter min-w-0 scroll-mt-20 space-y-3 !p-3 sm:!p-4")} style={stagger(index)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {complete
          ? <span className={ui.badgeAccent}><Icon name="check" className="size-3" />{t("complete")}</span>
          : <span className="text-xs font-medium text-ink-muted">{t("progress", { done, total })}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-ink-muted">
              <th scope="col" className="w-7 py-1.5">{t("pos")}</th>
              <th scope="col" className="py-1.5">{t("pair")}</th>
              <th scope="col" className="px-1.5 py-1.5 text-right sm:px-2">{t("played")}</th>
              <th scope="col" className="px-1.5 py-1.5 text-right sm:px-2">{t("wins")}</th>
              <th scope="col" className="py-1.5 pl-1.5 text-right sm:px-2">{t("diff")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={r.entryId} className={r.qualified ? "font-semibold" : undefined}>
                <td className="py-1.5 text-ink-muted">{r.position ?? "·"}</td>
                <td className="py-1.5">
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    {r.name}
                    {r.qualified && <span className={ui.badgeAccent}>{t("qualified")}</span>}
                    {complete && i === rows.length - 1 && !r.qualified && r.position && <span className={ui.badge}>{t("out")}</span>}
                    {rowAction?.(r)}
                  </span>
                </td>
                <td className="px-1.5 py-1.5 text-right text-ink-muted sm:px-2">{r.played}</td>
                <td className="px-1.5 py-1.5 text-right sm:px-2">{r.wins}</td>
                <td className="py-1.5 pl-1.5 text-right sm:px-2">{r.gameDiff > 0 ? `+${r.gameDiff}` : r.gameDiff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  );
}
