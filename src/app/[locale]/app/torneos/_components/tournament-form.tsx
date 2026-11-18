"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";
import { cx, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { MODALITIES, MIN_PAIRS_FLOOR, ROUND_KEYS, type RoundKey } from "@/lib/tournament/constants";
import { roundPoints } from "@/lib/tournament/points";
import { RANKING_WINDOWS } from "@/lib/tournament/ranking-window";
import type { TState } from "../actions";
import { useErrorText } from "./action-button";

export interface TemplateOption { id: string; name: string; championPoints: number; participationPoints: number; roundPercents: Record<string, number> | null }
type Option = { id: string; label: string };
const idle: TState = { status: "idle" };
// Rondas que se muestran en la tabla editable (las más profundas se calculan solas).
const SHOWN: RoundKey[] = ROUND_KEYS.slice(0, 6);

export function TournamentForm({ action, categories, templates, today }: { action: (prev: TState, fd: FormData) => Promise<TState>; categories: Option[]; templates: TemplateOption[]; today: string }) {
  const t = useTranslations("tournaments");
  const tf = useTranslations("tournaments.form");
  const locale = useLocale();
  const errorText = useErrorText();
  const [state, formAction, pending] = useActionState(action, idle);
  const [templateId, setTemplateId] = useState("");
  const [champion, setChampion] = useState("100");
  const [participation, setParticipation] = useState("5");
  const [ruleKind, setRuleKind] = useState<"single" | "sum">("single");
  const [overrides, setOverrides] = useState<Partial<Record<RoundKey, string>>>({});

  const template = templates.find((x) => x.id === templateId);
  const percents = template?.roundPercents ?? undefined;
  const table = useMemo(() => {
    const n = Number(champion);
    return Number.isFinite(n) && n > 0 ? roundPoints(Math.round(n), { percents }) : null;
  }, [champion, percents]);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((x) => x.id === id);
    if (tpl) { setChampion(String(tpl.championPoints)); setParticipation(String(tpl.participationPoints)); setOverrides({}); }
  };
  const bad = (f: string) => state.fields?.includes(f);
  const invalid = (f: string) => ({ "aria-invalid": bad(f) || undefined });
  const message = errorText(state) ?? (state.error === "validation" ? tf("validation") : null);
  const req = <span aria-hidden className="text-danger"> *</span>;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      {message && <p role="alert" className={cx(ui.notice, ui.noticeError, "enter")}>{message}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="tf-name" className={ui.label}>{tf("name")}{req}</label>
          <input id="tf-name" name="name" required maxLength={100} autoComplete="off" placeholder={tf("namePlaceholder")} className={ui.input} {...invalid("name")} />
        </div>

        <div>
          <label htmlFor="tf-modality" className={ui.label}>{tf("modality")}</label>
          <select id="tf-modality" name="modality" defaultValue="libre" className={ui.input}>
            {MODALITIES.map((m) => <option key={m} value={m}>{t(`modality.${m}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tf-kind" className={ui.label}>{tf("ruleKind")}</label>
          <select id="tf-kind" name="ruleKind" value={ruleKind} onChange={(e) => setRuleKind(e.target.value as "single" | "sum")} className={ui.input}>
            <option value="single">{tf("ruleSingle")}</option>
            <option value="sum">{tf("ruleSum")}</option>
          </select>
        </div>
        {ruleKind === "single" ? (
          <div>
            <label htmlFor="tf-cat" className={ui.label}>{tf("category")}</label>
            <select id="tf-cat" name="category" defaultValue="6" className={ui.input} {...invalid("ruleValue")}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="tf-sum" className={ui.label}>{tf("sumValue")}</label>
            <input id="tf-sum" name="sumValue" type="number" inputMode="numeric" min={2} max={18} defaultValue={13} required className={ui.input} {...invalid("ruleValue")} />
            <p className={ui.hint}>{tf("sumHint")}</p>
          </div>
        )}
        <div>
          <label htmlFor="tf-min" className={ui.label}>{tf("minPairs")}</label>
          <input id="tf-min" name="minPairs" type="number" inputMode="numeric" min={MIN_PAIRS_FLOOR} max={256} defaultValue={MIN_PAIRS_FLOOR} required className={ui.input} {...invalid("minPairs")} />
          <p className={ui.hint}>{tf("minPairsHint", { min: MIN_PAIRS_FLOOR })}</p>
        </div>

        <div>
          <label htmlFor="tf-start" className={ui.label}>{tf("startsOn")}</label>
          <input id="tf-start" name="startsOn" type="date" defaultValue={today} required className={ui.input} {...invalid("startsOn")} />
        </div>
        <div>
          <label htmlFor="tf-window" className={ui.label}>{tf("seedWindow")}</label>
          <select id="tf-window" name="seedWindow" defaultValue="all" className={ui.input}>
            {RANKING_WINDOWS.map((w) => <option key={w} value={w}>{t(`ranking.window.${w}`)}</option>)}
          </select>
          <p className={ui.hint}>{tf("seedWindowHint")}</p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line-strong p-3.5 text-sm sm:col-span-2">
          <input type="checkbox" name="isRanked" defaultChecked className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
          <span>
            <span className="font-semibold">{tf("ranked")}</span>
            <span className="mt-0.5 block text-ink-muted">{tf("rankedHint")}</span>
          </span>
        </label>
      </div>

      <section className="space-y-4 rounded-lg border border-line p-4">
        <h2 className="text-lg font-bold">{tf("pointsTitle")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="tf-template" className={ui.label}>{tf("template")}</label>
            <select id="tf-template" name="templateId" value={templateId} onChange={(e) => pickTemplate(e.target.value)} className={ui.input}>
              <option value="">{tf("noTemplate")}</option>
              {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tf-champ" className={ui.label}>{tf("champion")}{req}</label>
            <input id="tf-champ" name="championPoints" type="number" inputMode="numeric" min={1} value={champion} onChange={(e) => setChampion(e.target.value)} required className={ui.input} {...invalid("championPoints")} />
          </div>
          <div>
            <label htmlFor="tf-part" className={ui.label}>{tf("participation")}</label>
            <input id="tf-part" name="participationPoints" type="number" inputMode="numeric" min={0} value={participation} onChange={(e) => setParticipation(e.target.value)} className={ui.input} {...invalid("participationPoints")} />
            <p className={ui.hint}>{tf("participationHint")}</p>
          </div>
        </div>
        <div>
          <p className={ui.label}>{tf("roundsTitle")}</p>
          <p className={cx(ui.hint, "mb-2 mt-0")}>{tf("roundsHint")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {SHOWN.map((k) => (
              <div key={k}>
                <label htmlFor={`tf-o-${k}`} className="mb-1 block text-xs font-semibold text-ink-muted">{t(`rounds.${k}`)}</label>
                <input
                  id={`tf-o-${k}`} name={`override_${k}`} type="number" inputMode="numeric" min={0}
                  value={overrides[k] ?? ""} placeholder={table ? String(table[k]) : ""}
                  onChange={(e) => setOverrides((o) => ({ ...o, [k]: e.target.value }))} className={ui.input}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* En celular los botones quedan fijos abajo para no perderlos en un formulario largo. */}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-surface/90 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Link href="/app/torneos" className={cx(ui.btn, ui.btnSecondary, "basis-1/3 sm:basis-auto")}>{tf("cancel")}</Link>
        <button type="submit" disabled={pending} className={cx(ui.btn, ui.btnPrimary, "flex-1 sm:flex-none")}>{pending ? tf("saving") : tf("create")}</button>
      </div>
    </form>
  );
}
