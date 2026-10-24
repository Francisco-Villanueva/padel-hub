// Tiempo relativo ("2 días", "1 mes") en el idioma de la interfaz, sin dependencias.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "hace 2 días" / "2 days ago". Menos de un minuto cuenta como "ahora". */
export function relativeTime(iso: string | Date, locale: string, now: Date = new Date()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diffSec) >= secs) return fmt.format(Math.round(diffSec / secs), unit);
  }
  return fmt.format(0, "second");
}

/** ¿Pasó menos de `ms` desde `iso`? */
export const isWithin = (iso: string | Date, ms: number, now: Date = new Date()) => now.getTime() - new Date(iso).getTime() < ms;
