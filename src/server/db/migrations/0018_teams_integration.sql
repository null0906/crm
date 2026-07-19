CREATE TABLE "teams_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aad_object_id" varchar(36) NOT NULL,
	"teams_name" varchar(100),
	"conversation_reference" jsonb,
	"crm_user_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_users_aad_object_id_unique" UNIQUE("aad_object_id")
);
--> statement-breakpoint
CREATE TABLE "teams_message_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"aad_object_id" varchar(36),
	"direction" varchar(10) NOT NULL,
	"command" varchar(50),
	"raw_message" text,
	"parsed_data" jsonb,
	"result_status" varchar(20),
	"result_message" text,
	"entity_type" varchar(30),
	"entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams_users" ADD CONSTRAINT "teams_users_crm_user_id_users_id_fk" FOREIGN KEY ("crm_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_teams_users_crm_user" ON "teams_users" USING btree ("crm_user_id");--> statement-breakpoint
CREATE INDEX "idx_teams_users_active" ON "teams_users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_teams_log_user" ON "teams_message_log" USING btree ("aad_object_id");--> statement-breakpoint
CREATE INDEX "idx_teams_log_created" ON "teams_message_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_teams_log_command" ON "teams_message_log" USING btree ("command");--> statement-breakpoint
CREATE INDEX "idx_teams_log_status" ON "teams_message_log" USING btree ("result_status");
