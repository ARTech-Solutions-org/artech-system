ALTER TABLE "projects" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "projects" SET "completed_at" = "updated_at" WHERE "status" = 'completed' AND "completed_at" IS NULL;
