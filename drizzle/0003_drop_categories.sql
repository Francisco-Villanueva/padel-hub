-- Paso 2 de 2: la tabla categories ya no existe (la categoría es el nivel que guarda cada jugador, ver 0002).
-- La FK compuesta se borra primero, antes que la tabla a la que apunta.
ALTER TABLE "players" DROP CONSTRAINT "players_category_same_club_fk";--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "categories" CASCADE;--> statement-breakpoint
DROP TYPE "public"."category_branch";
