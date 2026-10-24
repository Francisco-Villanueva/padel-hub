import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { categoryLabel, categoryOptions } from "@/components/category-label";
import { PageHead } from "@/components/page-head";
import { ListSkeleton } from "@/components/skeleton";
import { isWithin, relativeTime } from "@/lib/relative-time";
import { playerFiltersSchema } from "@/lib/player-schema";
import { whatsappLink } from "@/lib/phone";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { listCandidates } from "@/server/services/candidates";
import { CuartoBoard, type Candidate } from "./cuarto-board";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const WEEK = 7 * 24 * 3600 * 1000;

async function Cuarto({ locale, searchParams }: { locale: string; searchParams: PageProps<"/[locale]/app/falta-el-cuarto">["searchParams"] }) {
  const t = await getTranslations();
  const sp = await searchParams;
  const { session, club } = await getClubContext(locale);

  // Filtros inválidos en la URL se ignoran.
  const parsed = playerFiltersSchema.safeParse({ category: first(sp.category), gender: first(sp.gender), position: first(sp.position), slot: first(sp.slot) });
  const f = parsed.success ? parsed.data : playerFiltersSchema.parse({});

  const result = await withTenant(session.clubId, (tx) => listCandidates(tx, f));
  const categories = categoryOptions(t);

  const candidates: Candidate[] = result.rows.map((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`,
    locality: r.locality,
    tags: [
      r.category !== null ? [categoryLabel(t, r.category), t(`gender.${r.gender}`)].join(" · ") : t(`gender.${r.gender}`),
      r.position ? t(`position.${r.position}`) : null,
      ...r.slots.map((s) => t(`slot.${s}`)),
    ].filter((x): x is string => Boolean(x)),
    wa: whatsappLink(r.phoneE164),
    contactedText: r.lastContactAt ? relativeTime(r.lastContactAt, locale) : null,
    contactedRecently: r.lastContactAt ? isWithin(r.lastContactAt, WEEK) : false,
  }));

  const summary = [
    f.category && categories.find((c) => c.id === String(f.category))?.label,
    f.gender && t(`gender.${f.gender}`),
    f.position && t(`position.${f.position}`),
    f.slot && t(`slot.${f.slot}`),
  ].filter(Boolean).join(" · ") || t("cuarto.summaryNone");

  return (
    <div className="space-y-6">
      <PageHead title={t("cuarto.title")} description={t("cuarto.lead")} />
      <CuartoBoard
        candidates={candidates}
        total={result.total}
        shown={result.rows.length}
        categories={categories}
        initial={{ category: f.category ? String(f.category) : "", gender: f.gender ?? "", position: f.position ?? "", slot: f.slot ?? "" }}
        summary={summary}
        clubName={club.name}
      />
    </div>
  );
}

export default async function CuartoPage({ params, searchParams }: PageProps<"/[locale]/app/falta-el-cuarto">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Cuarto locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
