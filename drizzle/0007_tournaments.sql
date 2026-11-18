CREATE TABLE "ranking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"round_reached" text,
	"points" integer NOT NULL,
	"tournament_ended_on" date NOT NULL,
	"category_rule_kind" text NOT NULL,
	"category_rule_value" smallint NOT NULL,
	"modality" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_events_tournament_player_uq" UNIQUE("tournament_id","player_id"),
	CONSTRAINT "ranking_events_points_chk" CHECK ("ranking_events"."points" >= 0),
	CONSTRAINT "ranking_events_round_chk" CHECK (round_reached is null or round_reached in ('champion','final','semifinal','quarterfinal','round_of_16','round_of_32','round_of_64','round_of_128'))
);
--> statement-breakpoint
CREATE TABLE "tournament_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player1_id" uuid NOT NULL,
	"player2_id" uuid NOT NULL,
	"seed" smallint,
	"zone_id" uuid,
	"status" text DEFAULT 'inscripta' NOT NULL,
	"round_reached" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_entries_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "tournament_entries_players_chk" CHECK ("tournament_entries"."player1_id" <> "tournament_entries"."player2_id"),
	CONSTRAINT "tournament_entries_status_chk" CHECK ("tournament_entries"."status" in ('inscripta','baja')),
	CONSTRAINT "tournament_entries_round_chk" CHECK (round_reached is null or round_reached in ('champion','final','semifinal','quarterfinal','round_of_16','round_of_32','round_of_64','round_of_128'))
);
--> statement-breakpoint
CREATE TABLE "tournament_entry_players" (
	"club_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	CONSTRAINT "tournament_entry_players_entry_id_player_id_pk" PRIMARY KEY("entry_id","player_id"),
	CONSTRAINT "tournament_entry_players_tournament_player_uq" UNIQUE("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"zone_id" uuid,
	"round" smallint NOT NULL,
	"position" smallint NOT NULL,
	"entry_a_id" uuid,
	"entry_b_id" uuid,
	"sets" jsonb,
	"winner_entry_id" uuid,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"next_match_id" uuid,
	"next_slot" text,
	"played_at" timestamp with time zone,
	CONSTRAINT "tournament_matches_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "tournament_matches_stage_chk" CHECK ("tournament_matches"."stage" in ('zona','llave')),
	CONSTRAINT "tournament_matches_status_chk" CHECK ("tournament_matches"."status" in ('pendiente','jugado','bye')),
	CONSTRAINT "tournament_matches_slot_chk" CHECK ("tournament_matches"."next_slot" is null or "tournament_matches"."next_slot" in ('a','b')),
	CONSTRAINT "tournament_matches_winner_chk" CHECK ("tournament_matches"."winner_entry_id" is null or "tournament_matches"."winner_entry_id" = "tournament_matches"."entry_a_id" or "tournament_matches"."winner_entry_id" = "tournament_matches"."entry_b_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"champion_points" integer NOT NULL,
	"participation_points" integer DEFAULT 0 NOT NULL,
	"round_percents" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_templates_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "tournament_templates_name_chk" CHECK (length("tournament_templates"."name") between 1 and 80),
	CONSTRAINT "tournament_templates_points_chk" CHECK ("tournament_templates"."champion_points" > 0 and "tournament_templates"."participation_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tournament_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"size" smallint NOT NULL,
	"position" smallint NOT NULL,
	"tie_draw" jsonb,
	CONSTRAINT "tournament_zones_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "tournament_zones_position_uq" UNIQUE("tournament_id","position"),
	CONSTRAINT "tournament_zones_size_chk" CHECK ("tournament_zones"."size" in (3,4))
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"modality" text NOT NULL,
	"category_rule_kind" text NOT NULL,
	"category_rule_value" smallint NOT NULL,
	"is_ranked" boolean DEFAULT false NOT NULL,
	"min_pairs" smallint NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"champion_points" integer NOT NULL,
	"participation_points" integer DEFAULT 0 NOT NULL,
	"points_table" jsonb NOT NULL,
	"template_id" uuid,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"seed_window" text DEFAULT 'all' NOT NULL,
	"draw_seed" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "tournaments_id_club_uq" UNIQUE("id","club_id"),
	CONSTRAINT "tournaments_name_chk" CHECK (length("tournaments"."name") between 1 and 100),
	CONSTRAINT "tournaments_modality_chk" CHECK (modality in ('libre','mixto','masculino','femenino')),
	CONSTRAINT "tournaments_rule_kind_chk" CHECK ("tournaments"."category_rule_kind" in ('single','sum')),
	CONSTRAINT "tournaments_rule_value_chk" CHECK (("tournaments"."category_rule_kind" = 'single' and "tournaments"."category_rule_value" between 1 and 9) or ("tournaments"."category_rule_kind" = 'sum' and "tournaments"."category_rule_value" between 2 and 18)),
	CONSTRAINT "tournaments_min_pairs_chk" CHECK ("tournaments"."min_pairs" >= 6),
	CONSTRAINT "tournaments_status_chk" CHECK ("tournaments"."status" in ('borrador','inscripcion','zonas','llave','cerrado','cancelado')),
	CONSTRAINT "tournaments_points_chk" CHECK ("tournaments"."champion_points" > 0 and "tournaments"."participation_points" >= 0),
	CONSTRAINT "tournaments_seed_window_chk" CHECK ("tournaments"."seed_window" in ('month','6months','year','all'))
);
--> statement-breakpoint
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_player_same_club_fk" FOREIGN KEY ("player_id","club_id") REFERENCES "public"."players"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_tournament_same_club_fk" FOREIGN KEY ("tournament_id","club_id") REFERENCES "public"."tournaments"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_events" ADD CONSTRAINT "ranking_events_entry_same_club_fk" FOREIGN KEY ("entry_id","club_id") REFERENCES "public"."tournament_entries"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_tournament_same_club_fk" FOREIGN KEY ("tournament_id","club_id") REFERENCES "public"."tournaments"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_player1_same_club_fk" FOREIGN KEY ("player1_id","club_id") REFERENCES "public"."players"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_player2_same_club_fk" FOREIGN KEY ("player2_id","club_id") REFERENCES "public"."players"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_zone_same_club_fk" FOREIGN KEY ("zone_id","club_id") REFERENCES "public"."tournament_zones"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry_players" ADD CONSTRAINT "tournament_entry_players_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry_players" ADD CONSTRAINT "tournament_entry_players_tournament_same_club_fk" FOREIGN KEY ("tournament_id","club_id") REFERENCES "public"."tournaments"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry_players" ADD CONSTRAINT "tournament_entry_players_entry_same_club_fk" FOREIGN KEY ("entry_id","club_id") REFERENCES "public"."tournament_entries"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entry_players" ADD CONSTRAINT "tournament_entry_players_player_same_club_fk" FOREIGN KEY ("player_id","club_id") REFERENCES "public"."players"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_same_club_fk" FOREIGN KEY ("tournament_id","club_id") REFERENCES "public"."tournaments"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_zone_same_club_fk" FOREIGN KEY ("zone_id","club_id") REFERENCES "public"."tournament_zones"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_entry_a_same_club_fk" FOREIGN KEY ("entry_a_id","club_id") REFERENCES "public"."tournament_entries"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_entry_b_same_club_fk" FOREIGN KEY ("entry_b_id","club_id") REFERENCES "public"."tournament_entries"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_same_club_fk" FOREIGN KEY ("winner_entry_id","club_id") REFERENCES "public"."tournament_entries"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_next_same_club_fk" FOREIGN KEY ("next_match_id","club_id") REFERENCES "public"."tournament_matches"("id","club_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_templates" ADD CONSTRAINT "tournament_templates_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_zones" ADD CONSTRAINT "tournament_zones_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_zones" ADD CONSTRAINT "tournament_zones_tournament_same_club_fk" FOREIGN KEY ("tournament_id","club_id") REFERENCES "public"."tournaments"("id","club_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ranking_events_group_idx" ON "ranking_events" USING btree ("club_id","category_rule_kind","category_rule_value","modality","tournament_ended_on");--> statement-breakpoint
CREATE INDEX "tournament_entries_tournament_idx" ON "tournament_entries" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_matches_tournament_idx" ON "tournament_matches" USING btree ("tournament_id","stage","round","position");--> statement-breakpoint
CREATE INDEX "tournaments_club_status_idx" ON "tournaments" USING btree ("club_id","status");
--> statement-breakpoint
-- RLS en todas las tablas nuevas (ver 0001 y 0004): el club solo toca lo suyo; la plataforma ve todo. Nunca FORCE.
-- El ranking público (paso 8) saldrá por una función SECURITY DEFINER aparte, que además comprueba el flag.
ALTER TABLE "tournament_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tournament_templates" TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "tournament_templates" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tournament_templates" TO app_user, platform_user;--> statement-breakpoint
ALTER TABLE "tournaments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tournaments" TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "tournaments" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tournaments" TO app_user, platform_user;--> statement-breakpoint
ALTER TABLE "tournament_zones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tournament_zones" TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "tournament_zones" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tournament_zones" TO app_user, platform_user;--> statement-breakpoint
ALTER TABLE "tournament_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tournament_entries" TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "tournament_entries" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tournament_entries" TO app_user, platform_user;--> statement-breakpoint
ALTER TABLE "tournament_entry_players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tournament_entry_players" TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "tournament_entry_players" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tournament_entry_players" TO app_user, platform_user;--> statement-breakpoint
ALTER TABLE "tournament_matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tournament_matches" TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "tournament_matches" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tournament_matches" TO app_user, platform_user;--> statement-breakpoint
ALTER TABLE "ranking_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ranking_events" TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "ranking_events" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "ranking_events" TO app_user, platform_user;
