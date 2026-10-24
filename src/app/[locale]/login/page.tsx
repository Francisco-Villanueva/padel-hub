import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { safeNext } from "@/server/auth/http";
import { LoginScreen } from "./login-form";

async function Screen({ searchParams }: { searchParams: PageProps<"/[locale]/login">["searchParams"] }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = safeNext(raw ?? null, "");
  // Si vino redirigido desde una página protegida, la sesión venció o falta: se lo explica en vez de mostrar el login "mudo".
  return <LoginScreen next={next} expired={next !== ""} />;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}
