"use client";

import { cx, ui } from "@/components/ui";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={cx(ui.btn, ui.btnPrimary)}>
      {label}
    </button>
  );
}
