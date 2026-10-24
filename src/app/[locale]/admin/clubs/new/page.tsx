import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PageHead } from "@/components/page-head";
import { FormSkeleton } from "@/components/skeleton";
import { Link } from "@/i18n/navigation";
import { requireSuperadmin } from "@/server/auth/session";
import { NewClubForm } from "./new-club-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function NewClub({ params }: { params: PageProps<"/[locale]/admin/clubs/new">["params"] }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);
  const t = await getTranslations("admin");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead
        crumb={<Link href="/admin" className="hover:text-ink hover:underline">{t("detail.crumb")}</Link>}
        title={t("new.title")}
        description={t("new.lead")}
      />
      <NewClubForm />
    </div>
  );
}

export default async function NewClubPage({ params }: PageProps<"/[locale]/admin/clubs/new">) {
  // El idioma se fija en la página, antes del <Suspense>: así el layout raíz (NextIntlClientProvider) ya lo conoce al prerenderizar.
  setRequestLocale((await params).locale);
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewClub params={params} />
    </Suspense>
  );
}
