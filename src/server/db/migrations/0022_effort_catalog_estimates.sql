CREATE TABLE "effort_baseline_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baseline_id" uuid NOT NULL,
	"delivery_role_id" uuid NOT NULL,
	"delivery_stage" varchar(40),
	"resource_count" integer DEFAULT 1 NOT NULL,
	"weeks" numeric(6, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "baseline_line_count_check" CHECK ("effort_baseline_lines"."resource_count" > 0),
	CONSTRAINT "baseline_line_weeks_check" CHECK ("effort_baseline_lines"."weeks" > 0)
);
--> statement-breakpoint
CREATE TABLE "effort_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_line" varchar(50) NOT NULL,
	"segment" varchar(50) DEFAULT 'standard' NOT NULL,
	"name" varchar(150) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"confidence" varchar(10) DEFAULT 'low' NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"observed_spread_percent" numeric(5, 2),
	"is_judgement_based" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_baseline_service_segment_version" UNIQUE("service_line","segment","version"),
	CONSTRAINT "baseline_confidence_check" CHECK ("effort_baselines"."confidence" IN ('low', 'medium', 'high')),
	CONSTRAINT "baseline_sample_check" CHECK ("effort_baselines"."sample_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "estimate_cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"label" varchar(150) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"basis" varchar(30) DEFAULT 'engagement' NOT NULL,
	"pass_through" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "estimate_cost_line_kind_check" CHECK ("estimate_cost_lines"."kind" IN ('non_labour', 'custom')),
	CONSTRAINT "estimate_cost_line_basis_check" CHECK ("estimate_cost_lines"."basis" IN ('engagement', 'per_resource_week'))
);
--> statement-breakpoint
CREATE TABLE "estimate_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"option_id" uuid,
	"numeric_value" numeric(10, 2),
	"multiplier_applied" numeric(6, 4) NOT NULL,
	"source" varchar(60),
	"answer_confidence" varchar(10),
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_estimate_driver" UNIQUE("estimate_id","driver_id"),
	CONSTRAINT "estimate_driver_confidence_check" CHECK ("estimate_drivers"."answer_confidence" IS NULL OR "estimate_drivers"."answer_confidence" IN ('low', 'medium', 'high')),
	CONSTRAINT "estimate_driver_multiplier_check" CHECK ("estimate_drivers"."multiplier_applied" > 0)
);
--> statement-breakpoint
CREATE TABLE "estimate_team_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"delivery_role_id" uuid NOT NULL,
	"user_id" uuid,
	"delivery_stage" varchar(40),
	"resource_count" integer DEFAULT 1 NOT NULL,
	"weeks" numeric(6, 2) NOT NULL,
	"override_base" numeric(15, 2),
	"override_seat" numeric(15, 2),
	"override_support" numeric(15, 2),
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "estimate_team_count_check" CHECK ("estimate_team_lines"."resource_count" > 0),
	CONSTRAINT "estimate_team_weeks_check" CHECK ("estimate_team_lines"."weeks" > 0)
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid,
	"company_id" uuid,
	"title" varchar(200) NOT NULL,
	"service_line" varchar(50),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"supersedes_id" uuid,
	"baseline_id" uuid,
	"baseline_version" integer,
	"sizing_policy_id" uuid,
	"gnr_policy_id" uuid,
	"gnr_rate_percent" numeric(5, 2),
	"gnr_applies_to" varchar(20),
	"as_of_date" date NOT NULL,
	"costing_mode" varchar(20) DEFAULT 'blended' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"size_multiplier" numeric(6, 4) DEFAULT '1.0' NOT NULL,
	"labour_subtotal" numeric(15, 2),
	"non_labour_pass_through" numeric(15, 2),
	"non_labour_marked_up" numeric(15, 2),
	"custom_total" numeric(15, 2),
	"subtotal_before_gnr" numeric(15, 2),
	"gnr_amount" numeric(15, 2),
	"total_delivery_cost" numeric(15, 2),
	"price" numeric(15, 2),
	"target_margin_percent" numeric(5, 2),
	"margin_percent" numeric(5, 2),
	"snapshot" jsonb,
	"frozen_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"owner_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estimate_status_check" CHECK ("estimates"."status" IN ('draft', 'approved', 'superseded', 'archived')),
	CONSTRAINT "estimate_costing_mode_check" CHECK ("estimates"."costing_mode" IN ('blended', 'named')),
	CONSTRAINT "estimate_multiplier_check" CHECK ("estimates"."size_multiplier" > 0),
	CONSTRAINT "estimate_approved_is_frozen_check" CHECK ("estimates"."status" <> 'approved' OR ("estimates"."frozen_at" IS NOT NULL AND "estimates"."snapshot" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sizing_driver_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"label" varchar(120) NOT NULL,
	"value" varchar(60) NOT NULL,
	"multiplier" numeric(6, 4) DEFAULT '1.0' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_driver_option_value" UNIQUE("driver_id","value"),
	CONSTRAINT "driver_option_multiplier_check" CHECK ("sizing_driver_options"."multiplier" > 0)
);
--> statement-breakpoint
CREATE TABLE "sizing_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"value_type" varchar(20) NOT NULL,
	"applies_to" varchar(20) DEFAULT 'weeks' NOT NULL,
	"multiplier_per_unit" numeric(6, 4),
	"unit_baseline" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sizing_drivers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sizing_driver_value_type_check" CHECK ("sizing_drivers"."value_type" IN ('select', 'number')),
	CONSTRAINT "sizing_driver_applies_to_check" CHECK ("sizing_drivers"."applies_to" IN ('weeks', 'team', 'both'))
);
--> statement-breakpoint
CREATE TABLE "sizing_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"max_multiplier" numeric(5, 2) DEFAULT '2.50' NOT NULL,
	"composition" varchar(20) DEFAULT 'multiplicative' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_sizing_policy_name_version" UNIQUE("name","version"),
	CONSTRAINT "sizing_policy_composition_check" CHECK ("sizing_policies"."composition" IN ('multiplicative', 'additive')),
	CONSTRAINT "sizing_policy_max_check" CHECK ("sizing_policies"."max_multiplier" >= 1)
);
--> statement-breakpoint
ALTER TABLE "effort_baseline_lines" ADD CONSTRAINT "effort_baseline_lines_baseline_id_effort_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."effort_baselines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effort_baseline_lines" ADD CONSTRAINT "effort_baseline_lines_delivery_role_id_delivery_roles_id_fk" FOREIGN KEY ("delivery_role_id") REFERENCES "public"."delivery_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effort_baselines" ADD CONSTRAINT "effort_baselines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_cost_lines_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_drivers" ADD CONSTRAINT "estimate_drivers_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_drivers" ADD CONSTRAINT "estimate_drivers_driver_id_sizing_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."sizing_drivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_drivers" ADD CONSTRAINT "estimate_drivers_option_id_sizing_driver_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."sizing_driver_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ADD CONSTRAINT "estimate_team_lines_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ADD CONSTRAINT "estimate_team_lines_delivery_role_id_delivery_roles_id_fk" FOREIGN KEY ("delivery_role_id") REFERENCES "public"."delivery_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ADD CONSTRAINT "estimate_team_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_supersedes_id_estimates_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."estimates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_baseline_id_effort_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."effort_baselines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_sizing_policy_id_sizing_policies_id_fk" FOREIGN KEY ("sizing_policy_id") REFERENCES "public"."sizing_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_gnr_policy_id_gnr_policies_id_fk" FOREIGN KEY ("gnr_policy_id") REFERENCES "public"."gnr_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sizing_driver_options" ADD CONSTRAINT "sizing_driver_options_driver_id_sizing_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."sizing_drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sizing_drivers" ADD CONSTRAINT "sizing_drivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sizing_policies" ADD CONSTRAINT "sizing_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_baseline_lines_baseline" ON "effort_baseline_lines" USING btree ("baseline_id");--> statement-breakpoint
CREATE INDEX "idx_baselines_service" ON "effort_baselines" USING btree ("service_line","is_active");--> statement-breakpoint
CREATE INDEX "idx_estimate_cost_lines_estimate" ON "estimate_cost_lines" USING btree ("estimate_id");--> statement-breakpoint
CREATE INDEX "idx_estimate_drivers_estimate" ON "estimate_drivers" USING btree ("estimate_id");--> statement-breakpoint
CREATE INDEX "idx_estimate_team_estimate" ON "estimate_team_lines" USING btree ("estimate_id");--> statement-breakpoint
CREATE INDEX "idx_estimates_deal" ON "estimates" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_estimates_company" ON "estimates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_estimates_status" ON "estimates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_estimates_owner" ON "estimates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_driver_options_driver" ON "sizing_driver_options" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_sizing_drivers_active" ON "sizing_drivers" USING btree ("is_active","position");--> statement-breakpoint
CREATE INDEX "idx_sizing_policy_effective" ON "sizing_policies" USING btree ("effective_from");