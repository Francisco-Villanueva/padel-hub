import { cx } from "./ui";

export type StateIcon = "players" | "lock" | "search" | "alert" | "pause";

const ICONS: Record<StateIcon, React.ReactNode> = {
  players: (
    <>
      <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M21 20v-1a4 4 0 0 0-3-3.87M16 4.13a3.5 3.5 0 0 1 0 6.74" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  alert: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  pause: <path d="M10 6v12M14 6v12" />,
};

/**
 * Estado de página o de lista: vacío, sin permiso (403), no encontrado (404), error. Ícono + título + texto + una acción.
 * El mensaje es siempre texto (nunca solo color) y `role="alert"` solo se usa en los errores.
 */
export function StateView({
  icon,
  title,
  body,
  children,
  tone = "neutral",
  alert,
  level = 1,
  className,
}: {
  icon: StateIcon;
  title: string;
  body?: string;
  children?: React.ReactNode;
  tone?: "neutral" | "danger";
  alert?: boolean;
  /** Nivel del título: 1 si es toda la página; 2 si va dentro de una página que ya tiene su h1 (listas vacías). */
  level?: 1 | 2;
  className?: string;
}) {
  const Heading = level === 2 ? "h2" : "h1";
  return (
    <div role={alert ? "alert" : undefined} className={cx("enter flex flex-col items-center gap-4 px-4 py-12 text-center", className)}>
      <span aria-hidden className={cx("flex size-14 items-center justify-center rounded-full", tone === "danger" ? "bg-danger-tint text-danger" : "bg-brand-tint text-brand")}>
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon]}</svg>
      </span>
      <div className="space-y-1.5">
        <Heading className="text-xl font-bold leading-snug">{title}</Heading>
        {body && <p className="mx-auto max-w-md text-ink-muted">{body}</p>}
      </div>
      {children}
    </div>
  );
}
