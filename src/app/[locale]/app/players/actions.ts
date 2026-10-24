"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { playerInputSchema } from "@/lib/player-schema";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { LOCALES } from "@/server/db/schema";
import { createPlayer, PlayerError, softDeletePlayer, updatePlayer } from "@/server/services/players";

export type FormState = {
  status: "idle" | "ok" | "error";
  error?: string; // clave de players.errors.*
  fields?: string[]; // campos con error
  values?: Record<string, string | string[]>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_FOR: Record<string, string> = { invalid_phone: "phone", phone_taken: "phone", invalid_category: "category" };
const KEYS = ["firstName", "lastName", "gender", "category", "position", "phone", "instagram", "locality", "notes"] as const;

function readForm(fd: FormData) {
  const raw: Record<string, string | string[]> = {};
  for (const k of KEYS) raw[k] = String(fd.get(k) ?? "");
  raw.slots = fd.getAll("slots").map(String);
  const loc = String(fd.get("locale") ?? "es");
  const locale = (LOCALES as readonly string[]).includes(loc) ? loc : "es";
  return { raw, locale };
}

function fail(error: string, values: FormState["values"], fields: string[] = []): FormState {
  return { status: "error", error, fields, values };
}

export async function createPlayerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { raw, locale } = readForm(fd);
  const { session, club } = await getClubContext(locale);

  if (fd.get("consent") !== "on") return fail("consent_required", raw, ["consent"]);
  const parsed = playerInputSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", raw, parsed.error.issues.map((i) => String(i.path[0])));

  try {
    await withTenant(session.clubId, (tx) =>
      createPlayer(tx, { clubId: club.id, country: club.country }, parsed.data, { textVersion: "club-attested-v1", locale: club.locale }));
  } catch (e) {
    if (e instanceof PlayerError) return fail(e.code, raw, FIELD_FOR[e.code] ? [FIELD_FOR[e.code]] : []);
    console.error(e);
    return fail("generic", raw);
  }
  redirect(`/${locale}/app/players?created=1`);
}

export async function updatePlayerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { raw, locale } = readForm(fd);
  const { session, club } = await getClubContext(locale);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return fail("not_found", raw);

  const parsed = playerInputSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", raw, parsed.error.issues.map((i) => String(i.path[0])));

  try {
    await withTenant(session.clubId, (tx) => updatePlayer(tx, { country: club.country }, id, parsed.data));
  } catch (e) {
    if (e instanceof PlayerError) return fail(e.code, raw, FIELD_FOR[e.code] ? [FIELD_FOR[e.code]] : []);
    console.error(e);
    return fail("generic", raw);
  }
  // refresh() vuelve a pedir los datos del servidor (el título de la ficha); `values` evita que el
  // formulario, que React reinicia tras la acción, vuelva a mostrar lo anterior.
  refresh();
  return { status: "ok", values: raw };
}

// Solo el dueño del club puede eliminar jugadores; se valida acá, no en la interfaz.
export async function deletePlayerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale } = readForm(fd);
  const { session } = await getClubContext(locale);
  if (session.role !== "owner") return fail("forbidden", undefined);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return fail("not_found", undefined);

  try {
    await withTenant(session.clubId, (tx) => softDeletePlayer(tx, { clubId: session.clubId, userId: session.userId }, id));
  } catch (e) {
    if (e instanceof PlayerError) return fail(e.code, undefined);
    console.error(e);
    return fail("generic", undefined);
  }
  redirect(`/${locale}/app/players?deleted=1`);
}
