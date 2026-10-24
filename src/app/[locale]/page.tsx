import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("app");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="enter space-y-3">
        <h1><Logo variant="stacked" alt={t("name")} className="mx-auto h-28" /></h1>
        <p className="mx-auto max-w-md text-ink-muted">{t("tagline")}</p>
      </div>
      <footer className="enter mt-8 text-sm text-ink-muted" style={{ ["--i" as string]: 2 } as React.CSSProperties}>{t("poweredBy")}</footer>
    </main>
  );
}
