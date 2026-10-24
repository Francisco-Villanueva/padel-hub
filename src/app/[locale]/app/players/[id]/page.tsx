import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryOptions } from "@/components/category-label";
import { PageHead } from "@/components/page-head";
import { FormSkeleton } from "@/components/skeleton";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { relativeTime } from "@/lib/relative-time";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { listContacts } from "@/server/services/contacts";
import { getLatestConsent, getPlayer } from "@/server/services/players";
import { updatePlayerAction } from "../actions";
import { DeletePlayer } from "../delete-player";
import { WhatsAppButton } from "../whatsapp-button";
import { PlayerForm, type PlayerFormValues } from "../player-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Ficha({ params }: { params: PageProps<"/[locale]/app/players/[id]">["params"] }) {
  // El id dinámico se lee dentro de <Suspense>; por eso el idioma se fija acá.
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const t = await getTranslations();
  const format = await getFormatter();
  const { session } = await getClubContext(locale);
  const { player, contacts, consent } = await withTenant(session.clubId, async (tx) => ({
    player: await getPlayer(tx, id),
    contacts: await listContacts(tx, id),
    consent: await getLatestConsent(tx, id),
  }));
  if (!player) notFound();

  const options = categoryOptions(t);
  const initial: PlayerFormValues = {
    firstName: player.firstName, lastName: player.lastName, gender: player.gender, category: player.category ? String(player.category) : "",
    position: player.position ?? "", slots: player.slots, phone: formatPhone(player.phoneE164), instagram: player.instagram ?? "",
    locality: player.locality ?? "", notes: player.notes ?? "",
  };
  const name = `${player.firstName} ${player.lastName}`;
  const dt = (d: Date | string) => format.dateTime(new Date(d), { dateStyle: "long", timeStyle: "short" });
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-ink-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
  );

  return (
    <div className="space-y-6">
      <PageHead
        crumb={<Link href="/app/players" className="hover:text-ink hover:underline">{t("players.crumb")}</Link>}
        title={name}
        description={t("players.subtitle", {
          locality: player.locality ? `${player.locality} · ` : "", source: t(`source.${player.source}`), date: format.dateTime(player.createdAt, { dateStyle: "long" }),
        })}
        actions={
          <>
            <WhatsAppButton href={whatsappLink(player.phoneE164)} playerId={player.id} className="flex-1 sm:flex-none" />
            {session.role === "owner" && <DeletePlayer playerId={player.id} name={name} />}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={cx(ui.card, "enter")} style={stagger(1)}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{t("players.form.editTitle")}</h2>
            <span className={consent ? ui.badgeAccent : ui.badgeWarning}>{consent ? t("players.consentCard.active") : t("players.consentCard.missing")}</span>
          </div>
          <PlayerForm mode="edit" action={updatePlayerAction} categories={options} initial={initial} playerId={player.id} />
        </section>

        <div className="space-y-4">
          <section className={cx(ui.card, "enter")} style={stagger(2)}>
            <h2 className="text-xl font-bold">{t("players.history.title")}</h2>
            {contacts.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">{t("players.history.empty")}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {contacts.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-brand" />
                    <div>
                      <p className="font-semibold">{t(`players.history.reason.${c.reason}`)}</p>
                      <p className="text-sm text-ink-muted">{t("players.history.by", { when: relativeTime(c.at, locale), name: c.userName })}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cx(ui.card, "enter")} style={stagger(3)}>
            <h2 className="text-xl font-bold">{t("players.consentCard.title")}</h2>
            {consent ? (
              <dl className="mt-2 divide-y divide-line">
                {row(t("players.consentCard.accepted"), dt(consent.acceptedAt))}
                {row(t("players.consentCard.version"), consent.textVersion)}
                {row(t("players.consentCard.language"), t(`players.consentCard.lang.${consent.locale}`))}
                {row(t("players.consentCard.origin"), t(`source.${consent.source}`))}
              </dl>
            ) : (
              <p className={cx(ui.notice, ui.noticeWarning, "mt-3")}>{t("players.consentCard.none")}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default async function PlayerPage({ params }: PageProps<"/[locale]/app/players/[id]">) {
  // El idioma se fija en la página, antes del <Suspense>: así el layout raíz (NextIntlClientProvider) ya lo conoce al prerenderizar.
  setRequestLocale((await params).locale);
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Ficha params={params} />
    </Suspense>
  );
}
