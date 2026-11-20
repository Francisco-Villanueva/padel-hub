// Esquema de PadelHub (ver docs/system-design.md, sección 6).
// RLS, roles y grants viven en una migración SQL aparte (drizzle/0001_rls.sql).
import { sql } from 'drizzle-orm';
import {
  bigserial, boolean, check, customType, date, foreignKey, index, integer, jsonb, pgEnum, pgTable,
  primaryKey, smallint, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const LOCALES = ['es', 'en', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
const localeCheck = (col: string) => sql.raw(`${col} in ('es','en','pt')`);

export const clubStatus = pgEnum('club_status', ['active', 'suspended']);
export const memberRole = pgEnum('member_role', ['owner', 'staff']);
export const playerGender = pgEnum('player_gender', ['male', 'female']);
export const playerPosition = pgEnum('player_position', ['drive', 'reves', 'drive_zurdo']);
export const timeSlot = pgEnum('time_slot', ['manana', 'tarde_temprano', 'tarde', 'noche']);
export const playerSource = pgEnum('player_source', ['link', 'tablet', 'manual', 'import']);

// Tenants ---------------------------------------------------------------------
export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  country: text('country').notNull().default('AR'),
  timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
  locale: text('locale').notNull().default('es').$type<Locale>(),
  contactEmail: text('contact_email'),
  logoUrl: text('logo_url'),
  colorPrimary: text('color_primary'),
  colorAccent: text('color_accent'),
  status: clubStatus('status').notNull().default('active'),
  planId: uuid('plan_id'), // post-MVP (billing)
  // Fin de la prueba gratuita. Pasada esa fecha sin pago, el club se suspende (suspendExpiredTrials). Nulo = sin prueba (alta manual o ya pago).
  trialEndsAt: ts('trial_ends_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  check('clubs_slug_chk', sql`${t.slug} ~ '^[a-z0-9-]{3,40}$'`),
  check('clubs_country_chk', sql`${t.country} ~ '^[A-Z]{2}$'`),
  check('clubs_locale_chk', localeCheck('locale')),
  check('clubs_color_primary_chk', sql`${t.colorPrimary} ~ '^#[0-9a-fA-F]{6}$'`),
  check('clubs_color_accent_chk', sql`${t.colorAccent} ~ '^#[0-9a-fA-F]{6}$'`),
]);

// Logo del club ---------------------------------------------------------------------------
// La imagen ya procesada (WebP chico, sin metadatos) vive en la base: sin servicio de archivos aparte, con RLS como el resto
// y con backup junto con los datos. `clubs.logo_url` guarda la URL pública versionada (/api/logo/<slug>?v=...) o null.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const clubLogos = pgTable('club_logos', {
  clubId: uuid('club_id').primaryKey().references(() => clubs.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull().default('image/webp'),
  data: bytea('data').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  check('club_logos_type_chk', sql`${t.contentType} = 'image/webp'`),
  check('club_logos_size_chk', sql`octet_length(${t.data}) between 1 and 600000`),
]);

// Funciones habilitadas por club (feature flags) ---------------------------------------------
// Solo el superadmin escribe (platform_user); el club (app_user) únicamente lee las filas propias. Sin fila = apagado.
export const clubFeatures = pgTable('club_features', {
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  feature: text('feature').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  enabledAt: ts('enabled_at'),
  enabledBy: uuid('enabled_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => [
  primaryKey({ columns: [t.clubId, t.feature] }),
  check('club_features_feature_chk', sql`${t.feature} in ('tournaments')`),
]);

// Usuarios y sesiones -------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  locale: text('locale').$type<Locale>(), // null = usar el idioma del club
  isSuperadmin: boolean('is_superadmin').notNull().default(false),
  failedLogins: smallint('failed_logins').notNull().default(0),
  lockedUntil: ts('locked_until'),
  disabledAt: ts('disabled_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, () => [check('users_locale_chk', localeCheck('locale'))]);

export const clubMembers = pgTable('club_members', {
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.clubId, t.userId] })]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  familyId: uuid('family_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  revokedAt: ts('revoked_at'),
  userAgent: text('user_agent'),
  ipHash: text('ip_hash'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  index('refresh_tokens_family_idx').on(t.familyId),
  index('refresh_tokens_user_idx').on(t.userId).where(sql`${t.revokedAt} is null`),
]);

export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().$type<'invite' | 'reset'>(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [check('auth_tokens_kind_chk', sql`${t.kind} in ('invite','reset')`)]);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: ts('window_start').notNull(),
});

// Jugadores ----------------------------------------------------------------------------
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  gender: playerGender('gender').notNull(),
  category: smallint('category'), // nivel 1 a 8, 9 = Principiantes (nulo = sin categoría). El género va aparte, en `gender`.
  phoneE164: text('phone_e164').notNull(),
  position: playerPosition('position'),
  slots: timeSlot('slots').array().notNull().default(sql`'{}'`),
  photoUrl: text('photo_url'),
  instagram: text('instagram'), // sin "@"
  locality: text('locality'),
  source: playerSource('source').notNull(),
  notes: text('notes'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: ts('deleted_at'),
}, (t) => [
  unique('players_club_phone_uq').on(t.clubId, t.phoneE164),
  unique('players_id_club_uq').on(t.id, t.clubId),
  check('players_category_chk', sql`${t.category} between 1 and 9`),
  check('players_first_name_chk', sql`length(${t.firstName}) between 1 and 80`),
  check('players_last_name_chk', sql`length(${t.lastName}) between 1 and 80`),
  check('players_phone_chk', sql`${t.phoneE164} ~ '^\\+[1-9][0-9]{7,14}$'`),
  check('players_instagram_chk', sql`${t.instagram} ~ '^[A-Za-z0-9._]{1,30}$'`),
  index('players_club_active_idx').on(t.clubId).where(sql`${t.deletedAt} is null`),
  index('players_slots_gin').using('gin', t.slots),
  index('players_search_idx').on(t.clubId, t.category, t.gender).where(sql`${t.deletedAt} is null`),
]);

export const playerConsents = pgTable('player_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull(),
  acceptedAt: ts('accepted_at').notNull().defaultNow(),
  textVersion: text('text_version').notNull(),
  locale: text('locale').notNull().$type<Locale>(),
  source: playerSource('source').notNull(),
  ipHash: text('ip_hash'),
}, (t) => [
  foreignKey({ columns: [t.playerId, t.clubId], foreignColumns: [players.id, players.clubId], name: 'player_consents_player_same_club_fk' }).onDelete('cascade'),
  check('player_consents_locale_chk', localeCheck('locale')),
]);

export const signupLinks = pgTable('signup_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  kind: playerSource('kind').notNull().$type<'link' | 'tablet'>(),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [check('signup_links_kind_chk', sql`${t.kind} in ('link','tablet')`)]);

// Contactos y eventos ---------------------------------------------------------------------
export const contactLog = pgTable('contact_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  reason: text('reason').notNull().$type<'falta_cuarto' | 'evento' | 'otro'>(),
  eventId: uuid('event_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.playerId, t.clubId], foreignColumns: [players.id, players.clubId], name: 'contact_log_player_same_club_fk' }).onDelete('cascade'),
  check('contact_log_reason_chk', sql`${t.reason} in ('falta_cuarto','evento','otro')`),
  index('contact_log_player_idx').on(t.clubId, t.playerId, t.createdAt.desc()),
]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().$type<'liga' | 'americano' | 'torneo' | 'partido'>(),
  title: text('title').notNull(),
  startsAt: ts('starts_at'),
  location: text('location'),
  filters: jsonb('filters').notNull().default(sql`'{}'::jsonb`),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  unique('events_id_club_uq').on(t.id, t.clubId),
  check('events_kind_chk', sql`${t.kind} in ('liga','americano','torneo','partido')`),
]);

export const eventInvites = pgTable('event_invites', {
  eventId: uuid('event_id').notNull(),
  playerId: uuid('player_id').notNull(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pendiente').$type<'pendiente' | 'contactado' | 'confirmado' | 'rechazado'>(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.eventId, t.playerId] }),
  foreignKey({ columns: [t.eventId, t.clubId], foreignColumns: [events.id, events.clubId], name: 'event_invites_event_same_club_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.playerId, t.clubId], foreignColumns: [players.id, players.clubId], name: 'event_invites_player_same_club_fk' }).onDelete('cascade'),
  check('event_invites_status_chk', sql`${t.status} in ('pendiente','contactado','confirmado','rechazado')`),
]);

// Auditoría ------------------------------------------------------------------------------------
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  detail: jsonb('detail'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

// Torneos y rankings (docs/torneos-y-rankings.md, sección 7) ------------------------------------
// Todas con club_id, RLS (drizzle/0008_tournaments.sql) y FK compuestas (id, club_id): nada referencia filas de otro club.
const ROUND_KEYS_SQL = "('champion','final','semifinal','quarterfinal','round_of_16','round_of_32','round_of_64','round_of_128')";
const MODALITIES_SQL = "('libre','mixto','masculino','femenino')";

export const tournamentTemplates = pgTable('tournament_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  championPoints: integer('champion_points').notNull(),
  participationPoints: integer('participation_points').notNull().default(0),
  /** Porcentaje por ronda ({ final: 60, … }); null = los del motor. */
  roundPercents: jsonb('round_percents').$type<Record<string, number> | null>(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique('tournament_templates_id_club_uq').on(t.id, t.clubId),
  check('tournament_templates_name_chk', sql`length(${t.name}) between 1 and 80`),
  check('tournament_templates_points_chk', sql`${t.championPoints} > 0 and ${t.participationPoints} >= 0`),
]);

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  modality: text('modality').notNull(),
  categoryRuleKind: text('category_rule_kind').notNull(), // single | sum
  categoryRuleValue: smallint('category_rule_value').notNull(),
  isRanked: boolean('is_ranked').notNull().default(false),
  minPairs: smallint('min_pairs').notNull(),
  status: text('status').notNull().default('borrador'),
  championPoints: integer('champion_points').notNull(),
  participationPoints: integer('participation_points').notNull().default(0),
  /** Snapshot de los puntos por ronda al crear el torneo (editar la plantilla después no lo cambia). */
  pointsTable: jsonb('points_table').$type<Record<string, number>>().notNull(),
  templateId: uuid('template_id'), // informativo: sin FK, la plantilla se puede borrar
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on'),
  seedWindow: text('seed_window').notNull().default('all'),
  drawSeed: integer('draw_seed'), // semilla del sorteo de zonas (reproducible)
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  cancelledAt: ts('cancelled_at'),
  closedAt: ts('closed_at'),
}, (t) => [
  unique('tournaments_id_club_uq').on(t.id, t.clubId),
  check('tournaments_name_chk', sql`length(${t.name}) between 1 and 100`),
  check('tournaments_modality_chk', sql.raw(`modality in ${MODALITIES_SQL}`)),
  check('tournaments_rule_kind_chk', sql`${t.categoryRuleKind} in ('single','sum')`),
  check('tournaments_rule_value_chk', sql`(${t.categoryRuleKind} = 'single' and ${t.categoryRuleValue} between 1 and 9) or (${t.categoryRuleKind} = 'sum' and ${t.categoryRuleValue} between 2 and 18)`),
  check('tournaments_min_pairs_chk', sql`${t.minPairs} >= 6`),
  check('tournaments_status_chk', sql`${t.status} in ('borrador','inscripcion','zonas','llave','cerrado','cancelado')`),
  check('tournaments_points_chk', sql`${t.championPoints} > 0 and ${t.participationPoints} >= 0`),
  check('tournaments_seed_window_chk', sql`${t.seedWindow} in ('month','6months','year','all')`),
  index('tournaments_club_status_idx').on(t.clubId, t.status),
]);

export const tournamentZones = pgTable('tournament_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  tournamentId: uuid('tournament_id').notNull(),
  name: text('name').notNull(),
  size: smallint('size').notNull(),
  position: smallint('position').notNull(),
  /** Sorteo de desempate: { seed, order: [entryId…] }. Queda registrado. */
  tieDraw: jsonb('tie_draw'),
}, (t) => [
  unique('tournament_zones_id_club_uq').on(t.id, t.clubId),
  unique('tournament_zones_position_uq').on(t.tournamentId, t.position),
  foreignKey({ columns: [t.tournamentId, t.clubId], foreignColumns: [tournaments.id, tournaments.clubId], name: 'tournament_zones_tournament_same_club_fk' }).onDelete('cascade'),
  check('tournament_zones_size_chk', sql`${t.size} in (3,4)`),
]);

export const tournamentEntries = pgTable('tournament_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  tournamentId: uuid('tournament_id').notNull(),
  player1Id: uuid('player1_id').notNull(),
  player2Id: uuid('player2_id').notNull(),
  seed: smallint('seed'),
  zoneId: uuid('zone_id'),
  status: text('status').notNull().default('inscripta'), // inscripta | baja
  roundReached: text('round_reached'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  unique('tournament_entries_id_club_uq').on(t.id, t.clubId),
  foreignKey({ columns: [t.tournamentId, t.clubId], foreignColumns: [tournaments.id, tournaments.clubId], name: 'tournament_entries_tournament_same_club_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.player1Id, t.clubId], foreignColumns: [players.id, players.clubId], name: 'tournament_entries_player1_same_club_fk' }),
  foreignKey({ columns: [t.player2Id, t.clubId], foreignColumns: [players.id, players.clubId], name: 'tournament_entries_player2_same_club_fk' }),
  foreignKey({ columns: [t.zoneId, t.clubId], foreignColumns: [tournamentZones.id, tournamentZones.clubId], name: 'tournament_entries_zone_same_club_fk' }),
  check('tournament_entries_players_chk', sql`${t.player1Id} <> ${t.player2Id}`),
  check('tournament_entries_status_chk', sql`${t.status} in ('inscripta','baja')`),
  check('tournament_entries_round_chk', sql.raw(`round_reached is null or round_reached in ${ROUND_KEYS_SQL}`)),
  index('tournament_entries_tournament_idx').on(t.tournamentId),
]);

// Un jugador no puede estar en dos parejas activas del mismo torneo: una fila por jugador de cada pareja inscripta.
// El servicio las crea al inscribir y las borra al dar de baja; la restricción única lo garantiza aunque dos pedidos corran a la vez.
export const tournamentEntryPlayers = pgTable('tournament_entry_players', {
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  tournamentId: uuid('tournament_id').notNull(),
  entryId: uuid('entry_id').notNull(),
  playerId: uuid('player_id').notNull(),
}, (t) => [
  primaryKey({ columns: [t.entryId, t.playerId] }),
  unique('tournament_entry_players_tournament_player_uq').on(t.tournamentId, t.playerId),
  foreignKey({ columns: [t.tournamentId, t.clubId], foreignColumns: [tournaments.id, tournaments.clubId], name: 'tournament_entry_players_tournament_same_club_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.entryId, t.clubId], foreignColumns: [tournamentEntries.id, tournamentEntries.clubId], name: 'tournament_entry_players_entry_same_club_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.playerId, t.clubId], foreignColumns: [players.id, players.clubId], name: 'tournament_entry_players_player_same_club_fk' }),
]);

export const tournamentMatches = pgTable('tournament_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  tournamentId: uuid('tournament_id').notNull(),
  stage: text('stage').notNull(), // zona | llave
  zoneId: uuid('zone_id'),
  round: smallint('round').notNull(),
  position: smallint('position').notNull(),
  entryAId: uuid('entry_a_id'),
  entryBId: uuid('entry_b_id'),
  /** Games por set: [[6,4],[3,6],[6,2]] (A, B). */
  sets: jsonb('sets').$type<[number, number][]>(),
  winnerEntryId: uuid('winner_entry_id'),
  status: text('status').notNull().default('pendiente'), // pendiente | jugado | bye
  nextMatchId: uuid('next_match_id'),
  nextSlot: text('next_slot'), // a | b
  playedAt: ts('played_at'),
}, (t) => [
  unique('tournament_matches_id_club_uq').on(t.id, t.clubId),
  foreignKey({ columns: [t.tournamentId, t.clubId], foreignColumns: [tournaments.id, tournaments.clubId], name: 'tournament_matches_tournament_same_club_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.zoneId, t.clubId], foreignColumns: [tournamentZones.id, tournamentZones.clubId], name: 'tournament_matches_zone_same_club_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.entryAId, t.clubId], foreignColumns: [tournamentEntries.id, tournamentEntries.clubId], name: 'tournament_matches_entry_a_same_club_fk' }),
  foreignKey({ columns: [t.entryBId, t.clubId], foreignColumns: [tournamentEntries.id, tournamentEntries.clubId], name: 'tournament_matches_entry_b_same_club_fk' }),
  foreignKey({ columns: [t.winnerEntryId, t.clubId], foreignColumns: [tournamentEntries.id, tournamentEntries.clubId], name: 'tournament_matches_winner_same_club_fk' }),
  foreignKey({ columns: [t.nextMatchId, t.clubId], foreignColumns: [t.id, t.clubId], name: 'tournament_matches_next_same_club_fk' }),
  check('tournament_matches_stage_chk', sql`${t.stage} in ('zona','llave')`),
  check('tournament_matches_status_chk', sql`${t.status} in ('pendiente','jugado','bye')`),
  check('tournament_matches_slot_chk', sql`${t.nextSlot} is null or ${t.nextSlot} in ('a','b')`),
  check('tournament_matches_winner_chk', sql`${t.winnerEntryId} is null or coalesce(${t.winnerEntryId} = ${t.entryAId}, false) or coalesce(${t.winnerEntryId} = ${t.entryBId}, false)`),
  index('tournament_matches_tournament_idx').on(t.tournamentId, t.stage, t.round, t.position),
]);

// Libro de puntos: el ranking se calcula sumando estas filas. Única por (torneo, jugador): cerrar dos veces no duplica.
export const rankingEvents = pgTable('ranking_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull(),
  tournamentId: uuid('tournament_id').notNull(),
  entryId: uuid('entry_id').notNull(),
  roundReached: text('round_reached'), // null = no pasó la zona (solo participación)
  points: integer('points').notNull(),
  tournamentEndedOn: date('tournament_ended_on').notNull(),
  categoryRuleKind: text('category_rule_kind').notNull(),
  categoryRuleValue: smallint('category_rule_value').notNull(),
  modality: text('modality').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [
  unique('ranking_events_tournament_player_uq').on(t.tournamentId, t.playerId),
  foreignKey({ columns: [t.playerId, t.clubId], foreignColumns: [players.id, players.clubId], name: 'ranking_events_player_same_club_fk' }),
  foreignKey({ columns: [t.tournamentId, t.clubId], foreignColumns: [tournaments.id, tournaments.clubId], name: 'ranking_events_tournament_same_club_fk' }).onDelete('cascade'),
  foreignKey({ columns: [t.entryId, t.clubId], foreignColumns: [tournamentEntries.id, tournamentEntries.clubId], name: 'ranking_events_entry_same_club_fk' }).onDelete('cascade'),
  check('ranking_events_points_chk', sql`${t.points} >= 0`),
  check('ranking_events_round_chk', sql.raw(`round_reached is null or round_reached in ${ROUND_KEYS_SQL}`)),
  index('ranking_events_group_idx').on(t.clubId, t.categoryRuleKind, t.categoryRuleValue, t.modality, t.tournamentEndedOn),
]);
