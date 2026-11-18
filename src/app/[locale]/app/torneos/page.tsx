import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { cx, ui } from "@/components/ui";
import { requireFeature } from "@/server/auth/session";

// Con el flag apagado: 404 para dueño y empleado (requireFeature). La lista de torneos llega en el paso 5.
async function Torneos({ locale }: { locale: string }) {
  await requireFeature(locale, "tournaments");
  const t = await getTranslations("tournaments");
  return (
    <div className="space-y-6">
      <PageHead title={t("title")} description={t("sub")} />
      <section className={cx(ui.card, "enter")}>
        <p className="text-ink-muted">{t("soon")}</p>
      </section>
    </div>
  );
}

export default async function TorneosPage({ params }: PageProps<"/[locale]/app/torneos">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Torneos locale={locale} />
    </Suspense>
  );
}
