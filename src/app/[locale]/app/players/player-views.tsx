import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { categoryLabel } from "@/components/category-label";
import { cx, stagger, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { relativeTime } from "@/lib/relative-time";
import type { PlayerRow } from "@/server/services/players";

type T = Awaited<ReturnType<typeof getTranslations>>;

const PlayerAvatar = ({ p }: { p: PlayerRow }) => <Avatar name={`${p.firstName} ${p.lastName}`} />;

/** "Sin contactar" o "hace 2 días": el estado nunca depende solo del color. */
function LastContact({ p, t, locale }: { p: PlayerRow; t: T; locale: string }) {
  return p.lastContactAt ? (
    <span>{t("players.contactedAgo", { when: relativeTime(p.lastContactAt, locale) })}</span>
  ) : (
    <span className={ui.badgeInfo}>{t("players.neverContacted")}</span>
  );
}

const dash = <span className="text-ink-muted">—</span>;

// Los horarios van como texto corrido: seis etiquetas por fila eran ruido.
function slotsText(p: PlayerRow, t: T) {
  return p.slots.length ? p.slots.map((s) => t(`slot.${s}`)).join(", ") : null;
}

function CategoryBadge({ p, t }: { p: PlayerRow; t: T }) {
  return p.category !== null ? <span className={ui.badgeAccent}>{categoryLabel(t, p.category)}</span> : null;
}

const WhatsAppLink = ({ p, t, className }: { p: PlayerRow; t: T; className?: string }) => (
  <a
    href={whatsappLink(p.phoneE164)}
    target="_blank"
    rel="noopener noreferrer"
    className={cx(ui.btnWhatsapp, className)}
    aria-label={`${t("players.whatsapp")}: ${p.firstName} ${p.lastName}`}
  >
    {t("players.whatsapp")}
  </a>
);

/** Celular y tablet: tarjetas (1 columna en celular, 2 en tablet). */
export function PlayerCards({ rows, t, locale }: { rows: PlayerRow[]; t: T; locale: string }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
      {rows.map((p, i) => (
        <li key={p.id} style={stagger(i)} className={cx(ui.card, "enter flex flex-col gap-4 transition-colors duration-200 hover:border-line-strong")}>
          <div className="flex items-start gap-3">
            <PlayerAvatar p={p} />
            <div className="min-w-0 flex-1">
              <Link href={`/app/players/${p.id}`} className="block truncate text-base font-semibold hover:text-brand">
                {p.lastName}, {p.firstName}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                <CategoryBadge p={p} t={t} />
                <span>{[t(`gender.${p.gender}`), p.position && t(`position.${p.position}`)].filter(Boolean).join(", ")}</span>
              </div>
            </div>
          </div>
          <div className="space-y-0.5 text-sm text-ink-muted">
            <p>{formatPhone(p.phoneE164)}</p>
            {slotsText(p, t) && <p>{slotsText(p, t)}</p>}
            <p><LastContact p={p} t={t} locale={locale} /></p>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2">
            <WhatsAppLink p={p} t={t} className={ui.btn} />
            <Link href={`/app/players/${p.id}`} className={cx(ui.btn, ui.btnSecondary)}>{t("players.edit")}</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Escritorio: tabla. */
export function PlayerTable({ rows, t, locale }: { rows: PlayerRow[]; t: T; locale: string }) {
  const th = "bg-surface-sunken px-4 py-3 text-left text-[13px] font-semibold text-ink-muted";
  return (
    <div className="hidden overflow-hidden rounded-lg border border-line bg-surface-raised xl:block">
      <table className="w-full text-sm">
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={th}>{t("players.cols.name")}</th>
            <th scope="col" className={th}>{t("players.cols.category")}</th>
            <th scope="col" className={th}>{t("players.cols.position")}</th>
            <th scope="col" className={th}>{t("players.cols.slots")}</th>
            <th scope="col" className={th}>{t("players.cols.contact")}</th>
            <th scope="col" className={th}>{t("players.cols.lastContact")}</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">{t("players.edit")}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p, i) => (
            <tr key={p.id} style={stagger(i)} className="enter group transition-colors duration-150 hover:bg-surface-sunken/60">
              <td className="px-4 py-3">
                <Link href={`/app/players/${p.id}`} className="flex items-center gap-3 font-medium">
                  <PlayerAvatar p={p} />
                  <span className="transition-colors group-hover:text-brand">
                    {p.lastName}, {p.firstName}
                    <span className="block text-xs font-normal text-ink-muted">{t(`gender.${p.gender}`)}</span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3"><CategoryBadge p={p} t={t} />{p.category === null && dash}</td>
              <td className="px-4 py-3">{p.position ? t(`position.${p.position}`) : dash}</td>
              <td className="max-w-[16rem] px-4 py-3 text-ink-muted">{slotsText(p, t) ?? dash}</td>
              <td className="px-4 py-3 text-ink-muted">
                <div className="whitespace-nowrap">{formatPhone(p.phoneE164)}</div>
                {p.instagram && <div className="text-xs">@{p.instagram}</div>}
              </td>
              <td className="px-4 py-3 text-ink-muted"><LastContact p={p} t={t} locale={locale} /></td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  <WhatsAppLink p={p} t={t} className={ui.btnSm} />
                  <Link href={`/app/players/${p.id}`} className={cx(ui.btnSm, ui.btnGhost)}>{t("players.edit")}</Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageCount, params, t }: { page: number; pageCount: number; params: Record<string, string>; t: T }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    return { pathname: "/app/players", query: Object.fromEntries(sp) } as const;
  };
  return (
    <nav className="enter flex items-center justify-between gap-3" aria-label="pagination">
      {page > 1 ? <Link href={href(page - 1)} className={cx(ui.btn, ui.btnSecondary)}>{t("players.prev")}</Link> : <span />}
      <span className="text-sm text-ink-muted">{t("players.page", { page, total: pageCount })}</span>
      {page < pageCount ? <Link href={href(page + 1)} className={cx(ui.btn, ui.btnSecondary)}>{t("players.next")}</Link> : <span />}
    </nav>
  );
}
