import { cx } from "./ui";

const VARIANTS = {
  horizontal: { light: "/brand/logo-horizontal.svg", dark: "/brand/logo-horizontal-dark.svg", ratio: 505 / 84 },
  stacked: { light: "/brand/logo-stacked.svg", dark: "/brand/logo-stacked-dark.svg", ratio: 357 / 191 },
  mark: { light: "/brand/mark.svg", dark: "/brand/mark-dark.svg", ratio: 120 / 84 },
  // Sobre un fondo `brand` (verde en claro, menta en oscuro): blanco en claro, tinta en oscuro.
  "horizontal-on-brand": { light: "/brand/logo-horizontal-mono-white.svg", dark: "/brand/logo-horizontal-mono-ink.svg", ratio: 505 / 84 },
} as const;

/**
 * Logo de PadelHub. Muestra la versión clara u oscura según `html[data-theme]` (ver globals.css; sin `dark:`).
 * Se dimensiona por alto con `className` (p. ej. `h-6`); el ancho sale de la proporción.
 */
export function Logo({
  variant = "horizontal",
  alt,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  alt: string;
  className?: string;
}) {
  const v = VARIANTS[variant];
  const cls = cx("block w-auto max-w-full", className ?? "h-6");
  /* eslint-disable @next/next/no-img-element -- SVG de marca estático, no hay nada que optimizar */
  return (
    <>
      <img src={v.light} alt={alt} style={{ aspectRatio: v.ratio }} className={cx(cls, "logo-light")} />
      <img src={v.dark} alt={alt} style={{ aspectRatio: v.ratio }} className={cx(cls, "logo-dark")} loading="lazy" />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
