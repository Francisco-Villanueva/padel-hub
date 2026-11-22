"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { MenuItem, Popover } from "@/components/popover";
import { Sheet } from "@/components/sheet";
import { cx, ui } from "@/components/ui";
import { removePairAction } from "../actions";
import { ConfirmActionDialog } from "./action-button";
import { SelectDialog, type Option } from "./adjust-dialogs";

export interface PairRow {
  id: string;
  name: string; // "Pérez / Gómez"
  p1: { id: string; name: string };
  p2: { id: string; name: string };
  categories: string; // "7ma + 7ma"
  seed: number | null;
}

type Dlg = { kind: "replace"; pair: PairRow; player: { id: string; name: string } } | { kind: "remove"; pair: PairRow } | null;

/**
 * Cantidad de parejas y un botón que abre el listado en un panel lateral. Cada pareja tiene un menú de tres puntos:
 * cambiar a uno de sus jugadores y, antes de empezar, darla de baja.
 */
export function PairsSheet({ pairs, free, removable, replaceable, missing, min }: { pairs: PairRow[]; free: Option[]; removable: boolean; replaceable: boolean; missing: number; min: number }) {
  const t = useTranslations("tournaments");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? pairs.filter((p) => p.name.toLowerCase().includes(needle)) : pairs;

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="users" className="size-4 text-ink-muted" />
          <span className="font-semibold text-ink">{t("header.pairsCount", { count: pairs.length })}</span>
          <span>{t("header.minPairs", { min })}</span>
          {missing > 0 && <span className={ui.badgeWarning}>{t("header.missing", { count: missing })}</span>}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm font-semibold text-brand transition-colors hover:bg-brand-tint">
          {t("header.viewPairs")}
        </button>
      </span>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("entries.title")} description={t("header.pairsCount", { count: pairs.length })} closeLabel={tc("close")}>
        {pairs.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("entries.none")}</p>
        ) : (
          <div className="space-y-3">
            {pairs.length > 8 && (
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("entries.searchPairs")} aria-label={t("entries.searchPairs")} className={cx(ui.input, "pl-9")} />
              </div>
            )}
            <ul className="divide-y divide-line">
              {shown.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                      <span>{p.categories}</span>
                      {p.seed && <span className={ui.badge}>{t("entries.seed", { n: p.seed })}</span>}
                    </p>
                  </div>
                  {(replaceable || removable) && (
                    <Popover label={t("menu.pairActions", { name: p.name })}>
                      {(close) => (
                        <>
                          {replaceable && [p.p1, p.p2].map((pl, i) => (
                            <MenuItem key={pl.id} icon="swap" onSelect={() => { close(); setDlg({ kind: "replace", pair: p, player: pl }); }}>{t("entries.changePlayer", { n: i + 1, name: pl.name })}</MenuItem>
                          ))}
                          {removable && <MenuItem icon="userMinus" tone="danger" onSelect={() => { close(); setDlg({ kind: "remove", pair: p }); }}>{t("entries.remove")}</MenuItem>}
                        </>
                      )}
                    </Popover>
                  )}
                </li>
              ))}
              {shown.length === 0 && <li className="py-6 text-center text-sm text-ink-muted">{t("entries.noMatches")}</li>}
            </ul>
          </div>
        )}
      </Sheet>

      {dlg?.kind === "replace" && (
        <SelectDialog
          onClose={() => setDlg(null)} title={t("adjust.changePlayerTitle")} description={dlg.player.name} action="replacePlayer"
          fields={{ id: dlg.pair.id, old: dlg.player.id }} name="new" label={t("adjust.newPlayer")} submit={t("adjust.apply")} options={free}
        />
      )}
      {dlg?.kind === "remove" && (
        <ConfirmActionDialog
          open onClose={() => setDlg(null)} action={removePairAction} fields={{ id: dlg.pair.id }} icon="userMinus"
          confirm={{ title: t("entries.removeTitle"), body: t("entries.removeBody", { name: dlg.pair.name }), label: t("entries.remove") }}
        />
      )}
    </>
  );
}
