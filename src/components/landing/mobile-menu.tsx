"use client";

import { useState } from "react";

/** Menú del encabezado en celular: botón de hamburguesa que despliega los links y se cierra al elegir uno. */
export function MobileMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="landing-menu"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-12 items-center justify-center rounded-md text-ink transition-colors hover:bg-surface-sunken"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div
          id="landing-menu"
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
          className="enter-fade absolute inset-x-0 top-full border-b border-line bg-surface px-4 pb-5 pt-2 shadow-card"
        >
          {children}
        </div>
      )}
    </div>
  );
}
