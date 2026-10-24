import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Avatar, initials } from "@/components/avatar";
import { categoryOptions } from "@/components/category-label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LocaleChips } from "@/components/locale-chips";
import { FormSkeleton } from "@/components/skeleton";
import { withPlatform } from "@/server/db/client";
import { resolveSignupTarget } from "@/server/services/public-signup";
import { textOn } from "@/lib/color";
import { SignupFlow } from "./signup-form";

// Link privado de cada club: no se indexa y no se muestra en buscadores.
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function Signup({ params }: { params: PageProps<"/[locale]/c/[slug]/[token]">["params"] }) {
  // Los params dinámicos (slug, token) se leen dentro de <Suspense>; por eso el idioma se fija acá y no en el wrapper.
  const { locale, slug, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const target = await withPlatform((tx) => resolveSignupTarget(tx, slug, token));
  if (!target) notFound();

  const categories = categoryOptions(t);
  const kiosk = target.kind === "tablet";
  const flow = <SignupFlow slug={slug} token={token} clubName={target.name} country={target.country} categories={categories} kiosk={kiosk} />;
  // Color de marca del club: solo en tema claro (en oscuro un color elegido para fondo blanco puede no leerse). El valor ya viene validado como #rrggbb.
  const brandCss = target.colorPrimary && /^#[0-9a-f]{6}$/i.test(target.colorPrimary)
    ? `@media (prefers-color-scheme: light){:root{--brand:${target.colorPrimary};--brand-hover:${target.colorPrimary};--on-brand:${textOn(target.colorPrimary)}}}`
    : null;
  const footer = <footer className="pt-8 text-xs text-ink-muted">{t("app.poweredBy")}</footer>;

  if (kiosk) {
    return (
      <>
      {brandCss && <style>{brandCss}</style>}
      <div className="min-h-dvh bg-surface text-ink md:grid md:grid-cols-[20rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-8 bg-brand p-6 text-on-brand md:min-h-dvh md:p-10">
          <span aria-hidden className="flex size-14 items-center justify-center rounded-md bg-surface-raised text-sm font-bold text-brand">{initials(target.name)}</span>
          <div className="space-y-3 md:my-auto">
            <p className="text-sm font-semibold opacity-90">{target.name}</p>
            <h1 className="font-display text-5xl font-bold leading-none md:text-6xl">{t("signup.title")}</h1>
            <p className="max-w-xs">{t("signup.kioskLead")}</p>
          </div>
          <LocaleChips onBrand />
        </aside>
        <main className="flex flex-col p-6 md:p-10">
          {flow}
          {footer}
        </main>
      </div>
      </>
    );
  }

  return (
    <>
    {brandCss && <style>{brandCss}</style>}
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex min-h-16 max-w-xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={target.name} square />
            <span className="truncate text-base font-semibold">{target.name}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="enter space-y-2">
          <h1 className="font-display text-[2.5rem] font-bold leading-none sm:text-5xl">{t("signup.title")}</h1>
          <p className="text-ink-muted">{t("signup.lead")}</p>
        </div>
        {flow}
        {footer}
      </main>
    </div>
    </>
  );
}

export default async function SignupPage({ params }: PageProps<"/[locale]/c/[slug]/[token]">) {
  return (
    <Suspense fallback={<div className="p-6"><FormSkeleton /></div>}>
      <Signup params={params} />
    </Suspense>
  );
}
