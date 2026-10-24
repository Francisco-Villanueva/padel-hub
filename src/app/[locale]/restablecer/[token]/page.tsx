import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { ui, cx } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { getAccount } from "@/server/services/account-instance";
import { SetPasswordForm } from "./set-password-form";

// El token viaja en la URL: ningún buscador la indexa y el navegador no la manda como referencia a otro sitio.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

async function Screen({ params }: { params: PageProps<"/[locale]/restablecer/[token]">["params"] }) {
  const { token } = await params;
  await connection();
  const t = await getTranslations("recovery");
  // Si el link ya no sirve se dice acá, antes de pedir una contraseña que después no se podría guardar.
  if (!(await getAccount().isTokenValid(token, "reset"))) {
    return (
      <div className={cx(ui.card, "space-y-4 sm:p-6")}>
        <h1 className="font-display text-3xl font-bold leading-tight">{t("invalidTitle")}</h1>
        <p className="text-ink-muted">{t("invalidBody")}</p>
        <Link href="/restablecer" className={cx(ui.btn, ui.btnPrimary, "w-full")}>{t("requestAnother")}</Link>
      </div>
    );
  }
  return <SetPasswordForm token={token} />;
}

export default async function ResetPage({ params }: PageProps<"/[locale]/restablecer/[token]">) {
  setRequestLocale((await params).locale);
  return (
    <AuthShell>
      <Suspense fallback={<div className="h-72" />}>
        <Screen params={params} />
      </Suspense>
    </AuthShell>
  );
}
