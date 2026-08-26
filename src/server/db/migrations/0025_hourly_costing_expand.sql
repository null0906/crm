CREATE TABLE "support_cost_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"basis" varchar(30) DEFAULT 'engagement' NOT NULL,
	"label" varchar(150) DEFAULT 'Support & overhead' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_support_policy_name_version" UNIQUE("name","version"),
	CONSTRAINT "support_policy_basis_check" CHECK ("support_cost_policies"."basis" IN ('engagement', 'per_resource_hour')),
	CONSTRAINT "support_policy_amount_check" CHECK ("support_cost_policies"."amount" >= 0),
	CONSTRAINT "support_policy_range_check" CHECK ("support_cost_policies"."effective_to" IS NULL OR "support_cost_policies"."effective_to" >= "support_cost_policies"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "resource_cost_components" ADD COLUMN "amount_per_hour" numeric(15, 4);--> statement-breakpoint
ALTER TABLE "effort_baseline_lines" ADD COLUMN "hours" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ADD COLUMN "hours" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "support_cost_policies" ADD CONSTRAINT "support_cost_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_support_policy_effective" ON "support_cost_policies" USING btree ("effective_from");--> statement-breakpoint
-- Backfill at 40 hours per week. Lossless for cost: rates divide by 40 while
-- effort multiplies by 40, so every existing total is unchanged. Only the way
-- the figures read changes. 0026 drops the week columns once this has run.
UPDATE "resource_cost_components" SET "amount_per_hour" = "amount_per_week" / 40;--> statement-breakpoint
UPDATE "effort_baseline_lines" SET "hours" = "weeks" * 40;--> statement-breakpoint
UPDATE "estimate_team_lines" SET "hours" = "weeks" * 40;
