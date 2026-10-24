// Esquema de PadelHub (ver docs/system-design.md, sección 6).
// RLS, roles y grants viven en una migración SQL aparte (drizzle/0001_rls.sql).
import { sql } from 'drizzle-orm';
import {
  bigserial, boolean, check, customType, foreignKey, index, integer, jsonb, pgEnum, pgTable,
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
  // Por defecto una cuenta nace activada (tiene contraseña). Una invitación la crea en NULL explícito y queda pendiente hasta elegir contraseña: sin ella no puede iniciar sesión.
  activatedAt: ts('activated_at').defaultNow(),
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
  category: smallint('category'), // nivel 1 a 8 (nulo = sin categoría). El género va aparte, en `gender`.
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
  check('players_category_chk', sql`${t.category} between 1 and 8`),
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
