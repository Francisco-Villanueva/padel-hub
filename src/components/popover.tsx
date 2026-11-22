"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@/i18n/navigation";
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

/**
 * Menú emergente anclado a un botón (por defecto el de los tres puntos verticales). Se dibuja en un portal con posición fija,
 * así no lo recortan las tarjetas ni las zonas con scroll. Se cierra con Escape, al tocar afuera, al hacer scroll o al elegir.
 * Los ítems son botones o enlaces (`MenuItem`); las acciones que abren un diálogo lo hacen desde el componente que lo usa,
 * que vive afuera del menú, así el diálogo sobrevive al cierre.
 */
export function Popover({
  label, icon = "more", children, align = "end", className, triggerClassName,
}: { label: string; icon?: IconName; children: (close: () => void) => React.ReactNode; align?: "start" | "end"; className?: string; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setOpen(false);
  const wasOpen = useRef(false);
  // Al cerrar el menú el foco vuelve al botón que lo abrió.
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const width = 224;
    const left = align === "end" ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) : Math.min(r.left, window.innerWidth - width - 8);
    // Si no entra debajo, se abre hacia arriba.
    const below = r.bottom + 6, estimated = (panel.current?.offsetHeight ?? 160);
    const top = below + estimated > window.innerHeight - 8 ? Math.max(8, r.top - estimated - 6) : below;
    setPos({ top, left, minWidth: width });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (!panel.current?.contains(el) && !trigger.current?.contains(el)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    panel.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    e.preventDefault();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cx("inline-flex size-10 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink aria-expanded:bg-surface-sunken aria-expanded:text-ink", triggerClassName)}
      >
        <Icon name={icon} className="size-5" />
      </button>
      {open && createPortal(
        <div
          ref={panel}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth } : { visibility: "hidden", top: 0, left: 0 }}
          className={cx("fixed z-50 rounded-lg border border-line bg-surface-raised p-1 text-ink shadow-card", className)}
        >
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  );
}

const ITEM = "flex w-full min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none sm:min-h-10";

/** Ítem del menú: botón (con `onSelect`) o enlace (con `href`, ya con el prefijo de idioma o externo). */
export function MenuItem({
  icon, children, onSelect, tone, disabled,
}: { icon: IconName; children: React.ReactNode; onSelect: () => void; tone?: "danger"; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} className={cx(ITEM, tone === "danger" && "text-danger hover:bg-danger-tint", disabled && "opacity-50")}>
      <Icon name={icon} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuLink({ icon, href, children, external, onSelect }: { icon: IconName; href: string; children: React.ReactNode; external?: boolean; onSelect?: () => void }) {
  const inner = (<><Icon name={icon} className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{children}</span></>);
  return external
    ? <a role="menuitem" href={href} target="_blank" rel="noreferrer" onClick={onSelect} className={ITEM}>{inner}</a>
    : <Link role="menuitem" href={href} onClick={onSelect} className={ITEM}>{inner}</Link>;
}

export const menuSeparator = <div role="separator" className="my-1 h-px bg-line" />;
