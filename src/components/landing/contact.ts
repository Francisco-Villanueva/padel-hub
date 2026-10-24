/**
 * Destino de "Probalo en tu club". Hoy los clubes se dan de alta a mano, así que es un contacto directo:
 * `LANDING_CONTACT_URL` puede ser un `mailto:` o un link de WhatsApp (`https://wa.me/…`). Sin definir, abre un correo vacío.
 */
export function contactHref(): string {
  const url = process.env.LANDING_CONTACT_URL?.trim();
  return url && /^(mailto:|https:\/\/)/.test(url) ? url : "mailto:";
}
