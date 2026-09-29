-- The nine questions in 0034 came from a scope-definition checklist, and they
-- describe the ISMS well: how many sites, entities, systems, regimes. Running a
-- real client intake against them showed the gap -- they capture how BIG the
-- scope is and almost nothing about how HARD the job is.
--
-- The intake in question: no policies, no certifications, no logging, no
-- monitoring, no endpoint protection, no access control, and certification
-- wanted within one month. Everything has to be built from zero, at speed. Under
-- the nine questions that engagement priced the same as one for a client with a
-- mature ISMS and six months to spare.
--
-- Five questions close that gap. Four of them are genuinely categorical rather
-- than countable -- "how many months until certification" inverts awkwardly and
-- a hosting model has no natural count -- so they are asked as weighted choices.
-- That also bounds them: a linear per-unit count reaches the ceiling on its own
-- given a large enough answer, where a fixed set of options cannot.

-- The five. created_by takes the earliest user, as in 0034: a question created
-- by a migration has no author more honest than whoever set the system up.
-- Select drivers carry no multiplier_per_unit -- their weight lives on each
-- option -- and the descriptions are the intake questions these came from, which
-- the questionnaire renders beneath the name.
INSERT INTO "sizing_drivers"
  ("slug", "name", "description", "value_type", "multiplier_per_unit", "unit_baseline", "position", "created_by")
SELECT v."slug", v."name", v."description", v."value_type", v."per_unit", v."baseline", v."position",
       (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1)
FROM (VALUES
  ('iso_business_functions', 'Business functions in scope',
   'What are your critical business processes and functions? How is your organization structured (departments, teams, locations)?',
   'number', 0.0600::numeric, 3, 10),
  ('iso_security_posture', 'Information security already in place',
   'Do you already have any information security policies or frameworks in place? Are you using any existing certifications (e.g. SOC 2, NIST, CIS)? Are you using tools for logging, monitoring, endpoint protection, access control?',
   'select', NULL::numeric, 0, 11),
  ('iso_certification_deadline', 'Time until certification is required',
   'What is your expected timeline for certification?',
   'select', NULL::numeric, 0, 12),
  ('iso_hosting_model', 'Where the in-scope systems run',
   'Are your systems hosted on-premises, in the cloud, or hybrid?',
   'select', NULL::numeric, 0, 13),
  ('iso_identity_management', 'How identity is managed',
   'Do you use a central identity management system (e.g. Azure AD, Okta)?',
   'select', NULL::numeric, 0, 14)
) AS v("slug", "name", "description", "value_type", "per_unit", "baseline", "position")
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

-- The options. `value` is the stable key and `label` is what gets rendered:
-- labels are editable in Settings, values are not, so an estimate's recorded
-- answer survives somebody rewording the option.
--
-- Posture and deadline are the two largest weights in the whole set, which is
-- the point of adding them. Both also reach below 1.0: a client who is already
-- audited, or who has six months, is genuinely cheaper to serve than standard,
-- and a sizing model that can only ever add is one that never quotes anybody a
-- discount they have earned.
INSERT INTO "sizing_driver_options" ("driver_id", "value", "label", "multiplier", "position")
SELECT d."id", v."value", v."label", v."multiplier", v."position"
FROM (VALUES
  ('iso_security_posture', 'nothing',        'Nothing at all',                 1.3500::numeric, 0),
  ('iso_security_posture', 'policies_only',  'Policies written, no tooling',    1.2000::numeric, 1),
  ('iso_security_posture', 'partial_tooling','Some tooling in place',           1.0800::numeric, 2),
  ('iso_security_posture', 'established',    'Established and audited',         0.9500::numeric, 3),
  ('iso_certification_deadline', 'under_2m', 'Under 2 months',                  1.4000::numeric, 0),
  ('iso_certification_deadline', '2_to_4m',  '2 to 4 months',                   1.1000::numeric, 1),
  ('iso_certification_deadline', '4_to_6m',  '4 to 6 months',                   1.0000::numeric, 2),
  ('iso_certification_deadline', 'over_6m',  'Over 6 months',                   0.9500::numeric, 3),
  ('iso_hosting_model', 'hybrid',            'Hybrid',                          1.2000::numeric, 0),
  ('iso_hosting_model', 'on_premises',       'On-premises',                     1.1000::numeric, 1),
  ('iso_hosting_model', 'single_cloud',      'Single cloud',                    1.0000::numeric, 2),
  ('iso_identity_management', 'none',        'No central directory',            1.2000::numeric, 0),
  ('iso_identity_management', 'directory',   'Directory without SSO/IdP',       1.1000::numeric, 1),
  ('iso_identity_management', 'central_idp', 'Central IdP with SSO',            1.0000::numeric, 2)
) AS v("driver_slug", "value", "label", "multiplier", "position")
JOIN "sizing_drivers" d ON d."slug" = v."driver_slug"
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Link the five to iso27001. Listed explicitly rather than matched on a prefix:
-- a pattern would quietly adopt any later question whose slug started the same
-- way, and a question on the wrong service line is invisible until somebody
-- notices it on an unrelated estimate.
INSERT INTO "sizing_driver_service_lines" ("driver_id", "service_line")
SELECT "id", 'iso27001' FROM "sizing_drivers" WHERE "slug" IN (
  'iso_business_functions', 'iso_security_posture', 'iso_certification_deadline',
  'iso_hosting_model', 'iso_identity_management'
)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Compose additively from here on.
--
-- Multiplying fourteen questions together compounds far past what any of them
-- claims. The intake above composes to 4.35x multiplicatively and pins to the
-- 3.0x ceiling -- at which point the questions stop telling anyone anything,
-- because every large client caps at the same number. Summing the increments
-- instead gives 2.67x for the same answers: under the ceiling, and still
-- distinguishable from the next client.
--
-- A new version rather than an edit, matching setPolicy. The previous version is
-- deliberately left open: resolution orders by effective_from DESC, version
-- DESC, so this wins from today while an estimate dated earlier still resolves
-- the multiplicative rules it was actually built under.
INSERT INTO "sizing_policies"
  ("name", "version", "max_multiplier", "composition", "effective_from", "notes", "created_by")
SELECT 'Standard sizing policy', 3, 3.00, 'additive', CURRENT_DATE,
       'Additive from the fourteen-question ISO 27001 set: multiplying that many drivers compounds past the ceiling and stops discriminating between clients.',
       (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM "sizing_policies" WHERE "name" = 'Standard sizing policy' AND "version" = 3
);
