import type { Metadata } from "next";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { emailEnabled } from "@/server/email/send";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function Screen() {
  // La configuración del correo se lee en cada pedido: un despliegue sin APP_URL/RESEND_API_KEY lo dice, no lo congela en el build.
  await connection();
  return <RequestForm available={emailEnabled()} />;
}

export default async function RequestResetPage({ params }: PageProps<"/[locale]/restablecer">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <AuthShell>
      <Suspense fallback={<div className="h-72" />}>
        <Screen />
      </Suspense>
    </AuthShell>
  );
}
