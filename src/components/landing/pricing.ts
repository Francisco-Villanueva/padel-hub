// Precios del plan. Un solo lugar: los usan la calculadora y la sección de precio.
// Idioma es = clubes argentinos (pesos, Mercado Pago más adelante); el resto cobra en dólares (Stripe más adelante).
export type Plan = {
  currency: "ARS" | "USD";
  monthly: number;
  annual: number; // 20% menos que 12 meses
  /** Valor de ejemplo del turno en la calculadora, en la moneda del plan. */
  sampleSlotPrice: number;
  key: "ars" | "usd";
};

const PLAN_ARS: Plan = { key: "ars", currency: "ARS", monthly: 75_000, annual: 720_000, sampleSlotPrice: 40_000 };
const PLAN_USD: Plan = { key: "usd", currency: "USD", monthly: 50, annual: 500, sampleSlotPrice: 30 };

export const planFor = (locale: string): Plan => (locale === "es" ? PLAN_ARS : PLAN_USD);

const INTL_LOCALE = { es: "es-AR", pt: "pt-BR", en: "en-US" } as const;

export const formatMoney = (n: number, locale: string) =>
  new Intl.NumberFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE] ?? "en-US", {
    style: "currency",
    currency: planFor(locale).currency,
    maximumFractionDigits: 0,
  }).format(n);
