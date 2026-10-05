ALTER TYPE "public"."flag_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "flag_recipients" (
	"flag_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "flag_status" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "flag_recipients_flag_id_user_id_pk" PRIMARY KEY("flag_id","user_id")
);
--> statement-breakpoint
DROP INDEX "flags_open_idx";--> statement-breakpoint
ALTER TABLE "flags" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "flags" ALTER COLUMN "owner_department" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "flag_recipients" ADD CONSTRAINT "flag_recipients_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_recipients" ADD CONSTRAINT "flag_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_recipients" ADD CONSTRAINT "flag_recipients_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flag_recipients_user_idx" ON "flag_recipients" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "flags_status_idx" ON "flags" USING btree ("status");--> statement-breakpoint
-- Existing open flags were sent to a department: its active heads become the recipients (all its members if it has no head).
INSERT INTO "flag_recipients" ("flag_id", "user_id")
SELECT f."id", u."id"
FROM "flags" f
JOIN "users" u ON u."department" = f."owner_department" AND u."status" = 'active'
  AND (u."is_head" OR NOT EXISTS (
    SELECT 1 FROM "users" h WHERE h."department" = f."owner_department" AND h."is_head" AND h."status" = 'active'
  ))
WHERE f."status" = 'open';--> statement-breakpoint
-- Existing resolved flags: whoever resolved it becomes the one recipient, with their resolution.
INSERT INTO "flag_recipients" ("flag_id", "user_id", "status", "resolution", "resolved_by", "resolved_at")
SELECT f."id", f."resolved_by", 'resolved', f."resolution", f."resolved_by", f."resolved_at"
FROM "flags" f
WHERE f."status" = 'resolved' AND f."resolved_by" IS NOT NULL;--> statement-breakpoint
UPDATE "flags" SET "resolution" = NULL WHERE "status" = 'resolved';
