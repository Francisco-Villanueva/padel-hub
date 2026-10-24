import { cx } from "./ui";

/** Encabezado de página: título en tipografía display, descripción y acciones (un solo CTA primario por vista). */
export function PageHead({
  title,
  description,
  actions,
  crumb,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("enter flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {crumb && <div className="mb-1 text-sm text-ink-muted">{crumb}</div>}
        <h1 className="font-display text-4xl font-bold leading-none sm:text-[2.5rem]">{title}</h1>
        {description && <p className="mt-2 text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}
