import QRCode from "qrcode";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/skeleton";
import { Link } from "@/i18n/navigation";
import { cx, ui } from "@/components/ui";
import { getClubLinks } from "../data";
import { PrintButton } from "./print-button";
import { Poster } from "./poster";

async function PosterView({ locale }: { locale: string }) {
  const t = await getTranslations("settings.poster");
  const { club, link } = await getClubLinks(locale);

  // Si el link público está desactivado el QR no llevaría a ningún lado: no se genera.
  const qrSvg = link.active
    ? await QRCode.toString(link.url, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#10201b", light: "#ffffff" } })
    : null;

  return (
    <div className="enter space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t("title")}</h2>
          <p className="text-sm text-ink-muted">{t("hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/settings/links" className={cx(ui.btn, ui.btnSecondary)}>{t("back")}</Link>
          {qrSvg && <PrintButton label={t("print")} />}
        </div>
      </div>

      {qrSvg ? (
        <>
          <p className="no-print text-sm text-ink-muted">{t("sizeNote")}</p>
          <div className="mx-auto w-full max-w-[34rem] print:max-w-none">
            <Poster
              clubName={club.name}
              logoUrl={club.logoUrl}
              qrSvg={qrSvg}
              text={{
                eyebrow: t("eyebrow"),
                headlineA: t("headlineA"),
                headlineB: t("headlineB"),
                lead: t("lead"),
                qrLabel: t("qrLabel"),
                madeBy: t("madeBy"),
              }}
            />
          </div>
        </>
      ) : (
        <p role="note" className={cx(ui.notice, ui.noticeWarning)}>{t("inactive")}</p>
      )}
    </div>
  );
}

export default async function PosterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<FormSkeleton />}>
      <PosterView locale={locale} />
    </Suspense>
  );
}
