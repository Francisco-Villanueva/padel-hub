"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cx } from "./ui";

export interface TabItem { href: string; label: string; badge?: number }

/** Pestañas de navegación entre rutas hermanas (cada una es una página, así se pueden enlazar). */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {items.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "-mb-px flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors sm:min-h-11",
                  active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
                {t.badge !== undefined && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">{t.badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
