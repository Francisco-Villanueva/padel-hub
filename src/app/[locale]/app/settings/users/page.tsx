import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeleton";
import { cx, ui } from "@/components/ui";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { emailEnabled } from "@/server/email/send";
import { listMembers } from "@/server/services/club-users";
import { UsersPanel } from "./users-panel";

const ROLES = ["players", "cuarto", "export", "delete", "users", "brand"] as const;
const OWNER_ONLY = new Set(["export", "delete", "users", "brand"]);

async function Users({ locale }: { locale: string }) {
  const t = await getTranslations("settings.users");
  const tr = await getTranslations("auth.role");
  const { session } = await getClubContext(locale);
  const members = await withTenant(session.clubId, (tx) => listMembers(tx));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <UsersPanel mailEnabled={emailEnabled()} members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email, role: m.role, pending: m.activatedAt === null }))} />
      <section className={cx(ui.card, "enter")}>
        <h2 className="text-xl font-bold">{t("rolesTitle")}</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="bg-surface-sunken text-left text-[13px] font-semibold text-ink-muted">
              <th scope="col" className="px-3 py-2">{t("rolesAction")}</th>
              <th scope="col" className="px-3 py-2">{tr("owner")}</th>
              <th scope="col" className="px-3 py-2">{tr("staff")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROLES.map((r) => (
              <tr key={r}>
                <th scope="row" className="px-3 py-2.5 text-left font-normal">{t(`roles.${r}`)}</th>
                <td className="px-3 py-2.5 font-semibold text-brand">{t("yes")}</td>
                <td className={cx("px-3 py-2.5", OWNER_ONLY.has(r) ? "text-ink-muted" : "font-semibold text-brand")}>{OWNER_ONLY.has(r) ? t("no") : t("yes")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default async function UsersPage({ params }: PageProps<"/[locale]/app/settings/users">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Users locale={locale} />
    </Suspense>
  );
}
