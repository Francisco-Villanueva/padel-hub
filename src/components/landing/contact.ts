const safeUrl = (v: string | undefined) => {
  const url = v?.trim();
  return url && /^(mailto:|https:\/\/)/.test(url) ? url : null;
};

/**
 * Destino de "Empezá gratis". Hoy los clubes se dan de alta a mano, así que es un contacto directo:
 * `LANDING_CONTACT_URL` puede ser un `mailto:` o un link de WhatsApp (`https://wa.me/…`). Sin definir, abre un correo vacío.
 */
export function contactHref(): string {
  return safeUrl(process.env.LANDING_CONTACT_URL) ?? "mailto:";
}

/** "Agendá una demo": el Calendly de los sábados (`LANDING_DEMO_URL`). Sin definir, cae en el contacto directo. */
export function demoHref(): string {
  return safeUrl(process.env.LANDING_DEMO_URL) ?? contactHref();
}

/** Botón flotante de WhatsApp (`LANDING_WHATSAPP_URL`, https://wa.me/…). Sin definir, el botón no se muestra. */
export function whatsappHref(): string | null {
  const url = process.env.LANDING_WHATSAPP_URL?.trim();
  return url && /^https:\/\//.test(url) ? url : null;
}
