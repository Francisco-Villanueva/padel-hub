"use server";

import { redirect } from "next/navigation";
import { LOCALES } from "@/server/db/schema";
import { getAccount } from "@/server/services/account-instance";

export type ActivateState = { status: "idle" | "error"; error?: "weak" | "mismatch" | "invalid" };

/** Activa la cuenta invitada: elige su contraseña (y puede corregir su nombre). Si sale bien, va al login con un aviso. */
export async function activateAction(_prev: ActivateState, fd: FormData): Promise<ActivateState> {
  const l = String(fd.get("locale") ?? "es");
  const locale = (LOCALES as readonly string[]).includes(l) ? l : "es";
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("repeat") ?? "")) return { status: "error", error: "mismatch" };
  const r = await getAccount().activate({ token: String(fd.get("token") ?? ""), password, name: String(fd.get("name") ?? "") });
  if (r.status === "weak") return { status: "error", error: "weak" };
  if (r.status === "invalid") return { status: "error", error: "invalid" };
  // Se respeta el idioma en el que la persona completó el formulario (puede haberlo cambiado respecto del del club).
  redirect(`/${locale}/login?notice=activated`);
}
