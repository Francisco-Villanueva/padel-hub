import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StateView } from "./state-view";
import { cx, ui } from "./ui";

/** 403: sesión válida pero sin permiso (p. ej. un empleado en Ajustes). Se dispara con forbidden(). */
export async function ForbiddenView() {
  const t = await getTranslations("problem");
  return (
    <StateView icon="lock" title={t("forbiddenTitle")} body={t("forbiddenBody")}>
      <Link href="/app/players" className={cx(ui.btn, ui.btnSecondary)}>{t("backPlayers")}</Link>
    </StateView>
  );
}
