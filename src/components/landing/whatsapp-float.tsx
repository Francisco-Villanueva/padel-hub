import { useTranslations } from "next-intl";
import { whatsappHref } from "./contact";

/** Botón flotante de WhatsApp, solo en celular. Sin `LANDING_WHATSAPP_URL` no se muestra. */
export function WhatsappFloat() {
  const t = useTranslations("landing.whatsapp");
  const href = whatsappHref();
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-4 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand shadow-card transition-[background-color,transform] duration-200 hover:bg-brand-hover active:scale-[0.98] md:hidden"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      </svg>
      {t("label")}
    </a>
  );
}
