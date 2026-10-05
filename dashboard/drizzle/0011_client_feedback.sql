CREATE TYPE "public"."deadline_decision" AS ENUM('applied', 'declined');--> statement-breakpoint
CREATE TYPE "public"."feedback_priority" AS ENUM('normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."feedback_source" AS ENUM('whatsapp', 'call', 'email', 'meeting', 'site_visit', 'client_link');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('awaiting_scope', 'new', 'in_progress', 'done', 'client_approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('design', 'content', 'technical', 'new_request', 'general');--> statement-breakpoint
CREATE TYPE "public"."scope_decision" AS ENUM('included', 'extra_cost', 'rejected');--> statement-breakpoint
CREATE TABLE "feedback_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid,
	"client_name" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"body" text NOT NULL,
	"source" "feedback_source" NOT NULL,
	"type" "feedback_type" NOT NULL,
	"priority" "feedback_priority" DEFAULT 'normal' NOT NULL,
	"status" "feedback_status" NOT NULL,
	"received_on" date NOT NULL,
	"assignee_id" uuid,
	"client_name" text,
	"scope_decision" "scope_decision",
	"scope_note" text,
	"scope_decided_by" uuid,
	"scope_decided_at" timestamp with time zone,
	"extra_days" integer,
	"deadline_note" text,
	"deadline_decision" "deadline_decision",
	"deadline_decided_by" uuid,
	"done_by" uuid,
	"done_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"reject_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_items_extra_days_positive" CHECK ("feedback_items"."extra_days" is null or "feedback_items"."extra_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "feedback_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_token" text;--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_item_id_feedback_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD CONSTRAINT "feedback_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_round_id_feedback_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."feedback_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_scope_decided_by_users_id_fk" FOREIGN KEY ("scope_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_deadline_decided_by_users_id_fk" FOREIGN KEY ("deadline_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_rounds" ADD CONSTRAINT "feedback_rounds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_rounds" ADD CONSTRAINT "feedback_rounds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_comments_item_idx" ON "feedback_comments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "feedback_items_project_idx" ON "feedback_items" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "feedback_items_assignee_idx" ON "feedback_items" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_rounds_project_number_unique" ON "feedback_rounds" USING btree ("project_id","number");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_token_unique" UNIQUE("client_token");