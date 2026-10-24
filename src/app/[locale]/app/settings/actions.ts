"use server";

import { refresh } from "next/cache";
import { brandSchema, inviteStaffSchema, newStaffSchema } from "@/lib/club-schema";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { getClubContext } from "@/server/club-context";
import { withPlatform, withTenant } from "@/server/db/client";
import { LOGO_MAX_BYTES } from "@/lib/logo";
import { LOCALES } from "@/server/db/schema";
import { LogoError, processLogo } from "@/server/logo-image";
import { removeLogo, saveLogo } from "@/server/services/club-logo";
import { rotateLink, setLinkActive, updateBrand, type LinkKind } from "@/server/services/club-settings";
import { AccountError } from "@/server/services/account";
import { getAccount } from "@/server/services/account-instance";
import { addStaff, removeStaff, resetPassword, UserError } from "@/server/services/club-users";

export type SettingsState = {
  status: "idle" | "ok" | "error";
  error?: string; // clave de settings.errors.* o settings.users.errors.*
  fields?: string[];
  values?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, values?: SettingsState["values"], fields: string[] = []): SettingsState => ({ status: "error", error, fields, values });

/** Todas las acciones de Ajustes son del dueño: se valida acá, no en la interfaz. clubId y userId salen de la sesión. */
async function owner(fd: FormData) {
  const loc = String(fd.get("locale") ?? "es");
  const locale = (LOCALES as readonly string[]).includes(loc) ? loc : "es";
  const { session, club } = await getClubContext(locale);
  return session.role === "owner" ? { session, club, ctx: { clubId: session.clubId, userId: session.userId } } : null;
}

const strings = (fd: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));

export async function saveBrandAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  if (!o) return fail("forbidden");
  // `locale` es el idioma de la interfaz (campo oculto); el idioma del club viaja como `clubLocale`.
  const form = strings(fd, ["name", "colorPrimary", "colorAccent", "clubLocale", "timezone", "contactEmail"]);
  const raw = { ...form, locale: form.clubLocale };
  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", form, parsed.error.issues.map((i) => String(i.path[0])));
  try {
    await withTenant(o.ctx.clubId, (tx) => updateBrand(tx, o.ctx, parsed.data));
  } catch (e) {
    console.error(e);
    return fail("generic", form);
  }
  refresh(); // el nombre del club también se ve en la barra superior
  return { status: "ok", values: form };
}

// Logo: lo sube solo el dueño. El archivo se valida y se vuelve a codificar en el servidor (ver logo-image.ts); el tipo que declara el navegador no cuenta.
export async function saveLogoAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  if (!o) return fail("forbidden");
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return fail("no_file");
  if (file.size > LOGO_MAX_BYTES) return fail("too_large");
  try {
    const { data } = await processLogo(new Uint8Array(await file.arrayBuffer()));
    await withTenant(o.ctx.clubId, (tx) => saveLogo(tx, { ...o.ctx, slug: o.club.slug }, data));
  } catch (e) {
    if (e instanceof LogoError) return fail(e.code);
    console.error(e);
    return fail("generic");
  }
  refresh(); // el logo también se ve en la barra del panel
  return { status: "ok" };
}

export async function removeLogoAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  if (!o) return fail("forbidden");
  try {
    await withTenant(o.ctx.clubId, (tx) => removeLogo(tx, o.ctx));
  } catch (e) {
    console.error(e);
    return fail("generic");
  }
  refresh();
  return { status: "ok" };
}

export async function addStaffAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  if (!o) return fail("forbidden");
  const raw = strings(fd, ["name", "email", "password"]);
  if (passwordProblem(raw.password)) return fail("password_short", { name: raw.name, email: raw.email }, ["password"]);
  const parsed = newStaffSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", { name: raw.name, email: raw.email }, parsed.error.issues.map((i) => String(i.path[0])));
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    await withPlatform((tx) => addStaff(tx, o.ctx, parsed.data, passwordHash));
  } catch (e) {
    if (e instanceof UserError) return fail(e.code, { name: raw.name, email: raw.email }, e.code === "email_taken" ? ["email"] : []);
    console.error(e);
    return fail("generic", { name: raw.name, email: raw.email });
  }
  refresh();
  return { status: "ok" };
}

// Invitación por correo (si esta instancia puede mandar correos): crea la cuenta sin contraseña y manda el link para activarla.
// Se espera el envío para poder decirle al dueño si falló; en ese caso la cuenta igual quedó creada y se puede reenviar.
export async function inviteStaffAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  if (!o) return fail("forbidden");
  const raw = strings(fd, ["name", "email"]);
  const parsed = inviteStaffSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", raw, parsed.error.issues.map((i) => String(i.path[0])));
  try {
    const { deferred } = await getAccount().inviteStaff(o.ctx, parsed.data);
    const sent = await deferred();
    refresh();
    if (sent.status === "failed" || sent.status === "disabled") return fail("email_failed", raw);
  } catch (e) {
    if (e instanceof AccountError) return fail(e.code, raw, e.code === "email_taken" ? ["email"] : []);
    console.error(e);
    return fail("generic", raw);
  }
  return { status: "ok" };
}

export async function resendInviteAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  const id = String(fd.get("userId") ?? "");
  if (!o) return fail("forbidden");
  if (!UUID.test(id)) return fail("not_found");
  try {
    const { deferred } = await getAccount().resendInvite(o.ctx, id);
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

export async function removeStaffAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  const id = String(fd.get("userId") ?? "");
  if (!o) return fail("forbidden");
  if (!UUID.test(id)) return fail("not_found");
  try {
    await withTenant(o.ctx.clubId, (tx) => removeStaff(tx, o.ctx, id));
  } catch (e) {
    if (e instanceof UserError) return fail(e.code);
    console.error(e);
    return fail("generic");
  }
  refresh();
  return { status: "ok" };
}

export async function resetStaffPasswordAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  const id = String(fd.get("userId") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!o) return fail("forbidden");
  if (!UUID.test(id)) return fail("not_found");
  if (passwordProblem(password)) return fail("password_short", undefined, ["password"]);
  try {
    const passwordHash = await hashPassword(password);
    await withPlatform((tx) => resetPassword(tx, o.ctx, id, passwordHash));
  } catch (e) {
    if (e instanceof UserError) return fail(e.code);
    console.error(e);
    return fail("generic");
  }
  return { status: "ok" };
}

const kindOf = (fd: FormData): LinkKind | null => (fd.get("kind") === "tablet" ? "tablet" : fd.get("kind") === "link" ? "link" : null);

export async function setLinkActiveAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  const kind = kindOf(fd);
  if (!o) return fail("forbidden");
  if (!kind) return fail("generic");
  try {
    await withTenant(o.ctx.clubId, (tx) => setLinkActive(tx, o.ctx, kind, fd.get("active") === "true"));
  } catch (e) {
    console.error(e);
    return fail("generic");
  }
  refresh();
  return { status: "ok" };
}

export async function rotateLinkAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const o = await owner(fd);
  const kind = kindOf(fd);
  if (!o) return fail("forbidden");
  if (!kind) return fail("generic");
  try {
    await withTenant(o.ctx.clubId, (tx) => rotateLink(tx, o.ctx, kind));
  } catch (e) {
    console.error(e);
    return fail("generic");
  }
  refresh();
  return { status: "ok" };
}
