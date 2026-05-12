CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_chat_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_sessions_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_user" ON "ai_chat_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "role" varchar(10) NOT NULL,
  "content" text NOT NULL,
  "sql_query" text,
  "query_result_count" integer,
  "was_clarification" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_chat_messages_role_check" CHECK ("role" IN ('user', 'assistant'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_messages_session_id_ai_chat_sessions_id_fk'
  ) THEN
    ALTER TABLE "ai_chat_messages"
    ADD CONSTRAINT "ai_chat_messages_session_id_ai_chat_sessions_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id")
    ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_session" ON "ai_chat_messages" USING btree ("session_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_benchmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_id" uuid NOT NULL,
  "stage_id" uuid NOT NULL,
  "avg_days_in_stage" numeric(10,2) NOT NULL,
  "sample_size" integer DEFAULT 0 NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_benchmarks_pipeline_id_pipelines_id_fk'
  ) THEN
    ALTER TABLE "pipeline_benchmarks"
    ADD CONSTRAINT "pipeline_benchmarks_pipeline_id_pipelines_id_fk"
    FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id")
    ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_benchmarks_stage_id_pipeline_stages_id_fk'
  ) THEN
    ALTER TABLE "pipeline_benchmarks"
    ADD CONSTRAINT "pipeline_benchmarks_stage_id_pipeline_stages_id_fk"
    FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id")
    ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pipeline_benchmarks_pipeline_stage" ON "pipeline_benchmarks" USING btree ("pipeline_id","stage_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_benchmarks_stage" ON "pipeline_benchmarks" USING btree ("stage_id");
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "is_velocity_slow" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automation_config" (
  "key" varchar(50) PRIMARY KEY NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamp with time zone,
  "last_run_result" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "automation_config" ("key", "is_enabled")
VALUES
  ('lead_score', true),
  ('stale_alerts', true),
  ('morning_briefings', true),
  ('duplicate_detection', true),
  ('pipeline_benchmarks', true),
  ('weekly_summary', true)
ON CONFLICT ("key") DO NOTHING;
