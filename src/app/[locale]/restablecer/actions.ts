"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { LOCALES } from "@/server/db/schema";
import { getAccount } from "@/server/services/account-instance";

export type RecoveryState = { status: "idle" | "sent" | "error"; error?: "rate_limited" | "generic" | "weak" | "mismatch" | "invalid" | "unavailable" };

const localeOf = (fd: FormData) => {
  const l = String(fd.get("locale") ?? "es");
  return (LOCALES as readonly string[]).includes(l) ? l : "es";
};

async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined;
}

/** "Olvidé mi contraseña": la respuesta es la misma exista o no el email. El correo se manda después de responder. */
export async function requestResetAction(_prev: RecoveryState, fd: FormData): Promise<RecoveryState> {
  const email = z.string().trim().email().max(254).safeParse(fd.get("email"));
  if (!email.success) return { status: "error", error: "generic" };
  const r = await getAccount().requestReset({ email: email.data, ip: await clientIp() });
  if (r.status === "disabled") return { status: "error", error: "unavailable" };
  if (r.status === "rate_limited") return { status: "error", error: "rate_limited" };
  if (r.deferred) after(r.deferred);
  return { status: "sent" };
}

/** Elige la contraseña nueva con el link del correo. Si sale bien, va al login con un aviso. */
export async function completeResetAction(_prev: RecoveryState, fd: FormData): Promise<RecoveryState> {
  const locale = localeOf(fd);
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("repeat") ?? "")) return { status: "error", error: "mismatch" };
  const r = await getAccount().completeReset({ token: String(fd.get("token") ?? ""), password });
  if (r.status === "weak") return { status: "error", error: "weak" };
  if (r.status === "invalid") return { status: "error", error: "invalid" };
  if (r.deferred) after(r.deferred);
  redirect(`/${locale}/login?notice=reset`);
}
