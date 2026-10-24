import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

// Ajustes abre en la primera pestaña. El guard del dueño corre en el layout.
export default async function SettingsHome({ params }: PageProps<"/[locale]/app/settings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect(`/${locale}/app/settings/brand`);
}
