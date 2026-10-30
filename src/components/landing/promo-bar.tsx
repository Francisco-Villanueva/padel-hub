import { useTranslations } from "next-intl";
import { contactHref } from "./contact";

/** Barra fija arriba de todo con la oferta; queda a la vista al bajar (la envuelve el contenedor sticky del layout). */
export function PromoBar() {
  const t = useTranslations("landing.promo");
  return (
    <a
      href={contactHref()}
      className="flex min-h-10 items-center justify-center bg-ball px-4 py-2 text-center text-[13px] font-bold leading-4 text-on-ball hover:brightness-95 sm:text-sm"
    >
      {t("text")}
    </a>
  );
}
