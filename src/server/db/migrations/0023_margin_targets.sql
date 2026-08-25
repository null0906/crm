CREATE TABLE "margin_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_line" varchar(50) DEFAULT '*' NOT NULL,
	"segment" varchar(50) DEFAULT 'standard' NOT NULL,
	"target_margin_percent" numeric(5, 2) NOT NULL,
	"floor_margin_percent" numeric(5, 2),
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "margin_target_percent_check" CHECK ("margin_targets"."target_margin_percent" >= 0 AND "margin_targets"."target_margin_percent" <= 100),
	CONSTRAINT "margin_floor_percent_check" CHECK ("margin_targets"."floor_margin_percent" IS NULL OR ("margin_targets"."floor_margin_percent" >= 0 AND "margin_targets"."floor_margin_percent" <= 100)),
	CONSTRAINT "margin_floor_below_target_check" CHECK ("margin_targets"."floor_margin_percent" IS NULL OR "margin_targets"."floor_margin_percent" <= "margin_targets"."target_margin_percent"),
	CONSTRAINT "margin_target_range_check" CHECK ("margin_targets"."effective_to" IS NULL OR "margin_targets"."effective_to" >= "margin_targets"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "margin_targets" ADD CONSTRAINT "margin_targets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_margin_targets_lookup" ON "margin_targets" USING btree ("service_line","segment","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_margin_target_open" ON "margin_targets" USING btree ("service_line","segment") WHERE "margin_targets"."effective_to" IS NULL;