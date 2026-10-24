"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { StateView } from "./state-view";
import { cx, ui } from "./ui";

/** Error de carga con botón de reintento. Dentro del panel conserva la barra lateral (la frontera está bajo el layout). */
export function ErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("problem");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StateView icon="alert" tone="danger" alert title={t("loadErrorTitle")} body={t("loadErrorBody")}>
      <button type="button" onClick={() => retry()} className={cx(ui.btn, ui.btnPrimary)}>{t("retry")}</button>
    </StateView>
  );
}
