CREATE TYPE "public"."finance_entry_kind" AS ENUM('payment', 'expense');--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "finance_entry_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_entries_amount_positive" CHECK ("finance_entries"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_entries_project_idx" ON "finance_entries" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "assets_notes";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "design_link";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "content_link";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "reference_link";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "voice_note_link";