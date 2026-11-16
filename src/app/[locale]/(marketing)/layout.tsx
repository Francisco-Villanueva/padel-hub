import { setRequestLocale } from "next-intl/server";
import { PromoBar } from "@/components/landing/promo-bar";
import { WhatsappFloat } from "@/components/landing/whatsapp-float";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

// Marco de la landing pública (encabezado y pie propios). El panel y el login no pasan por acá.
// Los layouts se renderizan en paralelo con el de arriba: sin fijar el idioma acá, next-intl lo lee de los headers y rompe el prerender.
export default async function MarketingLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <div className="sticky top-0 z-40">
        <PromoBar />
        <SiteHeader />
      </div>
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsappFloat />
    </>
  );
}
