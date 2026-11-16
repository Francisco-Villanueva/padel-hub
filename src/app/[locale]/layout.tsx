import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Figtree } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { SwRegister } from "@/components/sw-register";
import "../globals.css";

const sans = Figtree({ variable: "--font-sans-family", subsets: ["latin"], display: "swap" });
const display = Barlow_Condensed({ variable: "--font-display-family", weight: ["600", "700"], subsets: ["latin"], display: "swap" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#0b6b4f", // siempre claro por ahora (el modo oscuro es manual: data-theme)
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return {
    title: t("name"),
    description: t("tagline"),
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "default" },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <SwRegister />
      </body>
    </html>
  );
}
