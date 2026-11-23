"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "./icons";
import { cx } from "./ui";

/**
 * Panel lateral (hoja que entra por la derecha; en celular ocupa todo el ancho). Sobre <dialog>: el navegador maneja
 * el foco, Escape y el fondo inerte. Se cierra con la X, con Escape o tocando afuera.
 */
export function Sheet({
  open, onClose, title, description, children, closeLabel,
}: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; closeLabel: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx(
        "sheet m-0 ml-auto h-dvh max-h-dvh w-full max-w-md border-l border-line bg-surface-raised p-0 text-ink shadow-card backdrop:bg-ink/50",
        "open:flex open:flex-col",
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-2xl font-bold leading-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={closeLabel} className="-mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink">
          <Icon name="x" className="size-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{open && children}</div>
    </dialog>
  );
}
