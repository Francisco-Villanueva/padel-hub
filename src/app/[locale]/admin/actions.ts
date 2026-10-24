"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { newClubSchema } from "@/lib/club-schema";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { requireSuperadmin } from "@/server/auth/session";
import { withPlatform } from "@/server/db/client";
import { LOCALES } from "@/server/db/schema";
import { emailEnabled } from "@/server/email/send";
import { AccountError } from "@/server/services/account";
import { getAccount } from "@/server/services/account-instance";
import { createClubAsAdmin, setClubStatus } from "@/server/services/admin-clubs";
import { resetPassword, UserError } from "@/server/services/club-users";

export type AdminState = {
  status: "idle" | "ok" | "error";
  error?: string; // clave de admin.new.errors.* o admin.detail.errors.*
  fields?: string[];
  values?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, values?: AdminState["values"], fields: string[] = []): AdminState => ({ status: "error", error, fields, values });

/** El superadmin se verifica en cada acción (no alcanza con esconder el botón). */
async function admin(fd: FormData) {
  const loc = String(fd.get("locale") ?? "es");
  const locale = (LOCALES as readonly string[]).includes(loc) ? loc : "es";
  const session = await requireSuperadmin(locale);
  return { locale, userId: session.userId };
}

export async function createClubAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const { locale, userId } = await admin(fd);
  const raw = Object.fromEntries(
    ["slug", "name", "country", "clubLocale", "timezone", "ownerName", "ownerEmail"].map((k) => [k, String(fd.get(k) ?? "")]),
  );
  // Con el correo disponible el dueño entra por invitación (elige su contraseña con un link). Sin correo, contraseña inicial.
  const invite = fd.get("ownerMode") === "invite";
  if (invite && !emailEnabled()) return fail("email_disabled", raw);
  // Por invitación no hay contraseña inicial: se usa un secreto aleatorio que nadie conoce (la cuenta queda sin activar).
  const password = invite ? randomBytes(24).toString("base64url") : String(fd.get("ownerPassword") ?? "");
  const input = { ...raw, locale: raw.clubLocale, ownerPassword: password };
  if (!invite && passwordProblem(password)) return fail("validation", raw, ["ownerPassword"]);
  const parsed = newClubSchema.safeParse(input);
  if (!parsed.success) return fail("validation", raw, parsed.error.issues.map((i) => (i.path[0] === "locale" ? "clubLocale" : String(i.path[0]))));

  let id: string;
  try {
    const passwordHash = await hashPassword(parsed.data.ownerPassword);
    const res = await withPlatform((tx) => createClubAsAdmin(tx, { userId }, parsed.data, passwordHash, { pending: invite }));
    if ("error" in res) return fail(res.error, raw, [res.error === "slug_taken" ? "slug" : "ownerEmail"]);
    id = res.id;
    // Bienvenida al dueño (si hay correo): con link para activar la cuenta o, con contraseña inicial, para entrar. Se manda después de responder.
    const welcome = await getAccount().welcomeOwner(res.id, res.ownerId, { pending: invite });
    if (welcome) after(welcome);
  } catch (e) {
    console.error(e);
    return fail("generic", raw);
  }
  redirect(`/${locale}/admin/clubs/${id}`);
}

export async function setClubStatusAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const { userId } = await admin(fd);
  const id = String(fd.get("clubId") ?? "");
  const status = fd.get("status") === "suspended" ? "suspended" : "active";
  if (!UUID.test(id)) return fail("generic");
  try {
    if (!(await withPlatform((tx) => setClubStatus(tx, { userId }, id, status)))) return fail("generic");
  } catch (e) {
    console.error(e);
    return fail("generic");
  }
  refresh();
  return { status: "ok" };
}

/** Reenvía la invitación al dueño que todavía no activó su cuenta (el link anterior deja de servir). */
export async function resendOwnerInviteAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const { userId } = await admin(fd);
  const clubId = String(fd.get("clubId") ?? "");
  const targetId = String(fd.get("userId") ?? "");
  if (!UUID.test(clubId) || !UUID.test(targetId)) return fail("generic");
  try {
    const { deferred } = await getAccount().resendInvite({ clubId, userId, allowOwner: true }, targetId);
    const sent = await deferred();
    refresh();
    if (sent.status === "failed" || sent.status === "disabled") return fail("email_failed");
  } catch (e) {
    if (e instanceof AccountError) return fail(e.code);
    console.error(e);
    return fail("generic");
  }
  return { status: "ok" };
}

/** Cambia la contraseña del dueño del club. */
export async function resetOwnerPasswordAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const { userId } = await admin(fd);
  const clubId = String(fd.get("clubId") ?? "");
  const targetId = String(fd.get("userId") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!UUID.test(clubId) || !UUID.test(targetId)) return fail("generic");
  if (passwordProblem(password)) return fail("validation", undefined, ["password"]);
  try {
    const passwordHash = await hashPassword(password);
    await withPlatform((tx) => resetPassword(tx, { clubId, userId, allowOwner: true }, targetId, passwordHash));
  } catch (e) {
    if (e instanceof UserError) return fail("generic");
    console.error(e);
    return fail("generic");
  }
  return { status: "ok" };
}
