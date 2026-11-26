"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { parsePairList, type NameOrder, type ParsedPair } from "@/lib/tournament/pair-list";
import { registerPairsAction, type TState } from "../actions";
import { useErrorText } from "./action-button";
import type { Option } from "./adjust-dialogs";
import { PairMenu, type PairRow } from "./pair-menu";

type Gender = "male" | "female";
type Cat = { id: string; label: string };
type RowResult = { ok: true; entryId: string; created: number; reused: number } | { ok: false; error: string; detail?: Record<string, unknown> };
interface Ref { firstName?: string; lastName: string; gender?: Gender; category?: number | null }
interface RowInput { p1: Ref; p2: Ref }

/** Género por defecto de cada jugador según la modalidad del torneo (se puede cambiar en la fila). */
const defaultGender = (modality: string, slot: 1 | 2): Gender => (modality === "femenino" ? "female" : modality === "mixto" && slot === 2 ? "female" : "male");

/** Manda filas al servidor y devuelve el resultado de cada una (en el mismo orden). */
async function send(tournamentId: string, locale: string, rows: RowInput[]): Promise<{ results: RowResult[] } | { error: TState }> {
  const fd = new FormData();
  fd.set("locale", locale); fd.set("id", tournamentId); fd.set("rows", JSON.stringify(rows));
  const res = await registerPairsAction({ status: "idle" }, fd);
  if (res.status !== "ok" || !res.data?.results) return { error: res };
  return { results: JSON.parse(res.data.results) as RowResult[] };
}

/** Mensaje de error de una fila: el código del servicio, y para una pareja inválida, el motivo. */
function useRowError() {
  const errorText = useErrorText();
  return (r: Extract<RowResult, { ok: false }>) => errorText({
    status: "error", error: r.error,
    values: Object.fromEntries(Object.entries(r.detail ?? {}).filter(([, v]) => typeof v === "string" || typeof v === "number")) as Record<string, string | number>,
  });
}

/**
 * Inscripciones del torneo en una tabla: arriba la fila para anotar una pareja escribiendo los nombres (con Enter se anota y
 * queda lista la siguiente) y debajo todas las parejas anotadas. Los jugadores nuevos se crean solos, sin pedir teléfono.
 * También se puede pegar una lista entera.
 */
export function RegistrationTable({
  tournamentId, pairs, free, modality, ruleKind, categories, categoryDefault, removable, replaceable, min,
}: {
  tournamentId: string; pairs: PairRow[]; free: Option[]; modality: string; ruleKind: "single" | "sum"; categories: Cat[];
  /** Categoría con la que se crean los jugadores nuevos en una regla "suma" (se elige en la fila); en "single" es la del torneo. */
  categoryDefault?: string; removable: boolean; replaceable: boolean; min: number;
}) {
  const t = useTranslations("tournaments");
  const tr = useTranslations("tournaments.registration");
  const tg = useTranslations("gender");
  const locale = useLocale();
  const rowError = useRowError();
  const errorText = useErrorText();
  const first = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve()); // los alta se mandan de a uno y en orden
  const [inflight, setInflight] = useState(0);
  const [l1, setL1] = useState(""), [f1, setF1] = useState(""), [l2, setL2] = useState(""), [f2, setF2] = useState("");
  const [g1, setG1] = useState<Gender>(defaultGender(modality, 1)), [g2, setG2] = useState<Gender>(defaultGender(modality, 2));
  const [c1, setC1] = useState(categoryDefault ?? ""), [c2, setC2] = useState(categoryDefault ?? "");
  const [notes, setNotes] = useState<{ id: number; tone: "ok" | "error"; text: string }[]>([]);
  const note = (tone: "ok" | "error", text: string) => setNotes((n) => [{ id: Date.now() + Math.random(), tone, text }, ...n].slice(0, 5));
  const [pasteOpen, setPasteOpen] = useState(false);
  const needsCategory = ruleKind === "sum";
  const askGender = modality === "libre" || modality === "mixto";

  // Anotar es inmediato: la fila se limpia y queda lista la siguiente; el servidor las procesa en orden y los avisos van llegando.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!l1.trim() || !l2.trim()) return;
    const ref = (last: string, firstName: string, g: Gender, cat: string): Ref => ({
      lastName: last.trim(), firstName: firstName.trim() || undefined, gender: g, ...(needsCategory ? { category: cat ? Number(cat) : null } : {}),
    });
    const row = { p1: ref(l1, f1, g1, c1), p2: ref(l2, f2, g2, c2) };
    const label = `${l1.trim()} / ${l2.trim()}`;
    setL1(""); setF1(""); setL2(""); setF2("");
    first.current?.focus();
    setInflight((n) => n + 1);
    queue.current = queue.current.then(async () => {
      try {
        const r = await send(tournamentId, locale, [row]);
        if ("error" in r) return note("error", `${label}: ${errorText(r.error) ?? t("errors.generic")}`);
        const res = r.results[0];
        if (!res.ok) return note("error", `${label}: ${rowError(res) ?? t("errors.generic")}`);
        note("ok", res.created > 0 ? tr("addedNew", { pair: label, n: res.created }) : tr("added", { pair: label }));
      } catch {
        note("error", `${label}: ${t("errors.generic")}`);
      } finally {
        setInflight((n) => n - 1);
      }
    });
  };

  const gender = (value: Gender, set: (g: Gender) => void, name: string) => (
    <div role="group" aria-label={`${tr("gender")} ${name}`} className="inline-flex rounded-md bg-surface-sunken p-0.5">
      {(["male", "female"] as const).map((g) => (
        <button key={g} type="button" aria-pressed={value === g} onClick={() => set(g)}
          className={cx("min-h-9 rounded px-3 text-sm font-semibold transition-colors", value === g ? "bg-surface-raised text-ink shadow-card" : "text-ink-muted hover:text-ink")}>{tg(g)}</button>
      ))}
    </div>
  );
  const category = (value: string, set: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value)} required className={cx(ui.input, "sm:w-36")}>
      <option value="">{tr("category")}</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  );
  const player = (n: 1 | 2) => {
    const [last, setLast, firstName, setFirst, g, setG, c, setC] = n === 1 ? [l1, setL1, f1, setF1, g1, setG1, c1, setC1] as const : [l2, setL2, f2, setF2, g2, setG2, c2, setC2] as const;
    const title = t(n === 1 ? "entries.player1" : "entries.player2");
    return (
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-semibold">{title}</legend>
        <div className="grid grid-cols-2 gap-2">
          <input ref={n === 1 ? first : undefined} value={last} onChange={(e) => setLast(e.target.value)} required maxLength={80} autoComplete="off" placeholder={tr("lastName")} aria-label={`${title}: ${tr("lastName")}`} className={ui.input} />
          <input value={firstName} onChange={(e) => setFirst(e.target.value)} maxLength={80} autoComplete="off" placeholder={tr("firstName")} aria-label={`${title}: ${tr("firstName")}`} className={ui.input} />
        </div>
        {(askGender || needsCategory) && (
          <div className="flex flex-wrap items-center gap-2">
            {askGender && gender(g, setG, title)}
            {needsCategory && category(c, setC, `${title}: ${tr("category")}`)}
          </div>
        )}
      </fieldset>
    );
  };

  const ordered = [...pairs].reverse(); // las últimas anotadas arriba: se ve enseguida lo que se acaba de cargar
  return (
    <section className={cx(ui.card, "enter space-y-4")} aria-labelledby="reg-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="reg-title" className="text-xl font-bold">{tr("title")}</h2>
          <p className="text-sm text-ink-muted">
            {pairs.length >= min ? tr("ready") : tr("missing", { count: min - pairs.length, min })}
          </p>
        </div>
        <button type="button" onClick={() => setPasteOpen(true)} className={cx(ui.btn, ui.btnSecondary, "w-full sm:w-auto")}><Icon name="list" />{tr("paste")}</button>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-lg bg-surface-sunken p-3 sm:p-4">
        <div className="grid gap-4 md:grid-cols-2">{player(1)}{player(2)}</div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!l1.trim() || !l2.trim()} className={cx(ui.btn, ui.btnPrimary, "w-full sm:w-auto")}><Icon name="userPlus" />{tr("add")}</button>
          {inflight > 0 && <p role="status" className="text-sm font-medium text-ink-muted">{tr("saving", { count: inflight })}</p>}
          <p className="text-xs text-ink-muted">{tr("hint")}</p>
        </div>
        {notes.length > 0 && (
          <ul className="space-y-1.5" aria-live="polite">
            {notes.map((n) => (
              <li key={n.id} role={n.tone === "error" ? "alert" : "status"} className={cx(ui.notice, "flex items-start justify-between gap-2 !py-2", n.tone === "error" ? ui.noticeError : ui.noticeOk)}>
                <span className="min-w-0">{n.text}</span>
                <button type="button" onClick={() => setNotes((x) => x.filter((y) => y.id !== n.id))} aria-label={tr("dismiss")} className="-my-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-surface-raised/60"><Icon name="x" /></button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {pairs.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">{tr("empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-left text-xs font-semibold text-ink-muted">
              <tr>
                <th scope="col" className="w-12 px-3 py-2">{tr("num")}</th>
                <th scope="col" className="px-3 py-2">{tr("pair")}</th>
                <th scope="col" className="hidden px-3 py-2 sm:table-cell">{tr("categories")}</th>
                <th scope="col" className="w-12 px-1 py-2"><span className="sr-only">{tr("actions")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ordered.map((p) => {
                const num = pairs.indexOf(p) + 1;
                const full = (x: PairRow["p1"]) => (x.first && x.first !== "Nombre" ? `${x.name}, ${x.first}` : x.name);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2.5 font-display text-lg font-bold text-ink-muted">{num}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">{full(p.p1)}</p>
                      <p className="font-semibold">{full(p.p2)}</p>
                      <p className="text-xs text-ink-muted sm:hidden">{p.categories}</p>
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink-muted sm:table-cell">{p.categories}</td>
                    <td className="px-1 py-2.5 text-right"><PairMenu pair={p} free={free} removable={removable} replaceable={replaceable} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pasteOpen && (
        <PasteDialog
          onClose={() => setPasteOpen(false)} tournamentId={tournamentId} modality={modality} needsCategory={needsCategory} categories={categories}
        />
      )}
    </section>
  );
}

/** Parejas por pedido al servidor al pegar una lista. */
const CHUNK = 4;

/** Pegar una lista de parejas: vista previa de lo que se va a anotar y resultado por línea al terminar. */
function PasteDialog({ onClose, tournamentId, modality, needsCategory, categories }: { onClose: () => void; tournamentId: string; modality: string; needsCategory: boolean; categories: Cat[] }) {
  const tr = useTranslations("tournaments.registration");
  const t = useTranslations("tournaments");
  const tc = useTranslations("common");
  const locale = useLocale();
  const rowError = useRowError();
  const [text, setText] = useState("");
  const [order, setOrder] = useState<NameOrder>("surname");
  const [cat, setCat] = useState("");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<{ line: number; text: string; reason: string }[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { pairs, problems } = parsePairList(text, order);
  const ready = pairs.length > 0 && (!needsCategory || cat);

  const toRow = (p: ParsedPair): RowInput => {
    const ref = (x: ParsedPair["p1"], slot: 1 | 2): Ref => ({ ...x, gender: defaultGender(modality, slot), ...(needsCategory ? { category: Number(cat) } : {}) });
    return { p1: ref(p.p1, 1), p2: ref(p.p2, 2) };
  };
  // Se manda de a pocas parejas: cada pedido es corto (no se acerca al límite de tiempo del servidor) y se ve el avance.
  const confirm = () => start(async () => {
    setError(null); setSummary(null); setFailed(null);
    const results: RowResult[] = [];
    for (let i = 0; i < pairs.length; i += CHUNK) {
      setProgress({ done: i, total: pairs.length });
      const slice = pairs.slice(i, i + CHUNK);
      const r = await send(tournamentId, locale, slice.map(toRow));
      if ("error" in r) slice.forEach(() => results.push({ ok: false, error: r.error.error ?? "generic" })); // el pedido entero falló: esas filas quedan para reintentar
      else results.push(...r.results);
    }
    setProgress(null);
    const bad = results.flatMap((res, i) => (res.ok ? [] : [{ line: pairs[i].line, text: pairs[i].text, reason: rowError(res) ?? t("errors.generic") }]));
    setSummary(tr("summary", { ok: results.length - bad.length, total: results.length }));
    if (bad.length === 0) return onClose();
    setFailed(bad);
    // Las líneas con problema quedan en el cuadro para corregirlas y volver a intentar.
    setText(bad.map((x) => x.text).join("\n"));
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={tr("pasteTitle")}
      description={tr("pasteBody")}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}><Icon name="x" />{tc("cancel")}</button>
          <button type="button" onClick={confirm} disabled={pending || !ready} className={cx(ui.btn, ui.btnPrimary)}><Icon name="userPlus" />{tr("confirm", { count: pairs.length })}</button>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={8} autoFocus spellCheck={false} aria-label={tr("pasteTitle")}
          placeholder={tr("pastePlaceholder")} className={cx(ui.input, "font-mono text-sm")}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="paste-order" className={ui.label}>{tr("order")}</label>
            <select id="paste-order" value={order} onChange={(e) => setOrder(e.target.value as NameOrder)} className={ui.input}>
              <option value="surname">{tr("orderSurname")}</option>
              <option value="first-last">{tr("orderFirstLast")}</option>
              <option value="last-first">{tr("orderLastFirst")}</option>
            </select>
          </div>
          {needsCategory && (
            <div>
              <label htmlFor="paste-cat" className={ui.label}>{tr("categoryAll")}</label>
              <select id="paste-cat" value={cat} onChange={(e) => setCat(e.target.value)} required className={ui.input}>
                <option value="">{tr("category")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          )}
        </div>
        {text.trim() && (
          <p className="text-sm font-medium">{tr("preview", { count: pairs.length })}{problems.length > 0 && <span className="text-danger"> · {tr("problems", { count: problems.length })}</span>}</p>
        )}
        {problems.length > 0 && (
          <ul className="space-y-0.5 text-xs text-danger">
            {problems.map((p) => <li key={p.line}>{tr("line", { n: p.line })}: {tr(`reason.${p.reason}`)} — {p.text}</li>)}
          </ul>
        )}
        {progress && <p role="status" className="text-sm font-medium text-ink-muted">{tr("progress", { done: progress.done, total: progress.total })}</p>}
        {summary && <p role="status" className={cx(ui.notice, failed ? ui.noticeWarning : ui.noticeOk)}>{summary}</p>}
        {failed && (
          <ul className="space-y-0.5 text-xs text-danger" role="alert">
            {failed.map((f) => <li key={f.line}>{tr("line", { n: f.line })}: {f.reason} — {f.text}</li>)}
          </ul>
        )}
        {error && <p role="alert" className={ui.error}>{error}</p>}
      </div>
    </Modal>
  );
}
