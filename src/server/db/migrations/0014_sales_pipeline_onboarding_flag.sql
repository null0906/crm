ALTER TABLE pipelines
ADD COLUMN IF NOT EXISTS is_sales_pipeline boolean NOT NULL DEFAULT false;

UPDATE pipelines
SET is_sales_pipeline = (lower(name) = 'sales pipeline');

-- Existing onboarding rows were previously created for every won prospect.
-- Reset them so onboarding mirrors only pipelines explicitly marked for sales onboarding.
DELETE FROM onboardings o
USING deals d, pipelines p
WHERE o.deal_id = d.id
  AND d.pipeline_id = p.id
  AND p.is_sales_pipeline = false;
