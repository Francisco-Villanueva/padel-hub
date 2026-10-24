import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { requireSuperadmin } from "@/server/auth/session";
import { withPlatform } from "@/server/db/client";
import { listClubs, type ClubStatusFilter } from "@/server/services/admin-clubs";
import { ClubStatusButton } from "./club-actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const FILTERS: ClubStatusFilter[] = ["all", "active", "suspended"];

async function Clubs({ params, searchParams }: { params: PageProps<"/[locale]/admin">["params"]; searchParams: PageProps<"/[locale]/admin">["searchParams"] }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);
  const t = await getTranslations("admin.clubs");
  const format = await getFormatter();
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().slice(0, 80);
  const status = (FILTERS as string[]).includes(first(sp.status) ?? "") ? (first(sp.status) as ClubStatusFilter) : "all";

  const clubs = await withPlatform((tx) => listClubs(tx, { q: q || undefined, status }));
  const countries = new Intl.DisplayNames([locale], { type: "region" });
  const href = (s: ClubStatusFilter) => ({ pathname: "/admin", query: { ...(q && { q }), ...(s !== "all" && { status: s }) } }) as const;

  const statusBadge = (s: string) => (
    <span className={s === "active" ? ui.badgeAccent : ui.badgeDanger}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {s === "active" ? <path d="m5 12 5 5L20 7" /> : <path d="M12 8v5M12 17h.01" />}
      </svg>
      {t(`status.${s}`)}
    </span>
  );

  return (
    <div className="space-y-6">
      <PageHead
        title={t("title")}
        description={t("count", { count: clubs.length })}
        actions={<Link href="/admin/clubs/new" className={cx(ui.btn, ui.btnPrimary, "flex-1 sm:flex-none")}>+ {t("create")}</Link>}
      />

      <form method="get" className="enter flex flex-wrap items-end gap-3" style={stagger(1)}>
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="q" className={ui.label}>{t("search")}</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} className={ui.input} />
        </div>
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <button type="submit" className={cx(ui.btn, ui.btnSecondary)}>{t("search")}</button>
      </form>
      <nav aria-label={t("filterLabel")} className="enter flex flex-wrap gap-2" style={stagger(2)}>
        {FILTERS.map((f) => (
          <Link key={f} href={href(f)} aria-current={status === f ? "true" : undefined} className={cx(ui.chip, "min-h-12 sm:min-h-10", status === f && ui.chipActive)}>
            {status === f && <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>}
            {t(`filter.${f}`)}
          </Link>
        ))}
      </nav>

      {clubs.length === 0 ? (
        <p className="py-12 text-center text-ink-muted">{t("empty")}</p>
      ) : (
        <>
          {/* Escritorio: tabla. Debajo de `xl`: tarjetas. */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface-raised xl:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-sunken text-left text-[13px] font-semibold text-ink-muted">
                  <th scope="col" className="px-4 py-3">{t("cols.club")}</th>
                  <th scope="col" className="px-4 py-3">{t("cols.country")}</th>
                  <th scope="col" className="px-4 py-3">{t("cols.players")}</th>
                  <th scope="col" className="px-4 py-3">{t("cols.users")}</th>
                  <th scope="col" className="px-4 py-3">{t("cols.status")}</th>
                  <th scope="col" className="px-4 py-3">{t("cols.created")}</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">{t("view")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clubs.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} square />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{c.name}</p>
                          <p className="truncate text-xs text-ink-muted">/{c.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{c.country}</td>
                    <td className="px-4 py-3">{c.players}</td>
                    <td className="px-4 py-3">{c.users}</td>
                    <td className="px-4 py-3">{statusBadge(c.status)}</td>
                    <td className="px-4 py-3 text-ink-muted">{format.dateTime(c.createdAt, { dateStyle: "medium" })}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/clubs/${c.id}`} className={ui.link}>{t("view")}</Link>
                        <ClubStatusButton clubId={c.id} clubName={c.name} suspended={c.status === "suspended"} small />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 xl:hidden">
            {clubs.map((c, i) => (
              <li key={c.id} className={cx(ui.card, "enter space-y-3")} style={stagger(i)}>
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} square />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-sm text-ink-muted">/{c.slug} · {countries.of(c.country) ?? c.country}</p>
                  </div>
                  {statusBadge(c.status)}
                </div>
                <p className="text-sm text-ink-muted">{t("cols.players")}: {c.players} · {t("cols.users")}: {c.users}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/admin/clubs/${c.id}`} className={cx(ui.btn, ui.btnSecondary)}>{t("view")}</Link>
                  <ClubStatusButton clubId={c.id} clubName={c.name} suspended={c.status === "suspended"} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default async function AdminHome({ params, searchParams }: PageProps<"/[locale]/admin">) {
  // El idioma se fija en la página, antes del <Suspense>: así el layout raíz (NextIntlClientProvider) ya lo conoce al prerenderizar.
  setRequestLocale((await params).locale);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Clubs params={params} searchParams={searchParams} />
    </Suspense>
  );
}
