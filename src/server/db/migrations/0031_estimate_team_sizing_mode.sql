-- Sizing drivers used to grow the team as well as the hours, so a baseline that
-- fixed two people on a role could come back from the questionnaire with three.
-- Existing rows take 'fixed': the baseline's headcount holds and the growth
-- lands in hours per person. Total effort, and so cost, is unchanged either way
-- -- and approved estimates are frozen, so nothing already priced moves.
ALTER TABLE "estimates" ADD COLUMN "team_sizing_mode" varchar(20) DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimate_team_sizing_mode_check" CHECK ("estimates"."team_sizing_mode" IN ('fixed', 'grow'));
