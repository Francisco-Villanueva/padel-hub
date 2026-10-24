import { getTranslations } from "next-intl/server";
import { NotFoundView } from "@/components/not-found-view";

// 404 dentro del panel (un jugador que no existe o ya se borró): conserva la navegación.
export default async function ClubNotFound() {
  const t = await getTranslations("problem");
  return <NotFoundView home="/app/players" label={t("backPlayers")} />;
}
