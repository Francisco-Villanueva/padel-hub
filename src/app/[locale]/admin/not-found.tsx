import { getTranslations } from "next-intl/server";
import { NotFoundView } from "@/components/not-found-view";

export default async function AdminNotFound() {
  const t = await getTranslations("problem");
  return <NotFoundView home="/admin" label={t("backAdmin")} />;
}
