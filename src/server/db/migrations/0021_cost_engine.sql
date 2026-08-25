CREATE TABLE "delivery_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "gnr_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rate_percent" numeric(5, 2) NOT NULL,
	"applies_to" varchar(20) DEFAULT 'total' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_gnr_name_version" UNIQUE("name","version"),
	CONSTRAINT "gnr_applies_to_check" CHECK ("gnr_policies"."applies_to" IN ('total', 'labour_only')),
	CONSTRAINT "gnr_rate_check" CHECK ("gnr_policies"."rate_percent" >= 0 AND "gnr_policies"."rate_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "resource_cost_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(20) NOT NULL,
	"delivery_role_id" uuid,
	"user_id" uuid,
	"component" varchar(20) NOT NULL,
	"amount_per_week" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_components_scope_check" CHECK ("resource_cost_components"."scope" IN ('default', 'role', 'employee')),
	CONSTRAINT "cost_components_component_check" CHECK ("resource_cost_components"."component" IN ('base', 'seat', 'support')),
	CONSTRAINT "cost_components_amount_check" CHECK ("resource_cost_components"."amount_per_week" >= 0),
	CONSTRAINT "cost_components_range_check" CHECK ("resource_cost_components"."effective_to" IS NULL OR "resource_cost_components"."effective_to" >= "resource_cost_components"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "user_delivery_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"delivery_role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_financial_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_roles" ADD CONSTRAINT "delivery_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gnr_policies" ADD CONSTRAINT "gnr_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_cost_components" ADD CONSTRAINT "resource_cost_components_delivery_role_id_delivery_roles_id_fk" FOREIGN KEY ("delivery_role_id") REFERENCES "public"."delivery_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_cost_components" ADD CONSTRAINT "resource_cost_components_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_cost_components" ADD CONSTRAINT "resource_cost_components_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_delivery_roles" ADD CONSTRAINT "user_delivery_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_delivery_roles" ADD CONSTRAINT "user_delivery_roles_delivery_role_id_delivery_roles_id_fk" FOREIGN KEY ("delivery_role_id") REFERENCES "public"."delivery_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_delivery_roles" ADD CONSTRAINT "user_delivery_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_delivery_roles_active" ON "delivery_roles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_gnr_effective" ON "gnr_policies" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "idx_cost_components_lookup" ON "resource_cost_components" USING btree ("component","scope","effective_from");--> statement-breakpoint
CREATE INDEX "idx_cost_components_role" ON "resource_cost_components" USING btree ("delivery_role_id");--> statement-breakpoint
CREATE INDEX "idx_cost_components_user" ON "resource_cost_components" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cost_component_open_default" ON "resource_cost_components" USING btree ("component") WHERE "resource_cost_components"."effective_to" IS NULL AND "resource_cost_components"."scope" = 'default';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cost_component_open_role" ON "resource_cost_components" USING btree ("component","delivery_role_id") WHERE "resource_cost_components"."effective_to" IS NULL AND "resource_cost_components"."scope" = 'role';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cost_component_open_employee" ON "resource_cost_components" USING btree ("component","user_id") WHERE "resource_cost_components"."effective_to" IS NULL AND "resource_cost_components"."scope" = 'employee';