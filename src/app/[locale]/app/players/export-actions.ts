"use server";

import { getTranslations } from "next-intl/server";
import { categoryLabel } from "@/components/category-label";
import { playerFiltersSchema } from "@/lib/player-schema";
import { verifyPassword } from "@/server/auth/password";
import { getClubContext } from "@/server/club-context";
import { withPlatform, withTenant } from "@/server/db/client";
import { LOCALES, users } from "@/server/db/schema";
import { buildCsv, exportPlayers, type ExportRow } from "@/server/services/players-export";
import { hitRateLimit } from "@/server/services/rate-limit";
import { eq } from "drizzle-orm";

export type ExportState =
  | { status: "idle" }
  | { status: "error"; error: "invalid_password" | "rate_limited" | "forbidden" | "generic" }
  | { status: "ok"; csv: string; filename: string; count: number };

const EXPORT_LIMIT = { max: 5, windowSec: 600 };

/** Solo el dueño exporta, con su contraseña como confirmación. Se valida acá, no en la interfaz. */
export async function exportCsvAction(_prev: ExportState, fd: FormData): Promise<ExportState> {
  const loc = String(fd.get("locale") ?? "es");
  const locale = (LOCALES as readonly string[]).includes(loc) ? loc : "es";
  const { session, club } = await getClubContext(locale);
  if (session.role !== "owner") return { status: "error", error: "forbidden" };

  try {
    // El tope corre antes de mirar la contraseña: así adivinarla desde una sesión robada también tiene límite.
    const { allowed, hash } = await withPlatform(async (tx) => {
      const allowed = await hitRateLimit(tx, `export:${session.userId}`, EXPORT_LIMIT);
      const [u] = await tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, session.userId));
      return { allowed, hash: u?.hash ?? "" };
    });
    if (!allowed) return { status: "error", error: "rate_limited" };
    if (!hash || !(await verifyPassword(hash, String(fd.get("password") ?? "")))) return { status: "error", error: "invalid_password" };

    const t = await getTranslations({ locale });
    const filtered = fd.get("scope") === "filters";
    const f = playerFiltersSchema.parse({
      q: fd.get("q") ?? undefined, category: fd.get("category") ?? undefined, gender: fd.get("gender") ?? undefined,
      position: fd.get("position") ?? undefined, slot: fd.get("slot") ?? undefined,
    });
    const includePhones = fd.get("phones") === "on";

    const rows: ExportRow[] = await withTenant(session.clubId, (tx) =>
      exportPlayers(tx, { clubId: session.clubId, userId: session.userId }, { includePhones, filters: filtered ? f : undefined }, {
        category: (level) => categoryLabel(t, level),
        enums: (kind, v) => t(`${kind}.${v}`),
      }));

    const keys = ["firstName", "lastName", "gender", "category", "position", "slots", "phone", "instagram", "locality", "source", "createdAt"] as const;
    const labels = Object.fromEntries(keys.map((k) => [k, t(`players.exportDialog.columns.${k}`)])) as Record<(typeof keys)[number], string>;
    const date = new Date().toISOString().slice(0, 10);
    return { status: "ok", csv: buildCsv(rows, includePhones, labels), filename: `${club.slug}-jugadores-${date}.csv`, count: rows.length };
  } catch (e) {
    console.error(e);
    return { status: "error", error: "generic" };
  }
}
