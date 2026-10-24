CREATE TABLE "club_logos" (
	"club_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text DEFAULT 'image/webp' NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_logos_type_chk" CHECK ("club_logos"."content_type" = 'image/webp'),
	CONSTRAINT "club_logos_size_chk" CHECK (octet_length("club_logos"."data") between 1 and 600000)
);
--> statement-breakpoint
ALTER TABLE "club_logos" ADD CONSTRAINT "club_logos_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- RLS, igual que el resto de las tablas con club_id (ver 0001): el club solo toca su logo; la plataforma sirve el logo público.
ALTER TABLE "club_logos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "club_logos" TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
  WITH CHECK (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "club_logos" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "club_logos" TO app_user, platform_user;
