-- Support and overhead is charged per engagement, so the per-resource-hour
-- basis is no longer offered anywhere in the UI. Rows written before that —
-- seeded by 0027 to preserve cost when support left the hourly rate — would
-- otherwise keep scaling with hours invisibly, with nothing on screen to say so.
--
-- Converted to the flat amount each one currently produces, so no estimate's
-- cost moves. An estimate with no team lines yields zero, which is what its
-- per-hour line was already contributing.
--
-- Drafts only. An approved estimate reads from its frozen snapshot, and editing
-- its lines would change a record that exists precisely so it cannot change.
UPDATE "estimate_cost_lines" cl
SET "basis" = 'engagement',
    "amount" = ROUND(cl."amount" * COALESCE((
      SELECT SUM(tl."resource_count" * tl."hours")
      FROM "estimate_team_lines" tl
      WHERE tl."estimate_id" = cl."estimate_id"
    ), 0), 2)
FROM "estimates" e
WHERE e."id" = cl."estimate_id"
  AND cl."basis" = 'per_resource_hour'
  AND e."status" = 'draft';
