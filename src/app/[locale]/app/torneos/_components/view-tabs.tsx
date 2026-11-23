import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/ui";
import { Link } from "@/i18n/navigation";

export interface ViewTab { key: string; label: string; icon: IconName }

/**
 * Pestañas para cambiar la vista del torneo (zonas / cruces). Son enlaces con ?vista=…: el estado queda en la URL, se puede
 * compartir y la página solo dibuja la vista activa.
 */
export function ViewTabs({ tabs, active, hrefFor, label }: { tabs: ViewTab[]; active: string; hrefFor: (key: string) => string; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex max-w-full rounded-lg bg-surface-sunken p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={hrefFor(t.key)}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={cx(
            "inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors sm:min-h-10",
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
