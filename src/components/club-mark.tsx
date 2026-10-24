import { initials } from "./avatar";
import { cx } from "./ui";

const SIZES = { sm: "size-9 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-16 text-xl" } as const;

/**
 * Marca del club: su logo si lo cargó, y si no las iniciales. Es decorativa (el nombre del club va al lado), por eso `alt` vacío.
 * El logo va sobre un fondo blanco para que un PNG transparente se vea igual en tema claro, oscuro y sobre la franja de marca.
 * `tone` solo cambia el fallback de iniciales: `brand` (color de marca), `ink` (sobre una franja de marca) o `raised` (tarjeta clara).
 */
export function ClubMark({
  name,
  logoUrl,
  size = "md",
  tone = "brand",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: keyof typeof SIZES;
  tone?: "brand" | "ink" | "raised";
  className?: string;
}) {
  const box = cx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md font-bold", SIZES[size], className);
  if (logoUrl) {
    return (
      <span className={cx(box, "bg-white ring-1 ring-black/10")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ya viene reducida y versionada desde /api/logo; next/image no aporta */}
        <img src={logoUrl} alt="" className="size-full object-contain p-1" />
      </span>
    );
  }
  const fallback = { brand: "bg-brand text-on-brand", ink: "bg-ink text-surface", raised: "bg-surface-raised text-brand" }[tone];
  return <span aria-hidden className={cx(box, fallback)}>{initials(name)}</span>;
}
