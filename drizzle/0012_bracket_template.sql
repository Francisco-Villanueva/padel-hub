ALTER TABLE "tournament_matches" ADD COLUMN "source_a" text;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD COLUMN "source_b" text;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD COLUMN "lock_a" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD COLUMN "lock_b" boolean DEFAULT false NOT NULL;