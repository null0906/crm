-- Scoping used to hand back a fully-staffed team: the multiplier was split
-- across hours and headcount, a baseline was expanded by both, and the
-- estimator's job was to correct numbers nobody had chosen. This migration is
-- the schema half of taking that apart. Scoping now says only how big the
-- engagement is; hours and people are typed by a person; the cost engine still
-- prices what they typed.
--
-- Everything here is additive or a loosened constraint. No existing estimate
-- changes value, and approved ones are frozen against their snapshot anyway.

-- What we sell, as data. The list was a source constant, so adding a service
-- line meant a deploy before anyone could price one. Slug is the primary key
-- because it is already what every other table stores; no foreign keys point
-- here, because margin_targets uses a '*' sentinel and pre-migration rows may
-- hold slugs this table has never heard of.
CREATE TABLE "service_lines" (
	"slug" varchar(50) PRIMARY KEY NOT NULL,
	"label" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Seeded from SERVICE_LINES in src/lib/service-lines.ts, in its order. That
-- constant stays as the seed of record and as the client's fallback while the
-- query is in flight, so the two cannot silently diverge on day one.
INSERT INTO "service_lines" ("slug", "label", "position") VALUES
	('soc2_type1', 'SOC 2 Type I', 0),
	('soc2_type2', 'SOC 2 Type II', 1),
	('iso27001', 'ISO 27001', 2),
	('iso27701', 'ISO 27701 (PIMS)', 3),
	('dpdp', 'DPDP Act', 4),
	('gdpr', 'GDPR', 5),
	('vapt', 'VAPT', 6),
	('pci_dss', 'PCI DSS', 7),
	('cspm', 'Cloud Security (CSPM)', 8),
	('cert_in', 'CERT-In', 9),
	('ai_governance', 'AI Governance', 10),
	('grc_consulting', 'GRC Consulting', 11),
	('compliance_automation', 'Compliance Automation', 12),
	('security_awareness_training', 'Security Awareness Training', 13),
	('audit_support', 'Audit Support', 14),
	('other', 'Other', 15)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

-- Which service lines a scoping question is asked on. NO ROWS FOR A DRIVER
-- MEANS EVERY SERVICE LINE -- that convention is what makes this table purely
-- additive: every driver that exists today gets no rows and keeps being asked
-- everywhere, exactly as it is now.
CREATE TABLE "sizing_driver_service_lines" (
	"driver_id" uuid NOT NULL,
	"service_line" varchar(50) NOT NULL,
	CONSTRAINT "pk_driver_service_line" PRIMARY KEY("driver_id","service_line")
);--> statement-breakpoint
ALTER TABLE "sizing_driver_service_lines" ADD CONSTRAINT "sizing_driver_service_lines_driver_id_sizing_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."sizing_drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_driver_service_lines_service" ON "sizing_driver_service_lines" USING btree ("service_line");--> statement-breakpoint

-- What a standard (x1) engagement of this service ought to cost. Nullable
-- because a baseline written before benchmarking existed has no honest answer,
-- and a zero would read as free. It never sets a price -- the builder shows
-- ideal_cost x the scoping multiplier beside what the engine computed, so a
-- team and hours that disagree with the shape of the work are visible.
ALTER TABLE "effort_baselines" ADD COLUMN "ideal_cost" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "effort_baselines" ADD CONSTRAINT "baseline_ideal_cost_check" CHECK ("effort_baselines"."ideal_cost" IS NULL OR "effort_baselines"."ideal_cost" >= 0);--> statement-breakpoint

-- The engagement as the estimator commits to it: the window the client asked
-- for, and the effort judged necessary to fill it. Nullable and never
-- pre-filled -- knowing the work is 2.3x standard is not knowing how many hours
-- anyone will commit, and an estimate is legitimately unfinished until somebody
-- decides. Neither constrains the team lines; the builder reports the gap.
ALTER TABLE "estimates" ADD COLUMN "engagement_weeks" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "engagement_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimate_engagement_weeks_check" CHECK ("estimates"."engagement_weeks" IS NULL OR "estimates"."engagement_weeks" > 0);--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimate_engagement_hours_check" CHECK ("estimates"."engagement_hours" IS NULL OR "estimates"."engagement_hours" > 0);--> statement-breakpoint

-- A role can be on the sheet before anyone has decided how long it needs.
-- Seeding the roles a baseline suggests is exactly that case, and writing a
-- placeholder number instead would be the machine inventing the answer this
-- whole change removes. A null-hours line costs nothing and the engine warns
-- that it is unfinished. Loosening only: every existing row has hours > 0 and
-- still satisfies the replacement constraint.
ALTER TABLE "estimate_team_lines" ALTER COLUMN "hours" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_team_lines" DROP CONSTRAINT "estimate_team_hours_check";--> statement-breakpoint
ALTER TABLE "estimate_team_lines" ADD CONSTRAINT "estimate_team_hours_check" CHECK ("estimate_team_lines"."hours" IS NULL OR "estimate_team_lines"."hours" > 0);
