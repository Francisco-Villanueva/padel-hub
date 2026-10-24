import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { getBrand } from "@/server/services/club-settings";
import { BrandForm } from "./brand-form";

async function Brand({ locale }: { locale: string }) {
  const { session } = await getClubContext(locale);
  const [b] = await withTenant(session.clubId, (tx) => getBrand(tx));
  return (
    <BrandForm
      initial={{ name: b.name, colorPrimary: b.colorPrimary ?? "", colorAccent: b.colorAccent ?? "", locale: b.locale, timezone: b.timezone, contactEmail: b.contactEmail ?? "", logoUrl: b.logoUrl ?? "" }}
    />
  );
}

export default async function BrandPage({ params }: PageProps<"/[locale]/app/settings/brand">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Brand locale={locale} />
    </Suspense>
  );
}
