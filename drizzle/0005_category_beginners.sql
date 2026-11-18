ALTER TABLE "players" DROP CONSTRAINT "players_category_chk";--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_category_chk" CHECK ("players"."category" between 1 and 9);