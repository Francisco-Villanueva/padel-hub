"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { MenuItem, Popover, menuSeparator } from "@/components/popover";
import { cancelTournamentAction, rebuildBracketAction, reopenTournamentAction } from "../actions";
import { ConfirmActionDialog } from "./action-button";

type Kind = "rebuild" | "reopen" | "cancel";

/** Acciones menos frecuentes del torneo, en un menú de tres puntos: regenerar la llave, reabrir y cancelar (todas con confirmación). */
export function TournamentMenu({ id, name, canRebuild, canReopen, canCancel }: { id: string; name: string; canRebuild: boolean; canReopen: boolean; canCancel: boolean }) {
  const t = useTranslations("tournaments");
  const [kind, setKind] = useState<Kind | null>(null);
  if (!canRebuild && !canReopen && !canCancel) return null;

  const cfg = {
    rebuild: { action: rebuildBracketAction, icon: "rotate" as const, confirm: { title: t("adjust.rebuildTitle"), body: t("adjust.rebuildBody"), label: t("adjust.rebuild") }, tone: "primary" as const },
    reopen: { action: reopenTournamentAction, icon: "undo" as const, confirm: { title: t("detail.reopenTitle"), body: t("detail.reopenBody"), label: t("detail.reopen") }, tone: "primary" as const },
    cancel: { action: cancelTournamentAction, icon: "ban" as const, confirm: { title: t("detail.cancelTitle"), body: t("detail.cancelBody", { name }), label: t("detail.cancelConfirm") }, tone: "danger" as const },
  };
  const active = kind ? cfg[kind] : null;

  return (
    <>
      <Popover label={t("menu.tournamentActions")} triggerClassName="border border-line-strong bg-surface-raised">
        {(close) => (
          <>
            {canRebuild && <MenuItem icon="rotate" onSelect={() => { close(); setKind("rebuild"); }}>{t("adjust.rebuild")}</MenuItem>}
            {canReopen && <MenuItem icon="undo" onSelect={() => { close(); setKind("reopen"); }}>{t("detail.reopen")}</MenuItem>}
            {canCancel && (canRebuild || canReopen) && menuSeparator}
            {canCancel && <MenuItem icon="ban" tone="danger" onSelect={() => { close(); setKind("cancel"); }}>{t("detail.cancel")}</MenuItem>}
          </>
        )}
      </Popover>
      {active && <ConfirmActionDialog open onClose={() => setKind(null)} action={active.action} fields={{ id }} confirm={active.confirm} tone={active.tone} icon={active.icon} />}
    </>
  );
}
