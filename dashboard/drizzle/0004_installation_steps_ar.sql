ALTER TABLE "installations" ADD COLUMN "steps_ar" text;--> statement-breakpoint
UPDATE "installations" SET "steps_ar" = "steps", "steps" = NULL WHERE "steps" ~ '[\u0600-\u06FF]';
