import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeleton";
import { getClubLinks } from "./data";
import { LinksPanel } from "./links-panel";

async function Links({ locale }: { locale: string }) {
  const { link, tablet } = await getClubLinks(locale);
  return <LinksPanel link={link} tablet={tablet} />;
}

export default async function LinksPage({ params }: PageProps<"/[locale]/app/settings/links">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <Links locale={locale} />
    </Suspense>
  );
}
