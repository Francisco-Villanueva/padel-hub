"use server";

import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { LOCALES } from "@/server/db/schema";
import { logContact } from "@/server/services/contacts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deja constancia de que el club abrió WhatsApp con el jugador. No bloquea el envío: si falla, el mensaje se manda igual. */
export async function logContactAction(playerId: string, locale: string, reason: "falta_cuarto" | "otro" = "falta_cuarto"): Promise<{ ok: boolean }> {
  if (!UUID.test(playerId)) return { ok: false };
  const loc = (LOCALES as readonly string[]).includes(locale) ? locale : "es";
  const { session } = await getClubContext(loc);
  try {
    await withTenant(session.clubId, (tx) => logContact(tx, { clubId: session.clubId, userId: session.userId }, playerId, reason));
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}
