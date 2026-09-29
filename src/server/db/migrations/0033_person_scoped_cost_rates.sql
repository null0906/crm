-- Cost was priced against a delivery role -- "a Security Analyst costs 650 an
-- hour" -- with a company-wide default beneath it. That averages away the thing
-- being priced: two analysts do not cost the same, and an estimate built on the
-- average is only accidentally right about either of them. The person becomes
-- the unit of cost.
--
-- Nothing is deleted and no resolution logic changes. Retiring a rate here means
-- closing it, which is the whole point of effective dating: an estimate dated
-- before today still resolves the figure it was actually built on.

-- Allow a row to be closed the day before it began.
--
-- The old range check demanded effective_to >= effective_from, which cannot
-- express "superseded before it ever took effect" -- and that is a real state.
-- It is also a live bug independent of this migration: setComponent closes the
-- standing row at (new effective_from - 1 day), so CORRECTING A RATE TWICE IN
-- ONE DAY fails outright, which is exactly what happens after a typo in a
-- salary figure. Relaxing by a single day fixes that, and lets the retirement
-- below close every row uniformly instead of leaving a tail.
--
-- Resolution is unaffected by construction: a row with
-- effective_to = effective_from - 1 can never satisfy
-- effective_from <= as_of AND effective_to >= as_of, so it resolves on no date
-- at all. Every existing row already satisfies the looser rule, so this
-- validates without a rewrite.
ALTER TABLE "resource_cost_components" DROP CONSTRAINT "cost_components_range_check";--> statement-breakpoint
ALTER TABLE "resource_cost_components"
  ADD CONSTRAINT "cost_components_range_check"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from" - 1);--> statement-breakpoint

-- Close the standing role and company-default base rates, so a draft dated from
-- today resolves nothing for a line that names nobody -- the estimate says it
-- cannot price the line instead of quietly reporting an average as if it were a
-- cost. Approved estimates are unaffected either way: they read their frozen
-- snapshot, not these rows.
--
-- CURRENT_DATE - 1, not CURRENT_DATE, and the difference is the whole point.
-- Rate resolution filters on `effective_to >= as_of`, an INCLUSIVE end date, so
-- closing a row *at* today would leave it resolving *for* today -- the averages
-- would go on pricing estimates for one more day. A rate that began today
-- therefore closes before it began and never applies at all, which is what the
-- relaxed check above permits and is the honest reading: it was retired before
-- it priced anything, and the row stays as the record of that.
UPDATE "resource_cost_components"
SET "effective_to" = CURRENT_DATE - 1, "updated_at" = now()
WHERE "component" = 'base'
  AND "scope" IN ('role', 'default')
  AND "effective_to" IS NULL;--> statement-breakpoint

-- Refuse new non-employee base rates, mirroring the seat rule already in place.
--
-- NOT VALID is load-bearing, not laziness: the rows just closed above violate
-- this constraint and MUST survive it, because they are what historic estimates
-- resolve against. The constraint governs new writes only.
--
-- With this and cost_components_seat_is_employee_check both in force, every new
-- row in this table is employee-scoped. `scope` becomes a column that only
-- history still varies.
ALTER TABLE "resource_cost_components"
  ADD CONSTRAINT "cost_components_base_is_employee_check"
  CHECK ("component" <> 'base' OR "scope" = 'employee') NOT VALID;
