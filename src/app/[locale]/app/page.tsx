import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { categoryLabel } from "@/components/category-label";
import { CopyButton } from "@/components/copy-button";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { clubOverview, listSignupLinks } from "@/server/services/overview";

function Stat({ label, value, hint, i }: { label: string; value: number; hint: string; i: number }) {
  return (
    <div className={cx(ui.card, "enter !p-4 sm:!p-5")} style={stagger(i)}>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-4xl font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-sm text-ink-muted">{hint}</p>
    </div>
  );
}

async function Home({ locale }: { locale: string }) {
  const t = await getTranslations();
  const { session, club } = await getClubContext(locale);
  const { overview, links } = await withTenant(session.clubId, async (tx) => ({ overview: await clubOverview(tx), links: await listSignupLinks(tx) }));

  // El link público tiene que ser absoluto para poder pegarlo en WhatsApp o Instagram.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const urlFor = (token: string) => `${origin}/${locale}/c/${club.slug}/${token}`;
  const link = links.find((l) => l.kind === "link");
  const tablet = links.find((l) => l.kind === "tablet");

  return (
    <div className="space-y-6">
      <PageHead
        title={t("home.title")}
        description={t("home.subtitle", { club: club.name })}
        actions={
          <>
            <Link href="/app/players/new" className={cx(ui.btn, ui.btnSecondary, "flex-1 sm:flex-none")}>{t("home.addPlayer")}</Link>
            <Link href="/app/falta-el-cuarto" className={cx(ui.btn, ui.btnPrimary, "flex-1 sm:flex-none")}>{t("home.cuarto")}</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat i={1} label={t("home.stats.players")} value={overview.total} hint={t("home.stats.playersHint")} />
        <Stat i={2} label={t("home.stats.recent")} value={overview.recent} hint={t("home.stats.recentHint")} />
        <Stat i={3} label={t("home.stats.contacted")} value={overview.contacted} hint={t("home.stats.contactedHint")} />
        <Stat i={4} label={t("home.stats.noConsent")} value={overview.noConsent} hint={t("home.stats.noConsentHint")} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={cx(ui.card, "enter space-y-4")} style={stagger(5)}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{t("home.latest")}</h2>
            <Link href="/app/players" className={ui.link}>{t("common.seeAll")}</Link>
          </div>
          {overview.latest.length === 0 ? (
            <p className="py-6 text-center text-ink-muted">{t("home.latestEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {overview.latest.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/players/${p.id}`} className="-mx-2 flex min-h-14 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-sunken">
                    <Avatar name={`${p.firstName} ${p.lastName}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.firstName} {p.lastName}</span>
                      <span className="block truncate text-sm text-ink-muted">
                        {[p.locality, p.category !== null ? `${categoryLabel(t, p.category)} ${t(`gender.${p.gender}`)}` : null, p.position && t(`position.${p.position}`)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={ui.badge}>{t(`source.${p.source}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className={cx(ui.card, "enter space-y-4")} style={stagger(6)}>
            <div>
              <h2 className="text-xl font-bold">{t("home.link.title")}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t("home.link.hint")}</p>
            </div>
            {link ? (
              <div className="space-y-2">
                <label htmlFor="public-link" className={ui.label}>{t("home.link.label")}</label>
                <input id="public-link" readOnly value={urlFor(link.token)} className={cx(ui.input, "truncate")} />
                <CopyButton value={urlFor(link.token)} className="w-full" />
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{t("home.link.none")}</p>
            )}
            {tablet && (
              <div className="space-y-2 border-t border-line pt-4">
                <label htmlFor="tablet-link" className={ui.label}>{t("home.link.tabletLabel")}</label>
                <input id="tablet-link" readOnly value={urlFor(tablet.token)} className={cx(ui.input, "truncate")} />
                <CopyButton value={urlFor(tablet.token)} className="w-full" />
              </div>
            )}
          </section>

          {overview.noConsent > 0 && (
            <div role="note" className={cx(ui.notice, ui.noticeWarning, "enter flex flex-wrap items-center justify-between gap-3 border border-warning")} style={stagger(7)}>
              <div className="flex items-start gap-3">
                <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                <div>
                  <p className="font-semibold">{t("home.noConsentAlertTitle", { count: overview.noConsent })}</p>
                  <p className="font-normal">{t("home.noConsentAlertBody")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function ClubHome({ params }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Home locale={locale} />
    </Suspense>
  );
}
