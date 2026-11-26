"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { cx, ui } from "@/components/ui";
import { ROUND_KEYS, type RoundKey } from "@/lib/tournament/constants";
import { roundPoints } from "@/lib/tournament/points";
import { updatePointsAction, type TState } from "../actions";
import { useErrorText } from "./action-button";

const idle: TState = { status: "idle" };
const SHOWN: RoundKey[] = ROUND_KEYS.slice(1, 6); // de finalista a 16vos (el campeón va arriba; las más profundas se calculan solas)

interface Props { id: string; champion: number; participation: number; table: Record<string, number> }

/** Botón de lápiz junto a los puntos del torneo: abre el diálogo para cambiar cuánto reparte. */
export function PointsEditor(props: Props) {
  const t = useTranslations("tournaments.points");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("edit")} title={t("edit")} className="inline-flex size-9 items-center justify-center rounded-md text-brand transition-colors hover:bg-brand-tint">
        <Icon name="edit" />
      </button>
      {open && <PointsDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function PointsDialog({ id, champion, participation, table, onClose }: Props & { onClose: () => void }) {
  const t = useTranslations("tournaments");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [champ, setChamp] = useState(String(champion));
  const [part, setPart] = useState(String(participation));
  // Solo se precargan las rondas que el club había ajustado a mano; las demás siguen al campeón.
  const [overrides, setOverrides] = useState<Partial<Record<RoundKey, string>>>(() => {
    const auto = roundPoints(champion);
    return Object.fromEntries(SHOWN.filter((k) => table[k] !== undefined && table[k] !== auto[k]).map((k) => [k, String(table[k])]));
  });
  const [state, formAction, pending] = useActionState(async (prev: TState, fd: FormData) => {
    const res = await updatePointsAction(prev, fd);
    if (res.status === "ok") onClose();
    return res;
  }, idle);
  const n = Number(champ);
  const auto = Number.isFinite(n) && n > 0 ? roundPoints(Math.round(n)) : null;
  const message = errorText(state) ?? (state.error === "validation" ? t("errors.validation") : null);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("points.title")}
      description={t("points.body")}
      actions={
        <>
          <button type="button" onClick={onClose} className={cx(ui.btn, ui.btnSecondary)}><Icon name="x" />{tc("cancel")}</button>
          <button type="submit" form="points-form" disabled={pending} className={cx(ui.btn, ui.btnPrimary)}><Icon name="check" />{t("points.save")}</button>
        </>
      }
    >
      <form id="points-form" action={formAction} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pt-champ" className={ui.label}>{t("form.champion")}</label>
            <input id="pt-champ" name="championPoints" type="number" inputMode="numeric" min={1} required autoFocus value={champ} onChange={(e) => setChamp(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label htmlFor="pt-part" className={ui.label}>{t("form.participation")}</label>
            <input id="pt-part" name="participationPoints" type="number" inputMode="numeric" min={0} value={part} onChange={(e) => setPart(e.target.value)} className={ui.input} />
          </div>
        </div>
        <div>
          <p className={ui.label}>{t("form.roundsTitle")}</p>
          <p className={cx(ui.hint, "mb-2 mt-0")}>{t("form.roundsHint")}</p>
          <div className="grid grid-cols-3 gap-2">
            {SHOWN.map((k) => (
              <div key={k}>
                <label htmlFor={`pt-${k}`} className="mb-1 block text-xs font-semibold text-ink-muted">{t(`rounds.${k}`)}</label>
                <input
                  id={`pt-${k}`} name={`override_${k}`} type="number" inputMode="numeric" min={0} value={overrides[k] ?? ""} placeholder={auto ? String(auto[k]) : ""}
                  onChange={(e) => setOverrides((o) => ({ ...o, [k]: e.target.value }))} className={ui.input}
                />
              </div>
            ))}
          </div>
        </div>
        {message && <p role="alert" className={ui.error}>{message}</p>}
      </form>
    </Modal>
  );
}
