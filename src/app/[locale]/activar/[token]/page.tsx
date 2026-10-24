import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { cx, ui } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { getAccount } from "@/server/services/account-instance";
import { ActivateForm } from "./activate-form";

// El token viaja en la URL: ningún buscador la indexa y el navegador no la manda como referencia a otro sitio.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

async function Screen({ params }: { params: PageProps<"/[locale]/activar/[token]">["params"] }) {
  const { token } = await params;
  await connection();
  const t = await getTranslations("activate");
  const info = await getAccount().invitationInfo(token);
  if (!info) {
    return (
      <div className={cx(ui.card, "space-y-4 sm:p-6")}>
        <h1 className="font-display text-3xl font-bold leading-tight">{t("invalidTitle")}</h1>
        <p className="text-ink-muted">{t("invalidBody")}</p>
        <Link href="/login" className={cx(ui.btn, ui.btnPrimary, "w-full")}>{t("goLogin")}</Link>
      </div>
    );
  }
  return <ActivateForm token={token} name={info.name} clubName={info.clubName} role={info.role} />;
}

export default async function ActivatePage({ params }: PageProps<"/[locale]/activar/[token]">) {
  setRequestLocale((await params).locale);
  return (
    <AuthShell>
      <Suspense fallback={<div className="h-96" />}>
        <Screen params={params} />
      </Suspense>
    </AuthShell>
  );
}
