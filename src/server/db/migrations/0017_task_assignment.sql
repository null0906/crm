ALTER TABLE personal_tasks ADD COLUMN assigned_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE personal_tasks ADD COLUMN due_date date;
ALTER TABLE personal_tasks ADD COLUMN priority varchar(10);
ALTER TABLE personal_tasks ADD COLUMN cancel_reason text;

ALTER TABLE personal_tasks ADD CONSTRAINT personal_tasks_priority_check
  CHECK (priority IS NULL OR priority IN ('low','medium','high','urgent'));

CREATE INDEX idx_personal_tasks_assigned_by ON personal_tasks(assigned_by);
CREATE INDEX idx_personal_tasks_due_date ON personal_tasks(due_date);

-- Backfill: seed.ts only affects fresh seeds, not live role rows, so grant the
-- new tasks.assign permission to the already-seeded super_admin role directly.
UPDATE roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{tasks}',
  COALESCE(permissions->'tasks', '{}'::jsonb) || '{"assign": true}'::jsonb,
  true
),
updated_at = now()
WHERE slug = 'super_admin';
