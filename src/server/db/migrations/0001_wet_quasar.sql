CREATE TABLE "telegram_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"telegram_username" varchar(100),
	"crm_user_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_users_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE "digest_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"dashboard_id" uuid,
	"schedule_type" varchar(20) DEFAULT 'daily' NOT NULL,
	"schedule_time" varchar(10) DEFAULT '09:00' NOT NULL,
	"schedule_day_of_week" integer,
	"schedule_day_of_month" integer,
	"email_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"telegram_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_message_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"telegram_user_id" bigint,
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
ALTER TABLE "telegram_users" ADD CONSTRAINT "telegram_users_crm_user_id_users_id_fk" FOREIGN KEY ("crm_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_schedules" ADD CONSTRAINT "digest_schedules_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_schedules" ADD CONSTRAINT "digest_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_telegram_users_crm_user" ON "telegram_users" USING btree ("crm_user_id");--> statement-breakpoint
CREATE INDEX "idx_telegram_users_active" ON "telegram_users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_digest_schedules_active" ON "digest_schedules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_digest_schedules_type" ON "digest_schedules" USING btree ("schedule_type");--> statement-breakpoint
CREATE INDEX "idx_tg_log_user" ON "telegram_message_log" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "idx_tg_log_created" ON "telegram_message_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_tg_log_command" ON "telegram_message_log" USING btree ("command");--> statement-breakpoint
CREATE INDEX "idx_tg_log_status" ON "telegram_message_log" USING btree ("result_status");