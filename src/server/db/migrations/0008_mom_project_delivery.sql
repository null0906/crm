ALTER TABLE "pipelines" ADD COLUMN IF NOT EXISTS "pipeline_type" varchar(20) DEFAULT 'sales' CHECK ("pipeline_type" IN ('sales', 'active_delivery', 'partner', 'compliance'));
--> statement-breakpoint
UPDATE "pipelines" SET "pipeline_type" = 'active_delivery'
WHERE LOWER("name") LIKE '%active%';
--> statement-breakpoint
UPDATE "pipelines" SET "pipeline_type" = 'partner'
WHERE LOWER("name") LIKE '%partner%';
--> statement-breakpoint
UPDATE "pipelines" SET "pipeline_type" = 'compliance'
WHERE LOWER("name") LIKE '%soc%'
   OR LOWER("name") LIKE '%dpdp%'
   OR LOWER("name") LIKE '%compliance%'
   OR LOWER("name") LIKE '%iso%';
--> statement-breakpoint
UPDATE "pipelines" SET "pipeline_type" = 'sales'
WHERE "pipeline_type" IS NULL
   OR (
       LOWER("name") NOT LIKE '%active%'
       AND LOWER("name") NOT LIKE '%partner%'
       AND LOWER("name") NOT LIKE '%soc%'
       AND LOWER("name") NOT LIKE '%dpdp%'
       AND LOWER("name") NOT LIKE '%compliance%'
       AND LOWER("name") NOT LIKE '%iso%'
   );
--> statement-breakpoint
ALTER TABLE "deals"
  ADD COLUMN IF NOT EXISTS "project_start_date" date,
  ADD COLUMN IF NOT EXISTS "project_end_date" date,
  ADD COLUMN IF NOT EXISTS "project_actual_end_date" date,
  ADD COLUMN IF NOT EXISTS "project_progress_percent" integer DEFAULT 0 CHECK ("project_progress_percent" >= 0 AND "project_progress_percent" <= 100),
  ADD COLUMN IF NOT EXISTS "is_delayed" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "delay_reason" text,
  ADD COLUMN IF NOT EXISTS "revised_end_date" date,
  ADD COLUMN IF NOT EXISTS "primary_contact_name" varchar(255),
  ADD COLUMN IF NOT EXISTS "primary_contact_email" varchar(255),
  ADD COLUMN IF NOT EXISTS "primary_contact_phone" varchar(30),
  ADD COLUMN IF NOT EXISTS "primary_contact_title" varchar(150),
  ADD COLUMN IF NOT EXISTS "referred_by_partner_id" uuid REFERENCES "public"."companies"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deals_partner" ON "deals" USING btree ("referred_by_partner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deals_end_date" ON "deals" USING btree ("project_end_date") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "public"."deals"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "role" varchar(50) DEFAULT 'member',
  "assigned_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "deal_team_members_deal_user_unique" UNIQUE("deal_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_team_deal" ON "deal_team_members" USING btree ("deal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_team_user" ON "deal_team_members" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deal_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "public"."deals"("id") ON DELETE cascade,
  "title" varchar(255) NOT NULL,
  "description" text,
  "status" varchar(20) DEFAULT 'pending' CHECK ("status" IN ('pending', 'in_progress', 'completed', 'blocked')),
  "priority" varchar(10) DEFAULT 'medium' CHECK ("priority" IN ('low', 'medium', 'high', 'urgent')),
  "assigned_to" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "due_date" date,
  "completed_at" timestamptz,
  "position" integer DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES "public"."users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_tasks_deal" ON "deal_tasks" USING btree ("deal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_tasks_assigned" ON "deal_tasks" USING btree ("assigned_to");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_tasks_status" ON "deal_tasks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deal_tasks_due" ON "deal_tasks" USING btree ("due_date") WHERE "status" != 'completed';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid REFERENCES "public"."contacts"("id") ON DELETE set null,
  "deal_id" uuid REFERENCES "public"."deals"("id") ON DELETE set null,
  "company_id" uuid REFERENCES "public"."companies"("id") ON DELETE set null,
  "activity_id" uuid REFERENCES "public"."activities"("id") ON DELETE set null,
  "call_type" varchar(30) DEFAULT 'demo' NOT NULL CHECK ("call_type" IN ('discovery', 'demo', 'follow_up', 'proposal_walkthrough', 'onboarding', 'check_in')),
  "scheduled_at" timestamptz,
  "duration_minutes" integer,
  "outcome" varchar(30) CHECK ("outcome" IN ('completed', 'no_show', 'rescheduled', 'cancelled', 'interested', 'not_interested', 'needs_follow_up')),
  "attendees" text,
  "client_requirements" text,
  "pain_points" text,
  "objections" text,
  "next_action" text,
  "next_action_date" date,
  "demo_notes" text,
  "conducted_by" uuid NOT NULL REFERENCES "public"."users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_demo_records_contact" ON "demo_records" USING btree ("contact_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_demo_records_deal" ON "demo_records" USING btree ("deal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_demo_records_company" ON "demo_records" USING btree ("company_id");
--> statement-breakpoint
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "referred_by_partner_id" uuid REFERENCES "public"."companies"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "referral_date" date;
