"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cx, ui } from "./ui";

/** Copia un texto al portapapeles y lo confirma con texto (no solo con color). */
export function CopyButton({ value, className }: { value: string; className?: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={cx(ui.btn, ui.btnSecondary, className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
          // Sin permiso de portapapeles: la persona puede seleccionar el link a mano.
        }
      }}
    >
      <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
    </button>
  );
}
