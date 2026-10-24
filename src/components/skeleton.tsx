import { useTranslations } from "next-intl";

// Esqueleto mientras carga el contenido de una página (los fallbacks de <Suspense>).
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const t = useTranslations("common");
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">{t("loading")}</p>
      <div className="space-y-2">
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-4 w-24" />
      </div>
      <div className="skeleton h-11 w-full" />
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton h-[72px] w-full" style={{ opacity: 1 - i * 0.14 }} />
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton() {
  const t = useTranslations("common");
  return (
    <div className="mx-auto max-w-3xl space-y-5" aria-busy="true">
      <p role="status" className="sr-only">{t("loading")}</p>
      <div className="space-y-2">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-7 w-56" />
      </div>
      <div className="skeleton h-[420px] w-full" />
    </div>
  );
}
