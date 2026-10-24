import { cx } from "./ui";

/** Iniciales para avatares: primera letra de las dos primeras palabras. */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)).toUpperCase();
}

/** `tone="ink"` es para ponerlo sobre una franja del color de marca, donde un avatar de marca no se vería. */
export function Avatar({ name, square, tone = "brand", className }: { name: string; square?: boolean; tone?: "brand" | "ink"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex size-10 shrink-0 items-center justify-center text-sm font-bold",
        tone === "ink" ? "rounded-md bg-ink text-surface" : square ? "rounded-md bg-brand text-on-brand" : "rounded-full bg-brand-tint text-brand",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
