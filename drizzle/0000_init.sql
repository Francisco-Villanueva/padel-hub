CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TYPE "public"."category_branch" AS ENUM('libre', 'caballeros', 'mujeres');--> statement-breakpoint
CREATE TYPE "public"."club_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."player_gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."player_position" AS ENUM('drive', 'reves', 'drive_zurdo');--> statement-breakpoint
CREATE TYPE "public"."player_source" AS ENUM('link', 'tablet', 'manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."time_slot" AS ENUM('manana', 'tarde_temprano', 'tarde', 'noche');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"club_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_tokens_kind_chk" CHECK ("auth_tokens"."kind" in ('invite','reset'))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"branch" "category_branch" NOT NULL,
	"custom_label" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categories_club_level_branch_uq" UNIQUE("club_id","level","branch"),
	CONSTRAINT "categories_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "categories_level_chk" CHECK ("categories"."level" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "club_members" (
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_members_club_id_user_id_pk" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text DEFAULT 'AR' NOT NULL,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"contact_email" text,
	"logo_url" text,
	"color_primary" text,
	"color_accent" text,
	"status" "club_status" DEFAULT 'active' NOT NULL,
	"plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "clubs_slug_chk" CHECK ("clubs"."slug" ~ '^[a-z0-9-]{3,40}$'),
	CONSTRAINT "clubs_country_chk" CHECK ("clubs"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "clubs_locale_chk" CHECK (locale in ('es','en','pt')),
	CONSTRAINT "clubs_color_primary_chk" CHECK ("clubs"."color_primary" ~ '^#[0-9a-fA-F]{6}$'),
	CONSTRAINT "clubs_color_accent_chk" CHECK ("clubs"."color_accent" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "contact_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_log_reason_chk" CHECK ("contact_log"."reason" in ('falta_cuarto','evento','otro'))
);
--> statement-breakpoint
CREATE TABLE "event_invites" (
	"event_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_invites_event_id_player_id_pk" PRIMARY KEY("event_id","player_id"),
	CONSTRAINT "event_invites_status_chk" CHECK ("event_invites"."status" in ('pendiente','contactado','confirmado','rechazado'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone,
	"location" text,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "events_kind_chk" CHECK ("events"."kind" in ('liga','americano','torneo','partido'))
);
--> statement-breakpoint
CREATE TABLE "player_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text_version" text NOT NULL,
	"locale" text NOT NULL,
	"source" "player_source" NOT NULL,
	"ip_hash" text,
	CONSTRAINT "player_consents_locale_chk" CHECK (locale in ('es','en','pt'))
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"gender" "player_gender" NOT NULL,
	"category_id" uuid,
	"phone_e164" text NOT NULL,
	"position" "player_position",
	"slots" time_slot[] DEFAULT '{}' NOT NULL,
	"photo_url" text,
	"instagram" text,
	"locality" text,
	"source" "player_source" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "players_club_phone_uq" UNIQUE("club_id","phone_e164"),
	CONSTRAINT "players_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "players_first_name_chk" CHECK (length("players"."first_name") between 1 and 80),
	CONSTRAINT "players_last_name_chk" CHECK (length("players"."last_name") between 1 and 80),
	CONSTRAINT "players_phone_chk" CHECK ("players"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "players_instagram_chk" CHECK ("players"."instagram" ~ '^[A-Za-z0-9._]{1,30}$')
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"club_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "signup_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"token" text NOT NULL,
	"kind" "player_source" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_links_token_unique" UNIQUE("token"),
	CONSTRAINT "signup_links_kind_chk" CHECK ("signup_links"."kind" in ('link','tablet'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"locale" text,
	"is_superadmin" boolean DEFAULT false NOT NULL,
	"failed_logins" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_locale_chk" CHECK (locale in ('es','en','pt'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_log" ADD CONSTRAINT "contact_log_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_log" ADD CONSTRAINT "contact_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_log" ADD CONSTRAINT "contact_log_player_same_club_fk" FOREIGN KEY ("player_id","club_id") REFERENCES "public"."players"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_event_same_club_fk" FOREIGN KEY ("event_id","club_id") REFERENCES "public"."events"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_player_same_club_fk" FOREIGN KEY ("player_id","club_id") REFERENCES "public"."players"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_consents" ADD CONSTRAINT "player_consents_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_consents" ADD CONSTRAINT "player_consents_player_same_club_fk" FOREIGN KEY ("player_id","club_id") REFERENCES "public"."players"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_category_same_club_fk" FOREIGN KEY ("category_id","club_id") REFERENCES "public"."categories"("id","club_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_links" ADD CONSTRAINT "signup_links_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_log_player_idx" ON "contact_log" USING btree ("club_id","player_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "players_club_active_idx" ON "players" USING btree ("club_id") WHERE "players"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "players_slots_gin" ON "players" USING gin ("slots");--> statement-breakpoint
CREATE INDEX "players_search_idx" ON "players" USING btree ("club_id","category_id","gender") WHERE "players"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id") WHERE "refresh_tokens"."revoked_at" is null;