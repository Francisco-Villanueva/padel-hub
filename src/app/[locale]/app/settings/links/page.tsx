import { headers } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeleton";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { ensureLink, listLinks } from "@/server/services/club-settings";
import { LinksPanel } from "./links-panel";

async function Links({ locale }: { locale: string }) {
  const { session, club } = await getClubContext(locale);
  // Un club sin links (alta vieja) los recibe al entrar acá; así la pantalla nunca queda vacía.
  const links = await withTenant(session.clubId, async (tx) => {
    await ensureLink(tx, session.clubId, "link");
    await ensureLink(tx, session.clubId, "tablet");
    return listLinks(tx);
  });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const info = (kind: "link" | "tablet") => {
    const l = links.find((x) => x.kind === kind)!;
    return { kind, url: `${origin}/${locale}/c/${club.slug}/${l.token}`, active: l.active };
  };
  return <LinksPanel link={info("link")} tablet={info("tablet")} />;
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
