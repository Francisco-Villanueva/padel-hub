ALTER TABLE "tournament_matches" DROP CONSTRAINT "tournament_matches_status_chk";--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_status_chk" CHECK ("tournament_matches"."status" in ('pendiente','en_juego','jugado','bye'));