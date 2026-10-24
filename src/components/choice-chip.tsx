import { cx } from "./ui";

/**
 * Opción en forma de chip, sobre un radio o casilla nativos (teclado y lectores de pantalla funcionan solos).
 * El estado se ve por relleno y por el tilde, nunca solo por color. `large` sube el área táctil (modo tablet).
 */
export function ChoiceChip({
  type,
  name,
  value,
  defaultChecked,
  required,
  large,
  tone = "brand",
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  defaultChecked?: boolean;
  required?: boolean;
  large?: boolean;
  /** Color del chip elegido: `brand` (principal) o `ball` (el de acento; el formulario público de cada club lo personaliza). */
  tone?: "brand" | "ball";
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} required={required} className="peer sr-only" />
      <span
        className={cx(
          "flex cursor-pointer select-none items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface-raised px-4 text-sm font-semibold text-ink",
          "transition-[background-color,border-color,color,transform] duration-200 hover:bg-surface-sunken active:scale-[0.98]",
          tone === "ball" ? "peer-checked:border-ball peer-checked:bg-ball peer-checked:text-on-ball" : "peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand",
          "peer-checked:[&>svg]:block",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
          large ? "min-h-12" : "min-h-12 sm:min-h-10",
        )}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="hidden size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
        {children}
      </span>
    </label>
  );
}
