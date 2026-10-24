import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StateView } from "./state-view";
import { cx, ui } from "./ui";

/** 404 (la página o el registro no existe). `home` es adónde vuelve la persona según el área en la que está. */
export async function NotFoundView({ home = "/", label }: { home?: string; label?: string }) {
  const t = await getTranslations("problem");
  return (
    <StateView icon="search" title={t("notFoundTitle")} body={t("notFoundBody")}>
      <Link href={home} className={cx(ui.btn, ui.btnPrimary)}>{label ?? t("home")}</Link>
    </StateView>
  );
}
