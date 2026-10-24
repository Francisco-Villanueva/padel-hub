import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { PageHead } from "@/components/page-head";
import { FormSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { relativeTime } from "@/lib/relative-time";
import { requireSuperadmin } from "@/server/auth/session";
import { withPlatform } from "@/server/db/client";
import { clubDetail } from "@/server/services/admin-clubs";
import { ClubStatusButton, OwnerPasswordButton, OwnerResendButton } from "../../club-actions";
import { emailEnabled } from "@/server/email/send";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_NAMES: Record<string, string> = { es: "Español", en: "English", pt: "Português" };

async function Detail({ params }: { params: PageProps<"/[locale]/admin/clubs/[id]">["params"] }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("admin.detail");
  const ts = await getTranslations("settings.users");
  const format = await getFormatter();
  const d = await withPlatform((tx) => clubDetail(tx, id));
  if (!d) notFound();
  const { club } = d;
  const suspended = club.status === "suspended";
  const country = new Intl.DisplayNames([locale], { type: "region" }).of(club.country) ?? club.country;

  const stat = (label: string, value: React.ReactNode, i: number) => (
    <div className={cx(ui.card, "enter !p-4 sm:!p-5")} style={stagger(i)}>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold leading-none">{value}</p>
    </div>
  );
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-ink-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
  );

  return (
    <div className="space-y-6">
      <PageHead
        crumb={<><Link href="/admin" className="hover:text-ink hover:underline">{t("crumb")}</Link> / {club.name}</>}
        title={club.name}
        description={t("sub", { slug: club.slug, country, date: format.dateTime(club.createdAt, { dateStyle: "long" }) })}
        actions={<ClubStatusButton clubId={club.id} clubName={club.name} suspended={suspended} className="flex-1 sm:flex-none" />}
      />

      {suspended && (
        <div role="alert" className={cx(ui.notice, ui.noticeError, "flex items-start gap-3 border border-danger")}>
          <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          <div>
            <p className="font-semibold">{t("suspendedTitle")}</p>
            <p className="font-normal">{t("suspendedBody")}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(t("stats.players"), d.players, 1)}
        {stat(t("stats.users"), d.members, 2)}
        {stat(t("stats.recent"), d.recent, 3)}
        {stat(t("stats.lastLogin"), d.lastLogin ? relativeTime(d.lastLogin, locale) : t("stats.never"), 4)}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className={cx(ui.card, "enter")} style={stagger(5)}>
            <h2 className="text-xl font-bold">{t("data.title")}</h2>
            <dl className="mt-2 divide-y divide-line">
              {row(t("data.slug"), club.slug)}
              {row(t("data.country"), country)}
              {row(t("data.locale"), LOCALE_NAMES[club.locale] ?? club.locale)}
              {row(t("data.timezone"), club.timezone.split("/").pop()!.replace(/_/g, " "))}
            </dl>
          </section>
          <section className={cx(ui.card, "enter space-y-4")} style={stagger(6)}>
            <h2 className="text-xl font-bold">{t("owner.title")}</h2>
            {d.owner ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar name={d.owner.name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{d.owner.name}</p>
                    <p className="truncate text-sm text-ink-muted">{d.owner.email}</p>
                  </div>
                </div>
                {d.owner.activatedAt === null ? (
                  <>
                    <p><span className={ui.badgeWarning}>{ts("pending")}</span></p>
                    {emailEnabled() && <OwnerResendButton clubId={club.id} ownerId={d.owner.id} ownerName={d.owner.name} ownerEmail={d.owner.email} />}
                  </>
                ) : (
                  <OwnerPasswordButton clubId={club.id} ownerId={d.owner.id} ownerName={d.owner.name} />
                )}
              </>
            ) : (
              <p className="text-sm text-ink-muted">{t("owner.none")}</p>
            )}
          </section>
        </div>

        <section className={cx(ui.card, "enter")} style={stagger(7)}>
          <h2 className="text-xl font-bold">{t("audit.title")}</h2>
          {d.audit.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">{t("audit.empty")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-sunken text-left text-[13px] font-semibold text-ink-muted">
                    <th scope="col" className="px-3 py-2">{t("audit.action")}</th>
                    <th scope="col" className="px-3 py-2">{t("audit.user")}</th>
                    <th scope="col" className="px-3 py-2">{t("audit.when")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.audit.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2.5 font-mono text-xs">{a.action}</td>
                      <td className="px-3 py-2.5">{a.userName ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{relativeTime(a.at, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default async function ClubDetailPage({ params }: PageProps<"/[locale]/admin/clubs/[id]">) {
  // El idioma se fija en la página, antes del <Suspense>: así el layout raíz (NextIntlClientProvider) ya lo conoce al prerenderizar.
  setRequestLocale((await params).locale);
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}
