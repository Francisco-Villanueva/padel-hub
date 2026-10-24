"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { NavIcon, NavItem } from "./nav-items";
import { cx } from "./ui";

const PATHS: Record<NavIcon, React.ReactNode> = {
  home: <path d="m3 11 9-8 9 8M5 10v10h14V10M10 20v-6h4v6" />,
  settings: <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />,
  cuarto: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14M3 12h18" />
    </>
  ),
  players: (
    <>
      <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M21 20v-1a4 4 0 0 0-3-3.87M16 4.13a3.5 3.5 0 0 1 0 6.74" />
    </>
  ),
  clubs: <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z" />,
};

function Icon({ name }: { name: NavIcon }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}

/**
 * Navegación principal. `vertical`: barra lateral (lg+); `horizontal`: fila en la barra superior (tablet);
 * `bottom`: barra inferior fija en celular.
 */
export function AppNav({ items, orientation }: { items: NavItem[]; orientation: "vertical" | "horizontal" | "bottom" }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const bottom = orientation === "bottom";
  return (
    <nav
      aria-label={t("main")}
      className={cx(
        "flex gap-1",
        orientation === "vertical" && "flex-col",
        orientation === "horizontal" && "-mx-1 overflow-x-auto px-1",
        bottom && "justify-around",
      )}
    >
      {items.map((item) => {
        const active = pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center whitespace-nowrap rounded-md text-sm transition-colors duration-200",
              bottom ? "min-h-12 min-w-16 flex-1 flex-col justify-center gap-0.5 px-2 py-1 text-xs" : "min-h-12 gap-3 px-3 lg:min-h-10",
              active ? "bg-brand-tint font-semibold text-brand" : "font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink",
            )}
          >
            <Icon name={item.icon} />
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}
