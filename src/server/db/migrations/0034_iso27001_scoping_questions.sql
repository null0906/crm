-- The scoping questionnaire asked seven generic questions of every service line
-- alike, because they predate the per-service scoping added in 0032. They are
-- replaced here by a real ISO 27001 scope-definition set -- the first of what
-- becomes a distinct set per service line.
--
-- The source questions were open-ended governance prompts ("What business units
-- and legal entities are within scope?"). Asked that way they size nothing: the
-- engine composes a multiplier from counts and weighted choices, so free text
-- contributes 1.0 and the sizing step goes dormant. Each is therefore asked as
-- a COUNT -- how many, not what -- which the existing numeric driver type
-- already handles, and the original wording is kept as the description so the
-- governance prompt the count came from stays on screen.

-- Destroy the answers first. estimate_drivers.driver_id is ON DELETE restrict,
-- so this is not incidental tidying: without it the delete below is refused.
--
-- This throws away how two draft estimates were sized, which was the decision
-- taken -- neither is approved, so no frozen quotation moves. Their stored
-- size_multiplier is deliberately left alone rather than reset: a draft still
-- reads at the figure it was last costed on, and re-answering the new questions
-- is what replaces it. Zeroing it here would silently reprice two live drafts.
DELETE FROM "estimate_drivers" WHERE "driver_id" IN (
  SELECT "id" FROM "sizing_drivers" WHERE "slug" IN (
    'headcount_band', 'cloud_environments', 'physical_locations',
    'security_maturity', 'prior_certification', 'in_scope_systems',
    'parallel_frameworks'
  )
);--> statement-breakpoint

-- Options and service-line links cascade with the driver.
DELETE FROM "sizing_drivers" WHERE "slug" IN (
  'headcount_band', 'cloud_environments', 'physical_locations',
  'security_maturity', 'prior_certification', 'in_scope_systems',
  'parallel_frameworks'
);--> statement-breakpoint

-- The nine. created_by takes the earliest user, the same convention seed.ts
-- uses for adminUserId -- the column is NOT NULL and a question created by a
-- migration has no author more honest than "whoever set this system up".
--
-- Two departures from the eight-question source list, both deliberate:
--
--   Q1 becomes two questions. Sites and legal entities are counted
--   independently and scale differently: another site adds travel and a site
--   survey, another legal entity adds its own management review and statement
--   of applicability.
--
--   Q6 (exclusions) carries the smallest rate of the nine. An exclusion removes
--   scope but adds the work of justifying it against Annex A, so the net is
--   close to neutral. It is the weight most worth tuning against real delivery.
--
-- Every rate here is a starting point and editable per question in Settings.
-- Changing one only affects the next estimate scoped: an estimate stores the
-- multiplier it was actually built with.
INSERT INTO "sizing_drivers"
  ("slug", "name", "description", "value_type", "multiplier_per_unit", "unit_baseline", "position", "created_by")
SELECT v."slug", v."name", v."description", 'number', v."per_unit", v."baseline", v."position",
       (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1)
FROM (VALUES
  ('iso_sites_in_scope', 'Sites or locations in scope',
   'What business units, sites/locations and legal entities are within scope?', 0.0800, 1, 1),
  ('iso_legal_entities', 'Legal entities in scope',
   'What business units, sites/locations and legal entities are within scope?', 0.1000, 1, 2),
  ('iso_products_services', 'Products or services the ISMS covers',
   'What products, services and information assets does the ISMS cover?', 0.0500, 1, 3),
  ('iso_systems_in_scope', 'Systems and applications in scope',
   'What network boundaries, systems, applications and data flows are in scope?', 0.0200, 10, 4),
  ('iso_interested_parties', 'Interested parties imposing distinct requirements',
   'Which interested parties (regulators, customers, owners, employees) and their requirements apply?', 0.0300, 2, 5),
  ('iso_external_interfaces', 'Dependencies crossing the scope boundary',
   'What interfaces and dependencies exist with parties/services outside the scope (e.g. outsourced IT)?', 0.0400, 2, 6),
  ('iso_annex_a_exclusions', 'Annex A controls excluded',
   'Are there any exclusions? Is each exclusion justified against Annex A applicability?', 0.0200, 0, 7),
  ('iso_regulatory_regimes', 'Legal or regulatory regimes applying',
   'What legal, regulatory and contractual security requirements apply within scope?', 0.0600, 1, 8),
  ('iso_third_party_deps', 'Cloud and third-party dependencies in scope',
   'Have cloud, third-party and supply-chain dependencies been mapped into the scope?', 0.0300, 3, 9)
) AS v("slug", "name", "description", "per_unit", "baseline", "position")
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

-- Link every one to iso27001. Without this they would have no rows in the link
-- table, which means global -- recreating exactly the problem being fixed.
--
-- The nine are listed rather than matched on an 'iso_%' prefix: a pattern would
-- quietly adopt any later question whose slug happened to start that way, and
-- linking a question to the wrong service line is invisible until somebody
-- notices a stray question on an unrelated estimate.
INSERT INTO "sizing_driver_service_lines" ("driver_id", "service_line")
SELECT "id", 'iso27001' FROM "sizing_drivers" WHERE "slug" IN (
  'iso_sites_in_scope', 'iso_legal_entities', 'iso_products_services',
  'iso_systems_in_scope', 'iso_interested_parties', 'iso_external_interfaces',
  'iso_annex_a_exclusions', 'iso_regulatory_regimes', 'iso_third_party_deps'
)
ON CONFLICT DO NOTHING;
