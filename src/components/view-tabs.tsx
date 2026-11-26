import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";
import { Link } from "@/i18n/navigation";

export interface ViewTab { key: string; label: string; icon: IconName }

/**
 * Pestañas para cambiar la vista del torneo (partidos / zonas / cruces). Son enlaces con ?vista=…: el estado queda en la URL, se puede
 * compartir y la página solo dibuja la vista activa.
 */
export function ViewTabs({ tabs, active, hrefFor, label, stretch, toTop }: {
  tabs: ViewTab[]; active: string; hrefFor: (key: string) => string; label: string;
  /** En el celular las pestañas se reparten todo el ancho. */
  stretch?: boolean;
  /** Al cambiar de vista vuelve arriba (por defecto se mantiene el desplazamiento). */
  toTop?: boolean;
}) {
  return (
    <nav aria-label={label} className={cx("max-w-full rounded-lg bg-surface-sunken p-1", stretch ? "flex w-full sm:inline-flex sm:w-auto" : "inline-flex")}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={hrefFor(t.key)}
          scroll={Boolean(toTop)}
          aria-current={t.key === active ? "page" : undefined}
          className={cx(
            "inline-flex min-h-11 items-center rounded-md text-sm font-semibold transition-colors sm:min-h-10",
            stretch ? "min-w-0 flex-1 justify-center gap-1.5 px-2 sm:flex-none sm:gap-2 sm:px-5" : "gap-2 px-4",
            t.key === active ? "bg-surface-raised text-ink shadow-card" : "text-ink-muted hover:text-ink",
          )}
        >
          <Icon name={t.icon} className="size-4" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
