import { categoryLabel } from "@/components/category-label";
import { ui } from "@/components/ui";

type T = (key: string, values?: Record<string, string | number>) => string;
export type Person = { firstName: string; lastName: string };

/** "Pérez / Gómez": una pareja se nombra por los apellidos. */
export const pairName = (e: { player1: Person; player2: Person } | undefined | null, fallback: string) =>
  e ? `${e.player1.lastName} / ${e.player2.lastName}` : fallback;

/** "6ta" o "Suma 13". `t` es el traductor raíz (usa category.* y tournaments.rule.*). */
export function ruleLabel(t: T, kind: string, value: number) {
  return kind === "sum" ? t("tournaments.rule.sum", { n: value }) : categoryLabel(t, value);
}

const STATUS_BADGE: Record<string, string> = {
  borrador: ui.badge, inscripcion: ui.badgeInfo, zonas: ui.badgeWarning, llave: ui.badgeWarning, cerrado: ui.badgeAccent, cancelado: ui.badgeDanger,
};
export const statusBadge = (status: string) => STATUS_BADGE[status] ?? ui.badge;
