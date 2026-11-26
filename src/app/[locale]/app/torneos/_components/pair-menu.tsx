"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { MenuItem, Popover } from "@/components/popover";
import { removePairAction } from "../actions";
import { ConfirmActionDialog } from "./action-button";
import { SelectDialog, type Option } from "./adjust-dialogs";

export interface PairRow {
  id: string;
  name: string; // "Pérez / Gómez"
  p1: { id: string; name: string; first?: string };
  p2: { id: string; name: string; first?: string };
  categories: string; // "7ma + 7ma"
  seed: number | null;
}

type Dlg = { kind: "replace"; player: { id: string; name: string } } | { kind: "remove" } | null;

/** Menú de tres puntos de una pareja inscripta: cambiar a uno de sus jugadores y, antes de empezar, darla de baja. */
export function PairMenu({ pair, free, removable, replaceable }: { pair: PairRow; free: Option[]; removable: boolean; replaceable: boolean }) {
  const t = useTranslations("tournaments");
  const [dlg, setDlg] = useState<Dlg>(null);
  if (!removable && !replaceable) return null;
  return (
    <>
      <Popover label={t("menu.pairActions", { name: pair.name })}>
        {(close) => (
          <>
            {replaceable && [pair.p1, pair.p2].map((pl, i) => (
              <MenuItem key={pl.id} icon="swap" onSelect={() => { close(); setDlg({ kind: "replace", player: pl }); }}>{t("entries.changePlayer", { n: i + 1, name: pl.name })}</MenuItem>
            ))}
            {removable && <MenuItem icon="userMinus" tone="danger" onSelect={() => { close(); setDlg({ kind: "remove" }); }}>{t("entries.remove")}</MenuItem>}
          </>
        )}
      </Popover>
      {dlg?.kind === "replace" && (
        <SelectDialog
          onClose={() => setDlg(null)} title={t("adjust.changePlayerTitle")} description={dlg.player.name} action="replacePlayer"
          fields={{ id: pair.id, old: dlg.player.id }} name="new" label={t("adjust.newPlayer")} submit={t("adjust.apply")} options={free}
        />
      )}
      {dlg?.kind === "remove" && (
        <ConfirmActionDialog
          open onClose={() => setDlg(null)} action={removePairAction} fields={{ id: pair.id }} icon="userMinus"
          confirm={{ title: t("entries.removeTitle"), body: t("entries.removeBody", { name: pair.name }), label: t("entries.remove") }}
        />
      )}
    </>
  );
}
