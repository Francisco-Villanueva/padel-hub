"use client";

import { ErrorView } from "@/components/error-view";

// Frontera de error del idioma: cubre páginas y layouts anidados (no el layout raíz, de eso se ocupa global-error).
export default function LocaleError(props: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-4">
      <ErrorView {...props} />
    </main>
  );
}
