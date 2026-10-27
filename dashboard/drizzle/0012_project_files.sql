CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"folder" text NOT NULL,
	"object_key" text NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "project_files_size_positive" CHECK ("project_files"."size" > 0)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "folder_key" text;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_files_project_idx" ON "project_files" USING btree ("project_id","folder");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_key_unique" UNIQUE("folder_key");