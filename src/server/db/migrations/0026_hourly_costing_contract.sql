ALTER TABLE "resource_cost_components" DROP CONSTRAINT "cost_components_component_check";--> statement-breakpoint
ALTER TABLE "resource_cost_components" DROP CONSTRAINT "cost_components_amount_check";--> statement-breakpoint
ALTER TABLE "effort_baseline_lines" DROP CONSTRAINT "baseline_line_weeks_check";--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" DROP CONSTRAINT "estimate_cost_line_basis_check";--> statement-breakpoint
ALTER TABLE "estimate_team_lines" DROP CONSTRAINT "estimate_team_weeks_check";--> statement-breakpoint
ALTER TABLE "sizing_drivers" DROP CONSTRAINT "sizing_driver_applies_to_check";--> statement-breakpoint
-- ---------------------------------------------------------------- data ----
-- Runs after the old CHECKs are dropped and before the new ones are added.
-- Everything here converts at 40 hours per week, matching 0025.

-- Drivers that stretched the schedule now add hours to it.
UPDATE "sizing_drivers" SET "applies_to" = 'hours' WHERE "applies_to" = 'weeks';--> statement-breakpoint

-- A per-resource-week line becomes per-resource-hour at a fortieth the rate.
UPDATE "estimate_cost_lines" SET "basis" = 'per_resource_hour', "amount" = "amount" / 40 WHERE "basis" = 'per_resource_week';--> statement-breakpoint

-- Support stops being a per-resource component and becomes a seeded cost line.
-- Seeded at per_resource_hour rather than a flat amount on purpose: the old
-- rate scaled with engagement size, and a flat figure cannot reproduce that.
-- Cost is therefore unchanged by this migration. Switch it to a flat amount in
-- Settings once someone has chosen what that amount should be.
INSERT INTO "support_cost_policies" ("name", "version", "amount", "basis", "label", "effective_from", "created_by", "notes")
SELECT 'Standard support', 1, c."amount_per_hour", 'per_resource_hour', 'Support & overhead', c."effective_from", c."created_by",
       'Carried over from the former per-resource support component so cost did not move.'
FROM "resource_cost_components" c
WHERE c."component" = 'support' AND c."scope" = 'default' AND c."effective_to" IS NULL
LIMIT 1;--> statement-breakpoint

DELETE FROM "resource_cost_components" WHERE "component" = 'support';--> statement-breakpoint

-- Seat belongs to a person. Give everyone who holds a delivery role the former
-- company-wide rate as a starting point, then drop the role/default rows the
-- new CHECK would reject. Anyone without a delivery role gets nothing, which
-- the engine reports rather than silently costing at zero.
INSERT INTO "resource_cost_components" ("scope", "user_id", "component", "amount_per_hour", "currency", "effective_from", "created_by", "notes")
SELECT 'employee', u."id", 'seat', seat."amount_per_hour", seat."currency", seat."effective_from", seat."created_by",
       'Seeded from the former company-wide seat rate when seat moved to per-employee.'
FROM "users" u
JOIN "user_delivery_roles" udr ON udr."user_id" = u."id"
CROSS JOIN (
  SELECT "amount_per_hour", "currency", "effective_from", "created_by"
  FROM "resource_cost_components"
  WHERE "component" = 'seat' AND "scope" = 'default' AND "effective_to" IS NULL
  LIMIT 1
) seat
WHERE u."status" = 'active';--> statement-breakpoint

DELETE FROM "resource_cost_components" WHERE "component" = 'seat' AND "scope" <> 'employee';--> statement-breakpoint

ALTER TABLE "resource_cost_components" ALTER COLUMN "amount_per_hour" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "effort_baseline_lines" ALTER COLUMN "hours" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ALTER COLUMN "hours" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ALTER COLUMN "override_base" SET DATA TYPE numeric(15, 4);--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ALTER COLUMN "override_seat" SET DATA TYPE numeric(15, 4);--> statement-breakpoint
ALTER TABLE "sizing_drivers" ALTER COLUMN "applies_to" SET DEFAULT 'hours';--> statement-breakpoint
ALTER TABLE "resource_cost_components" DROP COLUMN "amount_per_week";--> statement-breakpoint
ALTER TABLE "effort_baseline_lines" DROP COLUMN "weeks";--> statement-breakpoint
ALTER TABLE "estimate_team_lines" DROP COLUMN "weeks";--> statement-breakpoint
ALTER TABLE "estimate_team_lines" DROP COLUMN "override_support";--> statement-breakpoint
ALTER TABLE "resource_cost_components" ADD CONSTRAINT "cost_components_seat_is_employee_check" CHECK ("resource_cost_components"."component" <> 'seat' OR "resource_cost_components"."scope" = 'employee');--> statement-breakpoint
ALTER TABLE "resource_cost_components" ADD CONSTRAINT "cost_components_component_check" CHECK ("resource_cost_components"."component" IN ('base', 'seat'));--> statement-breakpoint
ALTER TABLE "resource_cost_components" ADD CONSTRAINT "cost_components_amount_check" CHECK ("resource_cost_components"."amount_per_hour" >= 0);--> statement-breakpoint
ALTER TABLE "effort_baseline_lines" ADD CONSTRAINT "baseline_line_hours_check" CHECK ("effort_baseline_lines"."hours" > 0);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_cost_line_basis_check" CHECK ("estimate_cost_lines"."basis" IN ('engagement', 'per_resource_hour'));--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ADD CONSTRAINT "estimate_team_hours_check" CHECK ("estimate_team_lines"."hours" > 0);--> statement-breakpoint
ALTER TABLE "sizing_drivers" ADD CONSTRAINT "sizing_driver_applies_to_check" CHECK ("sizing_drivers"."applies_to" IN ('hours', 'team', 'both'));