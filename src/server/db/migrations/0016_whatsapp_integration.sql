CREATE TABLE "whatsapp_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wa_id" varchar(20) NOT NULL,
	"wa_name" varchar(100),
	"crm_user_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_users_wa_id_unique" UNIQUE("wa_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_message_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wa_id" varchar(20),
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
ALTER TABLE "whatsapp_users" ADD CONSTRAINT "whatsapp_users_crm_user_id_users_id_fk" FOREIGN KEY ("crm_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_whatsapp_users_crm_user" ON "whatsapp_users" USING btree ("crm_user_id");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_users_active" ON "whatsapp_users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_wa_log_user" ON "whatsapp_message_log" USING btree ("wa_id");--> statement-breakpoint
CREATE INDEX "idx_wa_log_created" ON "whatsapp_message_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_wa_log_command" ON "whatsapp_message_log" USING btree ("command");--> statement-breakpoint
CREATE INDEX "idx_wa_log_status" ON "whatsapp_message_log" USING btree ("result_status");
