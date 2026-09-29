-- Support became a cost line seeded at estimate creation, which leaves every
-- estimate that already existed without one — quietly cheaper by the support
-- it used to carry inside the loaded rate. This puts it back on the drafts.
--
-- Drafts only. An approved estimate reads from its frozen snapshot, so what it
-- shows is what was approved; adding a line to it would change a record that
-- exists precisely so it cannot change.
INSERT INTO "estimate_cost_lines" ("estimate_id", "kind", "label", "amount", "basis", "pass_through", "position")
SELECT e."id", 'custom', p."label", p."amount", 'per_resource_hour', false,
       COALESCE((SELECT MAX(cl."position") + 1 FROM "estimate_cost_lines" cl WHERE cl."estimate_id" = e."id"), 0)
FROM "estimates" e
CROSS JOIN (
  SELECT "label", "amount" FROM "support_cost_policies"
  WHERE "effective_to" IS NULL ORDER BY "effective_from" DESC, "version" DESC LIMIT 1
) p
WHERE e."status" = 'draft'
  AND NOT EXISTS (
    SELECT 1 FROM "estimate_cost_lines" cl
    WHERE cl."estimate_id" = e."id" AND cl."label" = p."label"
  );
