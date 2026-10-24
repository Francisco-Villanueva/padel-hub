"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { initials } from "@/components/avatar";
import { Avatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { usePathname, useRouter } from "@/i18n/navigation";
import { GENDERS, POSITIONS, SLOTS } from "@/lib/player-schema";
import { logContactAction } from "./actions";

export type Candidate = {
  id: string;
  name: string;
  locality: string | null;
  tags: string[];
  /** https://wa.me/<número>, sin texto: el mensaje se arma acá según el "cuándo". */
  wa: string;
  /** Texto relativo del último contacto, ya en el idioma de la interfaz (null = nunca). */
  contactedText: string | null;
  /** Contactado en la última semana: se resalta para no insistirle a la misma persona. */
  contactedRecently: boolean;
};

type Filters = { category: string; gender: string; position: string; slot: string };
type Option = { id: string; label: string };

const SEATS = 4;

const Check = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
);
const Chat = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
);

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx(ui.chip, "min-h-12 sm:min-h-10", active && ui.chipActive)}>
      {active && <Check />}
      {children}
    </button>
  );
}

function FilterControls({ filters, categories, onChange, idPrefix }: { filters: Filters; categories: Option[]; onChange: (k: keyof Filters, v: string) => void; idPrefix: string }) {
  const t = useTranslations();
  const toggle = (k: keyof Filters, v: string) => onChange(k, filters[k] === v ? "" : v);
  const group = (legend: string, key: keyof Filters, values: readonly string[], label: (v: string) => string) => (
    <fieldset>
      <legend className={ui.label}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => <ToggleChip key={v} active={filters[key] === v} onClick={() => toggle(key, v)}>{label(v)}</ToggleChip>)}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${idPrefix}-cat`} className={ui.label}>{t("players.category")}</label>
        <select id={`${idPrefix}-cat`} className={ui.input} value={filters.category} onChange={(e) => onChange("category", e.target.value)}>
          <option value="">{t("cuarto.allCategories")}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      {group(t("players.gender"), "gender", GENDERS, (v) => t(`gender.${v}`))}
      {group(t("players.position"), "position", POSITIONS, (v) => t(`position.${v}`))}
      {group(t("players.slot"), "slot", SLOTS, (v) => t(`slot.${v}`))}
    </div>
  );
}

export function CuartoBoard({
  candidates, total, shown, categories, initial, summary, clubName,
}: { candidates: Candidate[]; total: number; shown: number; categories: Option[]; initial: Filters; summary: string; clubName: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [filters, setFilters] = useState(initial);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lineup, setLineup] = useState<{ id: string; name: string }[]>([]);
  const [when, setWhen] = useState("");
  const [contactedNow, setContactedNow] = useState<Set<string>>(new Set());

  // Los filtros viven en la URL: se pueden compartir y el servidor devuelve los candidatos ya ordenados.
  function changeFilter(k: keyof Filters, v: string) {
    const next = { ...filters, [k]: v };
    setFilters(next);
    const sp = new URLSearchParams();
    for (const [key, val] of Object.entries(next)) if (val) sp.set(key, val);
    start(() => router.replace(sp.size ? `${pathname}?${sp}` : pathname));
  }

  const missing = SEATS - lineup.length;
  const inLineup = new Set(lineup.map((p) => p.id));
  const visible = candidates.filter((c) => !inLineup.has(c.id));
  const add = (c: Candidate) => lineup.length < SEATS && setLineup((l) => [...l, { id: c.id, name: c.name }]);
  const remove = (id: string) => setLineup((l) => l.filter((p) => p.id !== id));

  function messageFor(c: Candidate) {
    const name = c.name.split(" ")[0];
    return when.trim() ? t("cuarto.messageWhen", { name, when: when.trim() }) : t("cuarto.messageNoWhen", { name, club: clubName });
  }
  function onWrite(c: Candidate) {
    // El enlace se abre en el mismo gesto de la persona; el registro del contacto va aparte y no lo demora.
    setContactedNow((s) => new Set(s).add(c.id));
    void logContactAction(c.id, locale);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className={cx(ui.card, "space-y-4")}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{t("cuarto.match")}</h2>
            <span className={missing > 0 ? ui.badgeBall : ui.badgeAccent}>{missing > 0 ? t("cuarto.missing", { count: missing }) : t("cuarto.complete")}</span>
          </div>
          <ul className="grid grid-cols-4 gap-2">
            {Array.from({ length: SEATS }, (_, i) => {
              const p = lineup[i];
              return (
                <li key={i}>
                  {p ? (
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label={t("cuarto.remove", { name: p.name })}
                      className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-md bg-brand-tint p-1.5 text-center text-xs font-semibold text-brand transition-colors hover:brightness-95"
                    >
                      <span className="text-sm font-bold">{initials(p.name)}</span>
                      <span className="line-clamp-2 text-ink">{p.name}</span>
                    </button>
                  ) : (
                    <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-xs font-medium text-ink-muted">
                      <span aria-hidden className="text-xl leading-none">+</span>
                      {t("cuarto.free")}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div>
            <label htmlFor="when" className={ui.label}>{t("cuarto.when")}</label>
            <input id="when" value={when} onChange={(e) => setWhen(e.target.value)} maxLength={60} placeholder={t("cuarto.whenPlaceholder")} className={ui.input} />
          </div>
        </section>

        {/* Escritorio: filtros siempre visibles. Celular y tablet: resumen y botón que abre una hoja. */}
        <section className={cx(ui.card, "hidden space-y-4 lg:block")}>
          <h2 className="text-xl font-bold">{t("cuarto.filters")}</h2>
          <FilterControls filters={filters} categories={categories} onChange={changeFilter} idPrefix="d" />
        </section>
        <div className={cx(ui.card, "flex items-center justify-between gap-3 !p-3 lg:hidden")}>
          <p className="min-w-0 truncate text-sm text-ink-muted">{summary}</p>
          <button type="button" onClick={() => setFiltersOpen(true)} className={cx(ui.btn, ui.btnSecondary, "shrink-0")}>{t("cuarto.filters")}</button>
        </div>
        <Modal
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title={t("cuarto.filters")}
          actions={<button type="button" onClick={() => setFiltersOpen(false)} className={cx(ui.btn, ui.btnPrimary)}>{t("common.close")}</button>}
        >
          <FilterControls filters={filters} categories={categories} onChange={changeFilter} idPrefix="m" />
        </Modal>
      </div>

      <section aria-busy={pending} className={cx("space-y-3 transition-opacity", pending && "opacity-60")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-xl font-bold">{t("cuarto.candidates", { count: total })}</h2>
          <p className="hidden text-sm text-ink-muted sm:block">{t("cuarto.sortHint")}</p>
        </div>
        {missing === 0 && <p role="status" className={cx(ui.notice, ui.noticeOk)}>{t("cuarto.full")}</p>}
        {visible.length === 0 ? (
          <div className="py-12 text-center">
            <h3 className="text-lg font-semibold">{t("cuarto.empty")}</h3>
            <p className="mt-1 text-sm text-ink-muted">{t("cuarto.emptyHint")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map((c) => {
              const contacted = contactedNow.has(c.id);
              return (
                <li key={c.id} className="rounded-lg border border-line bg-surface-raised p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.name}{c.locality && <span className="ml-2 text-sm font-normal text-ink-muted">{c.locality}</span>}</p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.tags.map((tag) => <span key={tag} className={ui.badge}>{tag}</span>)}
                      </p>
                    </div>
                    {(contacted || c.contactedText) && (
                      <span className={c.contactedRecently || contacted ? ui.badgeWarning : ui.badge}>
                        {contacted ? t("cuarto.contacted", { when: t("cuarto.now") }) : t("cuarto.contacted", { when: c.contactedText ?? "" })}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-[auto_1fr] gap-2 sm:flex sm:justify-end">
                    <button type="button" onClick={() => add(c)} disabled={missing === 0} className={cx(ui.btn, ui.btnSecondary)}>+ {t("cuarto.add")}</button>
                    <a
                      href={`${c.wa}?text=${encodeURIComponent(messageFor(c))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onWrite(c)}
                      className={cx(ui.btn, ui.btnWhatsapp)}
                      aria-label={`${t("cuarto.writeLong")}: ${c.name}`}
                    >
                      <Chat />
                      <span className="sm:hidden">{t("cuarto.writeLong")}</span>
                      <span className="hidden sm:inline">{t("cuarto.write")}</span>
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {shown < total && <p className="text-center text-sm text-ink-muted">{t("cuarto.shown", { shown, total })}</p>}
      </section>
    </div>
  );
}
