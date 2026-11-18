"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";
import { ChoiceChip } from "@/components/choice-chip";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { quickCreatePlayerAction, registerPairAction, type TState } from "../actions";
import { useErrorText } from "./action-button";

const idle: TState = { status: "idle" };
export interface PickerPlayer { id: string; name: string; categoryLabel: string }
type Option = { id: string; label: string };

/** Inscribir una pareja: dos jugadores del club (con búsqueda) o alta en el momento de uno nuevo. */
export function PairPicker({ tournamentId, players, categories }: { tournamentId: string; players: PickerPlayer[]; categories: Option[] }) {
  const t = useTranslations("tournaments.entries");
  const locale = useLocale();
  const errorText = useErrorText();
  const [q, setQ] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [extra, setExtra] = useState<PickerPlayer[]>([]); // jugadores creados en el momento (hasta que la página se refresque)
  const [quickFor, setQuickFor] = useState<1 | 2 | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await registerPairAction(prev, fd);
    if (res.status === "ok") { setP1(""); setP2(""); }
    return res;
  }, idle);

  const all = useMemo(() => [...players, ...extra.filter((e) => !players.some((p) => p.id === e.id))], [players, extra]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;
    return list.slice(0, 200);
  }, [all, q]);
  const opts = (exclude: string, selected: string) => {
    const list = shown.filter((p) => p.id !== exclude);
    const sel = all.find((p) => p.id === selected);
    return sel && !list.some((p) => p.id === sel.id) ? [sel, ...list] : list;
  };
  const message = errorText(state);

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={tournamentId} />
        <div>
          <label htmlFor="pp-search" className={ui.label}>{t("search")}</label>
          <input id="pp-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" className={ui.input} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {([1, 2] as const).map((n) => {
            const val = n === 1 ? p1 : p2;
            return (
              <div key={n}>
                <label htmlFor={`pp-${n}`} className={ui.label}>{t(n === 1 ? "player1" : "player2")}</label>
                <select id={`pp-${n}`} name={n === 1 ? "player1Id" : "player2Id"} value={val} onChange={(e) => (n === 1 ? setP1 : setP2)(e.target.value)} className={ui.input} required>
                  <option value="">{t("select")}</option>
                  {opts(n === 1 ? p2 : p1, val).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.categoryLabel}</option>)}
                </select>
                <button type="button" onClick={() => setQuickFor(n)} className={cx(ui.link, "mt-1.5 inline-block text-sm")}>{t("quickAdd")}</button>
              </div>
            );
          })}
        </div>
        {notice && <p role="status" className={cx(ui.notice, ui.noticeInfo)}>{notice}</p>}
        {all.length === 0 && <p className="text-sm text-ink-muted">{t("noPlayers")}</p>}
        {message && <p role="alert" className={cx(ui.notice, ui.noticeError)}>{message}</p>}
        <button type="submit" disabled={pending || !p1 || !p2} className={cx(ui.btn, ui.btnPrimary, "w-full sm:w-auto")}>{t("add")}</button>
      </form>
      {quickFor && (
        <QuickPlayer
          categories={categories}
          onClose={() => setQuickFor(null)}
          onDone={(player, existing) => {
            setNotice(existing ? t("quick.existing", { name: player.name }) : null);
            setExtra((e) => [...e, player]);
            (quickFor === 1 ? setP1 : setP2)(player.id);
            setQuickFor(null);
          }}
        />
      )}
    </div>
  );
}

function QuickPlayer({ categories, onClose, onDone }: { categories: Option[]; onClose: () => void; onDone: (p: PickerPlayer, existing: boolean) => void }) {
  const t = useTranslations("tournaments.entries.quick");
  const tg = useTranslations("gender");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [category, setCategory] = useState("");
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await quickCreatePlayerAction(prev, fd);
    // Si el teléfono ya existe, se usa ese jugador (no se duplica).
    if (res.status === "ok" && res.data?.playerId) {
      const label = categories.find((c) => c.id === (res.data?.category ?? category))?.label ?? "";
      onDone({ id: res.data.playerId, name: res.data.name ?? "", categoryLabel: label }, res.data.existing === "1");
    }
    return res;
  }, idle);
  const message = errorText(state);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={t("body")}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}>{tc("cancel")}</button>
          <button type="submit" form="quick-player" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}>{t("create")}</button>
        </>
      }
    >
      <form id="quick-player" action={formAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="qp-first" className={ui.label}>{t("firstName")}</label>
            <input id="qp-first" name="firstName" required maxLength={80} autoComplete="off" className={ui.input} />
          </div>
          <div>
            <label htmlFor="qp-last" className={ui.label}>{t("lastName")}</label>
            <input id="qp-last" name="lastName" required maxLength={80} autoComplete="off" className={ui.input} />
          </div>
        </div>
        <fieldset>
          <legend className={ui.label}>{t("gender")}</legend>
          <div className="grid grid-cols-2 gap-2">
            <ChoiceChip type="radio" name="gender" value="male" required>{tg("male")}</ChoiceChip>
            <ChoiceChip type="radio" name="gender" value="female">{tg("female")}</ChoiceChip>
          </div>
        </fieldset>
        <div>
          <label htmlFor="qp-cat" className={ui.label}>{t("category")}</label>
          <select id="qp-cat" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={ui.input}>
            <option value="">{t("select")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="qp-phone" className={ui.label}>{t("phone")}</label>
          <input id="qp-phone" name="phone" type="tel" inputMode="tel" required maxLength={40} autoComplete="off" className={ui.input} />
          <p className={ui.hint}>{t("phoneHint")}</p>
        </div>
        {message && <p role="alert" className={ui.error}>{message}</p>}
      </form>
    </Modal>
  );
}
