"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { playerInputSchema } from "@/lib/player-schema";
import { withPlatform, withTenant } from "@/server/db/client";
import { LOCALES } from "@/server/db/schema";
import { allowSignupAttempt, MIN_FILL_MS, registerPublicPlayer, resolveSignupTarget } from "@/server/services/public-signup";

export type SignupState = {
  status: "idle" | "ok" | "exists" | "error";
  name?: string;
  error?: string; // clave de signup.errors.*
  fields?: string[];
  values?: Record<string, string | string[]>;
};

const KEYS = ["firstName", "lastName", "gender", "category", "position", "phone", "instagram", "locality"] as const;
const FIELD_FOR: Record<string, string> = { invalid_phone: "phone", invalid_category: "category" };

const fail = (error: string, values?: SignupState["values"], fields: string[] = []): SignupState => ({ status: "error", error, fields, values });

/** IP del request convertida en hash: se usa solo como clave de rate limit, nunca se guarda en claro. */
async function ipKey(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  const secret = process.env.JWT_SECRET;
  return ip && secret ? createHmac("sha256", secret).update(ip).digest("hex") : null;
}

export async function submitSignupAction(_prev: SignupState, fd: FormData): Promise<SignupState> {
  const slug = String(fd.get("slug") ?? "");
  const token = String(fd.get("token") ?? "");
  const loc = String(fd.get("locale") ?? "es");
  const locale = (LOCALES as readonly string[]).includes(loc) ? (loc as (typeof LOCALES)[number]) : "es";

  const raw: Record<string, string | string[]> = {};
  for (const k of KEYS) raw[k] = String(fd.get(k) ?? "");
  raw.slots = fd.getAll("slots").map(String);

  // El club sale del link, no del formulario. Un link inexistente, apagado o de un club suspendido no deja registrar a nadie.
  const target = await withPlatform((tx) => resolveSignupTarget(tx, slug, token));
  if (!target) return fail("generic", raw);

  // Anti-bot sin servicios externos: campo trampa que las personas no ven y tiempo mínimo de llenado.
  // Al bot de la trampa se le responde "ok" para que no sepa que lo detectamos.
  if (String(fd.get("website") ?? "") !== "") return { status: "ok", name: String(raw.firstName) };
  const startedAt = Number(fd.get("startedAt"));
  if (startedAt > 0 && Date.now() - startedAt < MIN_FILL_MS) return fail("too_fast", raw);

  if (!(await withPlatform(async (tx) => allowSignupAttempt(tx, target, await ipKey())))) return fail("rate_limited", raw);

  if (fd.get("consent") !== "on") return fail("consent_required", raw, ["consent"]);
  const parsed = playerInputSchema.safeParse(raw);
  // En el alta pública la categoría es obligatoria: es lo que el club usa para armar el partido.
  if (parsed.success && !parsed.data.category) return fail("invalid_category", raw, ["category"]);
  if (!parsed.success) return fail("validation", raw, parsed.error.issues.map((i) => String(i.path[0])));

  try {
    const result = await withTenant(target.clubId, (tx) => registerPublicPlayer(tx, target, parsed.data, locale));
    if (result.status === "created") return { status: "ok", name: parsed.data.firstName };
    if (result.status === "exists") return { status: "exists" };
    return fail(result.code === "invalid_phone" ? result.code : "generic", raw, FIELD_FOR[result.code] ? [FIELD_FOR[result.code]] : []);
  } catch (e) {
    console.error(e);
    return fail("generic", raw);
  }
}
