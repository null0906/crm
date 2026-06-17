CREATE TABLE IF NOT EXISTS personal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_name varchar(255) NOT NULL,
  description text,
  linked_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  linked_deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  is_internal boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  hours_spent decimal(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_tasks_status_check CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  CONSTRAINT personal_tasks_one_linkage_type CHECK (
    (CASE WHEN linked_project_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN linked_deal_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN is_internal = true THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_personal_tasks_user ON personal_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_status ON personal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_project ON personal_tasks(linked_project_id);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_deal ON personal_tasks(linked_deal_id);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_started ON personal_tasks(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_status ON personal_tasks(user_id, status);
