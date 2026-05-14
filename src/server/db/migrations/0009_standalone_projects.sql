CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "deal_id" uuid,
  "company_id" uuid,
  "primary_contact_id" uuid,
  "service_type" varchar(50),
  "stage" varchar(50) DEFAULT 'kickoff' NOT NULL,
  "stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "start_date" date,
  "end_date" date,
  "actual_end_date" date,
  "progress_percent" integer DEFAULT 0,
  "is_delayed" boolean DEFAULT false,
  "delay_reason" text,
  "revised_end_date" date,
  "contract_value" numeric(15, 2),
  "currency" varchar(3) DEFAULT 'INR',
  "owner_id" uuid,
  "created_by" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'active',
  "custom_fields" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "projects_deal_id_unique" UNIQUE("deal_id"),
  CONSTRAINT "projects_stage_check" CHECK ("stage" IN ('kickoff', 'gap_assessment', 'internal_audit', 'external_audit', 'certified', 'on_hold', 'cancelled')),
  CONSTRAINT "projects_progress_check" CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100),
  CONSTRAINT "projects_status_check" CHECK ("status" IN ('active', 'completed', 'on_hold', 'cancelled'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_deal_id_deals_id_fk'
  ) THEN
    ALTER TABLE "projects"
    ADD CONSTRAINT "projects_deal_id_deals_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id")
    ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE "projects"
    ADD CONSTRAINT "projects_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_primary_contact_id_contacts_id_fk'
  ) THEN
    ALTER TABLE "projects"
    ADD CONSTRAINT "projects_primary_contact_id_contacts_id_fk"
    FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id")
    ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_owner_id_users_id_fk'
  ) THEN
    ALTER TABLE "projects"
    ADD CONSTRAINT "projects_owner_id_users_id_fk"
    FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "projects"
    ADD CONSTRAINT "projects_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_deal" ON "projects" ("deal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_company" ON "projects" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_owner" ON "projects" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_stage" ON "projects" ("stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_status" ON "projects" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_service" ON "projects" ("service_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_deleted" ON "projects" ("deleted_at") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" varchar(50) DEFAULT 'member',
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_members_project_user_unique" UNIQUE("project_id", "user_id"),
  CONSTRAINT "project_members_role_check" CHECK ("role" IN ('lead', 'member', 'reviewer', 'consultant'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_members_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
    ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_members_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_members_project" ON "project_members" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_members_user" ON "project_members" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "category" varchar(100),
  "status" varchar(20) DEFAULT 'pending',
  "priority" varchar(10) DEFAULT 'medium',
  "assigned_to" uuid,
  "due_date" date,
  "completed_at" timestamp with time zone,
  "blocked_reason" text,
  "position" integer DEFAULT 0,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_tasks_status_check" CHECK ("status" IN ('pending', 'in_progress', 'completed', 'blocked', 'not_applicable')),
  CONSTRAINT "project_tasks_priority_check" CHECK ("priority" IN ('low', 'medium', 'high', 'urgent'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "project_tasks"
    ADD CONSTRAINT "project_tasks_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
    ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_assigned_to_users_id_fk'
  ) THEN
    ALTER TABLE "project_tasks"
    ADD CONSTRAINT "project_tasks_assigned_to_users_id_fk"
    FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "project_tasks"
    ADD CONSTRAINT "project_tasks_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_tasks_project" ON "project_tasks" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_tasks_assigned" ON "project_tasks" ("assigned_to");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_tasks_status" ON "project_tasks" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_tasks_due" ON "project_tasks" ("due_date") WHERE "status" != 'completed';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_stage_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "from_stage" varchar(50),
  "to_stage" varchar(50) NOT NULL,
  "moved_by" uuid NOT NULL,
  "notes" text,
  "entered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "exited_at" timestamp with time zone,
  "duration_hours" integer GENERATED ALWAYS AS (
    CASE
      WHEN "exited_at" IS NULL THEN NULL
      ELSE FLOOR(EXTRACT(EPOCH FROM ("exited_at" - "entered_at")) / 3600)::integer
    END
  ) STORED
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_stage_history_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "project_stage_history"
    ADD CONSTRAINT "project_stage_history_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
    ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_stage_history_moved_by_users_id_fk'
  ) THEN
    ALTER TABLE "project_stage_history"
    ADD CONSTRAINT "project_stage_history_moved_by_users_id_fk"
    FOREIGN KEY ("moved_by") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_stage_history_project" ON "project_stage_history" ("project_id");
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "linked_project_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_linked_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "deals"
    ADD CONSTRAINT "deals_linked_project_id_projects_id_fk"
    FOREIGN KEY ("linked_project_id") REFERENCES "public"."projects"("id")
    ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deals_project" ON "deals" ("linked_project_id");
