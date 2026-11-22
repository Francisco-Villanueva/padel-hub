"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { templateInputSchema, tournamentInputSchema } from "@/lib/tournament-schema";
import { ROUND_KEYS } from "@/lib/tournament/constants";
import { requireFeature } from "@/server/auth/session";
import { getClubContext } from "@/server/club-context";
import { withTenant } from "@/server/db/client";
import { localToUtc } from "@/lib/tz";
import { LOCALES } from "@/server/db/schema";
import type { Tx } from "@/server/db/tenant";
import { FeatureDisabledError } from "@/server/services/features";
import { replacePlayer, restoreSlot, setSlotEntry, swapSlots, swapZoneEntries, type Side } from "@/server/services/tournament-adjust";
import { rebuildBracket } from "@/server/services/tournament-bracket";
import { quickCreatePlayer, registerPair, removePair } from "@/server/services/tournament-entries";
import { TournamentError } from "@/server/services/tournament-errors";
import { clearResult, recordResult, resolveTie, setMatchLive, setMatchSchedule } from "@/server/services/tournament-matches";
import { createTemplate, deleteTemplate, updateTemplate } from "@/server/services/tournament-templates";
import {
  cancelTournament, closeTournament, createTournament, openRegistration, reopenTournament, startTournament, updateTournament,
} from "@/server/services/tournaments";

export type TState = {
  status: "idle" | "ok" | "error";
  error?: string; // clave de tournaments.errors.*
  /** Valores para interpolar en el mensaje (faltan N parejas, motivo de la pareja…). */
  values?: Record<string, string | number>;
  fields?: string[];
  /** Datos de vuelta para el cliente (alta en el momento: id del jugador). */
  data?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, values?: TState["values"], fields: string[] = []): TState => ({ status: "error", error, values, fields });

function localeOf(fd: FormData) {
  const loc = String(fd.get("locale") ?? "es");
  return (LOCALES as readonly string[]).includes(loc) ? loc : "es";
}

type Env = { locale: string; clubId: string; userId: string; country: string; clubLocale: "es" | "en" | "pt"; timezone: string };

/** Sesión del club + flag de torneos (404 si está apagado). El clubId sale siempre de la sesión. */
async function env(fd: FormData): Promise<Env> {
  const locale = localeOf(fd);
  const { session, club } = await getClubContext(locale);
  await requireFeature(locale, "tournaments");
  return { locale, clubId: session.clubId, userId: session.userId, country: club.country, clubLocale: club.locale, timezone: club.timezone };
}

const idOf = (fd: FormData, key = "id") => {
  const v = String(fd.get(key) ?? "");
  return UUID.test(v) ? v : null;
};

function toState(e: unknown): TState {
  if (e instanceof TournamentError) {
    const values: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(e.detail ?? {})) if (typeof v === "string" || typeof v === "number") values[k] = v;
    return fail(e.code, values);
  }
  if (e instanceof FeatureDisabledError) return fail("not_found");
  console.error(e);
  return fail("generic");
}

/** Ejecuta una mutación dentro de withTenant y refresca la página. */
async function mutate(fd: FormData, fn: (tx: Tx, c: Env) => Promise<void | Record<string, string>>): Promise<TState> {
  const c = await env(fd);
  try {
    const data = await withTenant(c.clubId, (tx) => fn(tx, c));
    refresh();
    return { status: "ok", data: data ?? undefined };
  } catch (e) {
    return toState(e);
  }
}

// Torneo -----------------------------------------------------------------------------------------
function readTournament(fd: FormData) {
  const overrides: Record<string, number> = {};
  for (const k of ROUND_KEYS) {
    const v = String(fd.get(`override_${k}`) ?? "").trim();
    if (v !== "") overrides[k] = Number(v);
  }
  const raw = {
    name: fd.get("name"), modality: fd.get("modality"), ruleKind: fd.get("ruleKind"),
    ruleValue: fd.get(String(fd.get("ruleKind")) === "sum" ? "sumValue" : "category"), isRanked: fd.get("isRanked") === "on",
    minPairs: fd.get("minPairs"), templateId: fd.get("templateId") ?? undefined, championPoints: fd.get("championPoints") ?? undefined,
    participationPoints: fd.get("participationPoints") ?? undefined, roundOverrides: Object.keys(overrides).length ? overrides : undefined,
    startsOn: fd.get("startsOn"), seedWindow: fd.get("seedWindow") ?? "all",
  };
  return raw;
}

export async function createTournamentAction(_prev: TState, fd: FormData): Promise<TState> {
  const c = await env(fd);
  const parsed = tournamentInputSchema.safeParse(readTournament(fd));
  if (!parsed.success) return fail("validation", undefined, parsed.error.issues.map((i) => String(i.path[0])));
  let id: string;
  try {
    id = await withTenant(c.clubId, (tx) => createTournament(tx, { clubId: c.clubId, userId: c.userId }, parsed.data));
  } catch (e) {
    return toState(e);
  }
  redirect(`/${c.locale}/app/torneos/${id}`);
}

export async function updateTournamentAction(_prev: TState, fd: FormData): Promise<TState> {
  const id = idOf(fd);
  if (!id) return fail("not_found");
  const parsed = tournamentInputSchema.safeParse(readTournament(fd));
  if (!parsed.success) return fail("validation", undefined, parsed.error.issues.map((i) => String(i.path[0])));
  return mutate(fd, (tx, c) => updateTournament(tx, { clubId: c.clubId, userId: c.userId }, id, parsed.data));
}

const simple = (fn: (tx: Tx, ctx: { clubId: string; userId: string }, id: string) => Promise<unknown>) =>
  async (_prev: TState, fd: FormData): Promise<TState> => {
    const id = idOf(fd);
    if (!id) return fail("not_found");
    return mutate(fd, async (tx, c) => { await fn(tx, { clubId: c.clubId, userId: c.userId }, id); });
  };

export const openRegistrationAction = simple(openRegistration);
export const startTournamentAction = simple((tx, c, id) => startTournament(tx, c, id));
export const rebuildBracketAction = simple(async (tx, c, id) => { await rebuildBracket(tx, c, id); });
export const closeTournamentAction = simple((tx, c, id) => closeTournament(tx, c, id));
export const reopenTournamentAction = simple(reopenTournament);
export const cancelTournamentAction = simple(cancelTournament);
export const resolveTieAction = simple((tx, c, id) => resolveTie(tx, c, id));
export const clearResultAction = simple(clearResult);

// Parejas ----------------------------------------------------------------------------------------
export async function registerPairAction(_prev: TState, fd: FormData): Promise<TState> {
  const tournamentId = idOf(fd), p1 = idOf(fd, "player1Id"), p2 = idOf(fd, "player2Id");
  if (!tournamentId || !p1 || !p2) return fail("pair_missing");
  return mutate(fd, async (tx, c) => { await registerPair(tx, { clubId: c.clubId }, tournamentId, { player1Id: p1, player2Id: p2 }); });
}

export const removePairAction = simple((tx, c, id) => removePair(tx, c, id));

export async function quickCreatePlayerAction(_prev: TState, fd: FormData): Promise<TState> {
  const firstName = String(fd.get("firstName") ?? "").trim(), lastName = String(fd.get("lastName") ?? "").trim();
  const gender = fd.get("gender"), phone = String(fd.get("phone") ?? "").trim();
  const catRaw = String(fd.get("category") ?? "");
  const category = catRaw === "" ? undefined : Number(catRaw);
  if (!firstName || !lastName || (gender !== "male" && gender !== "female") || !phone || firstName.length > 80 || lastName.length > 80
    || (category !== undefined && !(Number.isInteger(category) && category >= 1 && category <= 9))) return fail("validation");
  return mutate(fd, async (tx, c): Promise<Record<string, string>> => {
    const res = await quickCreatePlayer(tx, { clubId: c.clubId, country: c.country }, { firstName, lastName, gender, category, phone }, c.clubLocale);
    return "existing" in res && res.existing
      ? { playerId: res.existing.id, existing: "1", name: `${res.existing.firstName} ${res.existing.lastName}`, category: String(res.existing.category ?? "") }
      : { playerId: res.created!.id, existing: "", name: `${firstName} ${lastName}`, category: String(category ?? "") };
  });
}

// Resultados -------------------------------------------------------------------------------------
export async function recordResultAction(_prev: TState, fd: FormData): Promise<TState> {
  const id = idOf(fd);
  if (!id) return fail("not_found");
  let sets: unknown;
  try { sets = JSON.parse(String(fd.get("sets") ?? "[]")); } catch { return fail("result_invalid"); }
  return mutate(fd, async (tx, c) => { await recordResult(tx, { clubId: c.clubId }, id, sets); });
}

// Plantillas -------------------------------------------------------------------------------------
function readTemplate(fd: FormData) {
  const percents: Record<string, number> = {};
  for (const k of ROUND_KEYS) {
    const v = String(fd.get(`percent_${k}`) ?? "").trim();
    if (v !== "") percents[k] = Number(v);
  }
  return {
    name: fd.get("name"), championPoints: fd.get("championPoints"), participationPoints: fd.get("participationPoints") || 0,
    roundPercents: Object.keys(percents).length ? percents : undefined,
  };
}

export async function saveTemplateAction(_prev: TState, fd: FormData): Promise<TState> {
  const parsed = templateInputSchema.safeParse(readTemplate(fd));
  if (!parsed.success) return fail("validation", undefined, parsed.error.issues.map((i) => String(i.path[0])));
  const id = idOf(fd);
  return mutate(fd, async (tx, c) => {
    if (id) await updateTemplate(tx, { clubId: c.clubId }, id, parsed.data);
    else await createTemplate(tx, { clubId: c.clubId }, parsed.data);
  });
}

export async function deleteTemplateAction(_prev: TState, fd: FormData): Promise<TState> {
  const id = idOf(fd);
  if (!id) return fail("not_found");
  return mutate(fd, async (tx, c) => { await deleteTemplate(tx, { clubId: c.clubId }, id); });
}

// Horarios y partidos en juego ---------------------------------------------------------------------
/** Día + hora locales del club. Con los dos campos vacíos se quita el horario. */
export async function setScheduleAction(_prev: TState, fd: FormData): Promise<TState> {
  const id = idOf(fd);
  if (!id) return fail("not_found");
  const date = String(fd.get("date") ?? "").trim(), time = String(fd.get("time") ?? "").trim();
  if (!date && !time) return mutate(fd, async (tx, c) => { await setMatchSchedule(tx, { clubId: c.clubId }, id, null); });
  return mutate(fd, async (tx, c) => {
    const at = localToUtc(date, time, c.timezone);
    if (!at) throw new TournamentError("schedule_invalid");
    await setMatchSchedule(tx, { clubId: c.clubId }, id, at);
  });
}

/** El club marca qué partidos se están jugando ahora (live=1) o los saca (live=0). */
export async function setLiveAction(_prev: TState, fd: FormData): Promise<TState> {
  const id = idOf(fd);
  if (!id) return fail("not_found");
  const live = fd.get("live") === "1";
  return mutate(fd, async (tx, c) => { await setMatchLive(tx, { clubId: c.clubId }, id, live); });
}

// Ajustes a mano ------------------------------------------------------------------------------------
const sideOf = (v: FormDataEntryValue | null): Side | null => (v === "a" || v === "b" ? v : null);

/** Pone una pareja a mano en un lugar de la primera ronda (entry vacío = volver a automático). */
export async function setSlotEntryAction(_prev: TState, fd: FormData): Promise<TState> {
  const matchId = idOf(fd), side = sideOf(fd.get("side")), entry = String(fd.get("entry") ?? "");
  if (!matchId || !side || (entry && !UUID.test(entry))) return fail("not_found");
  return mutate(fd, async (tx, c) => { await setSlotEntry(tx, { clubId: c.clubId }, { matchId, side }, entry || null); });
}

export async function restoreSlotAction(_prev: TState, fd: FormData): Promise<TState> {
  const matchId = idOf(fd), side = sideOf(fd.get("side"));
  if (!matchId || !side) return fail("not_found");
  return mutate(fd, async (tx, c) => { await restoreSlot(tx, { clubId: c.clubId }, { matchId, side }); });
}

/** Intercambia dos lugares de la primera ronda. `other` = "<id de partido>:<a|b>". */
export async function swapSlotsAction(_prev: TState, fd: FormData): Promise<TState> {
  const matchId = idOf(fd), side = sideOf(fd.get("side"));
  const [otherId, otherSide] = String(fd.get("other") ?? "").split(":");
  if (!matchId || !side || !UUID.test(otherId ?? "") || (otherSide !== "a" && otherSide !== "b")) return fail("not_found");
  return mutate(fd, async (tx, c) => { await swapSlots(tx, { clubId: c.clubId }, { matchId, side }, { matchId: otherId, side: otherSide }); });
}

/** Cambia de zona a dos parejas entre sí. */
export async function swapZoneEntriesAction(_prev: TState, fd: FormData): Promise<TState> {
  const a = idOf(fd), b = idOf(fd, "other");
  if (!a || !b) return fail("not_found");
  return mutate(fd, async (tx, c) => { await swapZoneEntries(tx, { clubId: c.clubId }, a, b); });
}

/** Cambia a un jugador de una pareja por otro del club. */
export async function replacePlayerAction(_prev: TState, fd: FormData): Promise<TState> {
  const entry = idOf(fd), oldP = idOf(fd, "old"), newP = idOf(fd, "new");
  if (!entry || !oldP || !newP) return fail("pair_missing");
  return mutate(fd, async (tx, c) => { await replacePlayer(tx, { clubId: c.clubId }, entry, oldP, newP); });
}
