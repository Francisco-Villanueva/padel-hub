CREATE TABLE "club_features" (
	"club_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"enabled_by" uuid,
	CONSTRAINT "club_features_club_id_feature_pk" PRIMARY KEY("club_id","feature"),
	CONSTRAINT "club_features_feature_chk" CHECK ("club_features"."feature" in ('tournaments'))
);
--> statement-breakpoint
ALTER TABLE "club_features" ADD CONSTRAINT "club_features_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_features" ADD CONSTRAINT "club_features_enabled_by_users_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- RLS (ver 0001 y 0004), con grants distintos: el club solo LEE sus funciones; escribe únicamente la plataforma (superadmin).
ALTER TABLE "club_features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "club_features" FOR SELECT TO app_user
  USING (club_id = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY platform_all ON "club_features" TO platform_user USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON "club_features" TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "club_features" TO platform_user;
