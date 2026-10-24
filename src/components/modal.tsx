"use client";

import { useEffect, useId, useRef } from "react";
import { cx } from "./ui";

/**
 * Diálogo modal sobre <dialog>: el navegador maneja el foco, Escape y el fondo inerte.
 * Se cierra también al tocar fuera. En celular se ancla abajo (hoja inferior).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-surface-raised p-0 text-ink shadow-card backdrop:bg-ink/50",
        "max-sm:mb-4",
      )}
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1.5">
          <h2 id={titleId} className="text-lg font-semibold leading-snug">{title}</h2>
          {description && <p id={descId} className="text-sm text-ink-muted">{description}</p>}
        </div>
        {children}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>
      </div>
    </dialog>
  );
}

