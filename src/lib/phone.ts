import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** Normaliza a E.164 usando el país del club como región por defecto. null si no es un número válido. */
export function normalizePhone(input: string, country: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 40) return null;
  const p = parsePhoneNumberFromString(raw, country as CountryCode);
  return p?.isValid() ? p.number : null;
}

/** Dígitos para wa.me. En Argentina WhatsApp exige el 9 después del 54 en celulares. */
export function whatsappDigits(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('54') && !digits.startsWith('549')) return `549${digits.slice(2)}`;
  return digits;
}

export function whatsappLink(e164: string, text?: string): string {
  const base = `https://wa.me/${whatsappDigits(e164)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
