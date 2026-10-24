"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cx, ui } from "@/components/ui";
import { GENDERS, POSITIONS, SLOTS } from "@/lib/player-schema";

export type FilterValues = { q: string; category: string; gender: string; position: string; slot: string };
type Option = { id: string; label: string };

// Los filtros viven en la URL (enlazables y con botón "atrás"). Cada cambio vuelve a la página 1.
export function FilterBar({ initial, categories }: { initial: FilterValues; categories: Option[] }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [values, setValues] = useState(initial);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const activeCount = (["category", "gender", "position", "slot"] as const).filter((k) => values[k]).length;

  function push(next: FilterValues) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    start(() => router.replace(sp.size ? `${pathname}?${sp}` : pathname));
  }
  function change(key: keyof FilterValues, value: string, debounce = false) {
    const next = { ...values, [key]: value };
    setValues(next);
    clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(() => push(next), 350);
    else push(next);
  }
  function clear() {
    const empty = { q: "", category: "", gender: "", position: "", slot: "" };
    setValues(empty);
    push(empty);
  }

  // La primera opción ("Todas las categorías") ya nombra el filtro: la etiqueta queda solo para lectores de pantalla.
  const select = (key: keyof FilterValues, label: string, allLabel: string, options: Option[]) => (
    <div>
      <label htmlFor={`f-${key}`} className="sr-only">{label}</label>
      <select
        id={`f-${key}`}
        className={cx(ui.input, values[key] && "border-brand/60 bg-brand-tint/40 font-medium")}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <section aria-label={t("players.filters")} className="relative space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            inputMode="search"
            aria-label={t("players.search")}
            placeholder={t("players.search")}
            className={cx(ui.input, "pl-9")}
            value={values.q}
            onChange={(e) => change("q", e.target.value, true)}
          />
          {/* Barra de progreso fina mientras se actualizan los resultados */}
          <span
            aria-hidden
            className={cx("pointer-events-none absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full transition-opacity duration-200", pending ? "opacity-100" : "opacity-0")}
          >
            <span className="block h-full w-2/5 animate-[sweep_1s_ease-in-out_infinite] rounded-full bg-brand" />
          </span>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen((o) => !o)}
          className={cx(ui.btn, ui.btnSecondary, "shrink-0 md:hidden")}
        >
          {t("players.filters")}{activeCount > 0 && <span className={ui.badgeAccent}>{activeCount}</span>}
        </button>
      </div>

      {/* Celular: panel plegable con animación de altura. Tablet y escritorio: siempre visible, en 2 / 4 columnas. */}
      <div
        id="filter-panel"
        className={cx(
          "grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out md:visible md:grid-rows-[1fr] md:opacity-100",
          open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="-m-1 grid grid-cols-1 gap-2.5 p-1 min-[480px]:grid-cols-2 lg:grid-cols-4">
            {select("category", t("players.category"), t("players.allCategories"), categories)}
            {select("gender", t("players.gender"), t("players.allGenders"), GENDERS.map((g) => ({ id: g, label: t(`gender.${g}`) })))}
            {select("position", t("players.position"), t("players.allPositions"), POSITIONS.map((p) => ({ id: p, label: t(`position.${p}`) })))}
            {select("slot", t("players.slot"), t("players.allSlots"), SLOTS.map((s) => ({ id: s, label: t(`slot.${s}`) })))}
          </div>
        </div>
      </div>

      <div className={cx("grid transition-[grid-template-rows,opacity] duration-300 ease-out", activeCount > 0 || values.q ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-h-0 overflow-hidden">
          <button type="button" onClick={clear} tabIndex={activeCount > 0 || values.q ? 0 : -1} className={cx(ui.link, "text-sm")}>
            {t("players.clear")}
          </button>
        </div>
      </div>
    </section>
  );
}
