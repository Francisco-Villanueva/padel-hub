-- La categoría pasa a ser solo el nivel (1 a 8) guardado en el jugador; el género queda en players.gender.
-- Paso 1 de 2: agrega la columna y copia el nivel que tenía cada jugador. El paso 2 (0003) borra la tabla categories.
DROP INDEX "players_search_idx";--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "category" smallint;--> statement-breakpoint
UPDATE "players" p SET "category" = c."level" FROM "categories" c WHERE c."id" = p."category_id" AND c."level" BETWEEN 1 AND 8;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_category_chk" CHECK ("players"."category" between 1 and 8);--> statement-breakpoint
CREATE INDEX "players_search_idx" ON "players" USING btree ("club_id","category","gender") WHERE "players"."deleted_at" is null;
