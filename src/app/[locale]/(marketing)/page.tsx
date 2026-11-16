import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Benefits, Faq, FinalCta, Hero, HowItWorks, Pain, Pricing } from "@/components/landing/sections";
import { routing } from "@/i18n/routing";

const siteUrl = () => new URL(process.env.APP_URL?.trim() || "http://localhost:3000");

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  return {
    metadataBase: siteUrl(),
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
    openGraph: { title: t("title"), description: t("description"), url: `/${locale}`, siteName: "PadelHub", locale, type: "website" },
  };
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <Benefits />
      <Pain />
      <HowItWorks />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
