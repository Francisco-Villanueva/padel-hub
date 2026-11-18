import "server-only";
import { headers } from "next/headers";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { ensureLink, listLinks } from "@/server/services/club-settings";

/** Links de alta del club (público y tablet) con su URL absoluta. Un club sin links (alta vieja) los recibe acá. */
export async function getClubLinks(locale: string) {
  const { session, club } = await getClubContext(locale);
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
  return { club, link: info("link"), tablet: info("tablet") };
}
