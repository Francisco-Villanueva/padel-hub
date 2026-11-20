import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { RegisterScreen } from "./register-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <RegisterScreen />;
}
