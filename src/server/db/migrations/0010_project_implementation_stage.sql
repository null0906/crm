ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_stage_check";

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_stage_check"
  CHECK ("stage" IN (
    'kickoff',
    'gap_assessment',
    'implementation',
    'internal_audit',
    'external_audit',
    'certified',
    'on_hold',
    'cancelled'
  ));

ALTER TABLE "project_stage_history" DROP CONSTRAINT IF EXISTS "project_stage_history_stage_check";

ALTER TABLE "project_stage_history"
  ADD CONSTRAINT "project_stage_history_stage_check"
  CHECK (
    ("from_stage" IS NULL OR "from_stage" IN (
      'kickoff',
      'gap_assessment',
      'implementation',
      'internal_audit',
      'external_audit',
      'certified',
      'on_hold',
      'cancelled'
    ))
    AND "to_stage" IN (
      'kickoff',
      'gap_assessment',
      'implementation',
      'internal_audit',
      'external_audit',
      'certified',
      'on_hold',
      'cancelled'
    )
  );
