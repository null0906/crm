CREATE TABLE "automation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_inactivity_enabled" boolean DEFAULT true NOT NULL,
	"lead_inactivity_days" integer DEFAULT 3 NOT NULL,
	"lead_inactivity_cooldown_hours" integer DEFAULT 24 NOT NULL,
	"lead_inactivity_pipelines" jsonb DEFAULT '["sales","partner","enterprise"]'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
