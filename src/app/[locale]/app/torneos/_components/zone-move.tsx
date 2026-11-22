"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { SelectDialog, type Option } from "./adjust-dialogs";

/** Botón de ícono (en la fila de una pareja de la zona) para cambiarla de zona intercambiándola con otra pareja. */
export function ZoneMoveButton({ entryId, name, options }: { entryId: string; name: string; options: Option[] }) {
  const t = useTranslations("tournaments.adjust");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${t("moveZone")}: ${name}`} title={t("moveZone")} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink">
        <Icon name="swap" />
      </button>
      {open && (
        <SelectDialog
          onClose={() => setOpen(false)} title={t("moveZoneTitle")} description={name} action="swapZone" fields={{ id: entryId }}
          name="other" label={t("swapWithPair")} submit={t("swap")} options={options}
        />
      )}
    </>
  );
}
