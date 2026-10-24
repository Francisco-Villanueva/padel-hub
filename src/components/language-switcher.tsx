"use client";

import { LocaleChips } from "./locale-chips";

/** Selector de idioma del panel y la landing: solo banderas. */
export function LanguageSwitcher({ className }: { className?: string }) {
  return <LocaleChips className={className} />;
}
