import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { LocaleChips } from "./locale-chips";
import { Logo } from "./logo";

/** Marco de las pantallas de acceso fuera del panel (restablecer, activar): logo arriba, tarjeta al centro, idioma y pie abajo. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const tApp = useTranslations("app");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo variant="stacked" alt={tApp("name")} className="h-20" />
      <div className="enter w-full max-w-md">{children}</div>
      <div className="flex flex-col items-center gap-3">
        {/* LocaleChips lee la ruta actual en el cliente: va en su propio <Suspense> para no bloquear el prerenderizado. */}
        <Suspense fallback={<div className="h-12" aria-hidden />}>
          <LocaleChips />
        </Suspense>
        <p className="text-xs text-ink-muted">{tApp("poweredBy")}</p>
      </div>
    </main>
  );
}
