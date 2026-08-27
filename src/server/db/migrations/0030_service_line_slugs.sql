-- Service lines become slugs everywhere estimating stores them.
--
-- Three vocabularies had grown up independently: prospects recorded what the
-- sales team picked from its own list ('SOC 2'), projects used slugs
-- ('soc2_type2'), and the effort catalog stored whichever the author typed.
-- The cost was not cosmetic -- the only seeded baseline was written as
-- 'soc2_type2' while the estimate dialog searched for 'SOC 2', so it could
-- never be found and every SOC 2 estimate started from a blank sheet.
--
-- Data only; no schema changes. `service_line` is varchar on all three tables
-- and stays that way, because the canonical list lives in
-- src/lib/service-lines.ts where it can gain an entry without a migration.
--
-- The mapping below is GENERATED from that file, so the migration and
-- fromLegacy() cannot disagree. Canonical slugs map to themselves on purpose:
-- that is what normalises a row stored as 'CSPM' or 'DPDP', which the lookup
-- would otherwise leave alone while TypeScript lower-cased it.
--
-- NO MONEY MOVES. Estimates and margin targets are mapped by the same table,
-- so an estimate that resolved a target before still resolves the same target
-- after. Nothing here touches an amount, a rate or a stored total.
--
-- `deals.services` is deliberately left alone. It is a sales-side multi-select
-- with an 'Other' escape hatch, answering a different question than "what did
-- we price this as", and coverageGaps now maps it through fromLegacy() at read
-- time instead of comparing raw strings.
--
-- 'soc 2' resolves to Type II. The sales list never distinguished the two and
-- Type II is the overwhelming majority of what is sold, but it is a guess and
-- it is the only one here. A row that was genuinely a Type I must be corrected
-- by hand; nothing can recover that from the string.
--
-- If two open margin_targets rows map onto the same slug and segment, the
-- partial unique index uq_margin_target_open will reject this migration. That
-- is the intended outcome: two targets that were always the same target need a
-- human to decide which survives, not a silent merge.

UPDATE "effort_baselines" b
SET "service_line" = m.slug
FROM (VALUES
  ('ai_governance', 'ai_governance'),
  ('audit support', 'audit_support'),
  ('audit_support', 'audit_support'),
  ('cert-in', 'cert_in'),
  ('cert_in', 'cert_in'),
  ('cloud security', 'cspm'),
  ('compliance automation', 'compliance_automation'),
  ('compliance_automation', 'compliance_automation'),
  ('cspm', 'cspm'),
  ('custom', 'other'),
  ('dpdp', 'dpdp'),
  ('dpdpa', 'dpdp'),
  ('gdpr', 'gdpr'),
  ('grc consulting', 'grc_consulting'),
  ('grc_consulting', 'grc_consulting'),
  ('iso 27001', 'iso27001'),
  ('iso 27701', 'iso27701'),
  ('iso27001', 'iso27001'),
  ('iso27701', 'iso27701'),
  ('other', 'other'),
  ('pci dss', 'pci_dss'),
  ('pci_dss', 'pci_dss'),
  ('pims', 'iso27701'),
  ('security awareness training', 'security_awareness_training'),
  ('security_awareness_training', 'security_awareness_training'),
  ('soc 2', 'soc2_type2'),
  ('soc2', 'soc2_type2'),
  ('soc2_type1', 'soc2_type1'),
  ('soc2_type2', 'soc2_type2'),
  ('vapt', 'vapt')
) AS m(legacy, slug)
WHERE LOWER(TRIM(b."service_line")) = m.legacy
  AND b."service_line" IS DISTINCT FROM m.slug;
--> statement-breakpoint

UPDATE "estimates" e
SET "service_line" = m.slug
FROM (VALUES
  ('ai_governance', 'ai_governance'),
  ('audit support', 'audit_support'),
  ('audit_support', 'audit_support'),
  ('cert-in', 'cert_in'),
  ('cert_in', 'cert_in'),
  ('cloud security', 'cspm'),
  ('compliance automation', 'compliance_automation'),
  ('compliance_automation', 'compliance_automation'),
  ('cspm', 'cspm'),
  ('custom', 'other'),
  ('dpdp', 'dpdp'),
  ('dpdpa', 'dpdp'),
  ('gdpr', 'gdpr'),
  ('grc consulting', 'grc_consulting'),
  ('grc_consulting', 'grc_consulting'),
  ('iso 27001', 'iso27001'),
  ('iso 27701', 'iso27701'),
  ('iso27001', 'iso27001'),
  ('iso27701', 'iso27701'),
  ('other', 'other'),
  ('pci dss', 'pci_dss'),
  ('pci_dss', 'pci_dss'),
  ('pims', 'iso27701'),
  ('security awareness training', 'security_awareness_training'),
  ('security_awareness_training', 'security_awareness_training'),
  ('soc 2', 'soc2_type2'),
  ('soc2', 'soc2_type2'),
  ('soc2_type1', 'soc2_type1'),
  ('soc2_type2', 'soc2_type2'),
  ('vapt', 'vapt')
) AS m(legacy, slug)
WHERE LOWER(TRIM(e."service_line")) = m.legacy
  AND e."service_line" IS DISTINCT FROM m.slug;
--> statement-breakpoint

-- '*' is the company-wide sentinel and is not in the mapping table, so it is
-- left exactly as it is. It exists instead of NULL because the partial unique
-- index over this column treats NULLs as distinct, which would let two open
-- company-wide rows coexist.
UPDATE "margin_targets" t
SET "service_line" = m.slug
FROM (VALUES
  ('ai_governance', 'ai_governance'),
  ('audit support', 'audit_support'),
  ('audit_support', 'audit_support'),
  ('cert-in', 'cert_in'),
  ('cert_in', 'cert_in'),
  ('cloud security', 'cspm'),
  ('compliance automation', 'compliance_automation'),
  ('compliance_automation', 'compliance_automation'),
  ('cspm', 'cspm'),
  ('custom', 'other'),
  ('dpdp', 'dpdp'),
  ('dpdpa', 'dpdp'),
  ('gdpr', 'gdpr'),
  ('grc consulting', 'grc_consulting'),
  ('grc_consulting', 'grc_consulting'),
  ('iso 27001', 'iso27001'),
  ('iso 27701', 'iso27701'),
  ('iso27001', 'iso27001'),
  ('iso27701', 'iso27701'),
  ('other', 'other'),
  ('pci dss', 'pci_dss'),
  ('pci_dss', 'pci_dss'),
  ('pims', 'iso27701'),
  ('security awareness training', 'security_awareness_training'),
  ('security_awareness_training', 'security_awareness_training'),
  ('soc 2', 'soc2_type2'),
  ('soc2', 'soc2_type2'),
  ('soc2_type1', 'soc2_type1'),
  ('soc2_type2', 'soc2_type2'),
  ('vapt', 'vapt')
) AS m(legacy, slug)
WHERE LOWER(TRIM(t."service_line")) = m.legacy
  AND t."service_line" IS DISTINCT FROM m.slug;
