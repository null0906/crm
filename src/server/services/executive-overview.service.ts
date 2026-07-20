import { TRPCError } from '@trpc/server';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';

/**
 * Shared with executive-overview.router.ts and the AI assistant's executive-overview
 * tools so both enforce the literal same gate, not a hand-copied duplicate.
 */
export function requireExecutiveAccess(roleSlug?: string) {
  if (roleSlug !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Executive overview is restricted to super admins.',
    });
  }
}

type Rows = Array<Record<string, unknown>>;

export async function getExecutiveSummary() {
  const [activeProjectsResult, hotProspectsResult, completedProjectsResult, membersResult] = await Promise.all([
    db.execute(sql`
      SELECT
        p.id,
        p.name,
        p.stage,
        p.status,
        p.progress_percent,
        p.end_date,
        c.name AS company_name,
        owner.first_name AS owner_first_name,
        owner.last_name AS owner_last_name
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN users owner ON owner.id = p.owner_id
      WHERE p.deleted_at IS NULL
        AND p.status = 'active'
      ORDER BY COALESCE(p.end_date, CURRENT_DATE + INTERVAL '10 years') ASC, p.updated_at DESC
      LIMIT 200
    `),
    db.execute(sql`
      SELECT
        d.id,
        d.title,
        d.probability,
        d.expected_close_date,
        c.name AS company_name,
        ps.name AS stage_name,
        ps.default_probability,
        owner.first_name AS owner_first_name,
        owner.last_name AS owner_last_name
      FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.stage_id
      LEFT JOIN companies c ON c.id = d.company_id
      LEFT JOIN users owner ON owner.id = d.owner_id
      WHERE d.deleted_at IS NULL
        AND d.status = 'open'
        AND ps.stage_type = 'active'
        AND (
          COALESCE(d.probability, ps.default_probability, 0) >= 70
          OR d.expected_close_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        )
      ORDER BY
        COALESCE(d.expected_close_date, CURRENT_DATE + INTERVAL '10 years') ASC,
        COALESCE(d.probability, ps.default_probability, 0) DESC,
        d.updated_at DESC
      LIMIT 200
    `),
    db.execute(sql`
      SELECT
        p.id,
        p.name,
        p.stage,
        p.status,
        p.progress_percent,
        p.actual_end_date,
        c.name AS company_name,
        owner.first_name AS owner_first_name,
        owner.last_name AS owner_last_name
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN users owner ON owner.id = p.owner_id
      WHERE p.deleted_at IS NULL
        AND p.status = 'completed'
      ORDER BY COALESCE(p.actual_end_date, p.updated_at) DESC
      LIMIT 200
    `),
    db.execute(sql`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        r.slug AS role_slug,
        r.name AS role_name,
        COALESCE(prospect_counts.prospect_count, 0)::int AS prospect_count,
        COALESCE(project_counts.project_count, 0)::int AS project_count,
        COALESCE(completed_counts.completed_project_count, 0)::int AS completed_project_count,
        COALESCE(activity_counts.activity_count, 0)::int AS activity_count,
        latest_activity.latest_activity_at
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT d.id)::int AS prospect_count
        FROM deals d
        LEFT JOIN deal_team_members dtm ON dtm.deal_id = d.id
        WHERE d.deleted_at IS NULL
          AND d.status = 'open'
          AND (d.owner_id = u.id OR d.created_by = u.id OR dtm.user_id = u.id)
      ) prospect_counts ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT p.id)::int AS project_count
        FROM projects p
        LEFT JOIN project_members pm ON pm.project_id = p.id
        WHERE p.deleted_at IS NULL
          AND p.status = 'active'
          AND (p.owner_id = u.id OR p.created_by = u.id OR pm.user_id = u.id)
      ) project_counts ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT p.id)::int AS completed_project_count
        FROM projects p
        LEFT JOIN project_members pm ON pm.project_id = p.id
        WHERE p.deleted_at IS NULL
          AND p.status = 'completed'
          AND (p.owner_id = u.id OR p.created_by = u.id OR pm.user_id = u.id)
      ) completed_counts ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(a.id)::int AS activity_count
        FROM activities a
        WHERE a.deleted_at IS NULL
          AND a.is_automated = false
          AND a.performed_by = u.id
          AND a.occurred_at >= NOW() - INTERVAL '30 days'
      ) activity_counts ON true
      LEFT JOIN LATERAL (
        SELECT MAX(a.occurred_at) AS latest_activity_at
        FROM activities a
        WHERE a.deleted_at IS NULL
          AND a.is_automated = false
          AND a.performed_by = u.id
      ) latest_activity ON true
      WHERE u.status = 'active'
      ORDER BY u.first_name ASC, u.last_name ASC
    `),
  ]);

  const activeProjects = (activeProjectsResult as { rows: Rows }).rows;
  const hotProspects = (hotProspectsResult as { rows: Rows }).rows;
  const completedProjects = (completedProjectsResult as { rows: Rows }).rows;
  const members = (membersResult as { rows: Rows }).rows;

  return {
    activeProjects,
    hotProspects,
    completedProjects,
    members,
    totals: {
      activeProjects: activeProjects.length,
      hotProspects: hotProspects.length,
      completedProjects: completedProjects.length,
      members: members.length,
    },
  };
}

export async function getExecutiveMemberDetail(userId: string) {
  const [memberResult, prospectsResult, projectsResult, activitiesResult] = await Promise.all([
    db.execute(sql`
      SELECT u.id, u.first_name, u.last_name, u.email, r.slug AS role_slug, r.name AS role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ${userId}
      LIMIT 1
    `),
    db.execute(sql`
      SELECT DISTINCT
        d.id,
        d.title,
        d.probability,
        d.expected_close_date,
        d.status,
        c.name AS company_name,
        ps.name AS stage_name,
        ps.default_probability,
        CASE
          WHEN d.owner_id = ${userId} THEN 'Owner'
          WHEN d.created_by = ${userId} THEN 'Creator'
          ELSE 'Team member'
        END AS involvement
      FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.stage_id
      LEFT JOIN companies c ON c.id = d.company_id
      LEFT JOIN deal_team_members dtm ON dtm.deal_id = d.id
      WHERE d.deleted_at IS NULL
        AND d.status = 'open'
        AND (d.owner_id = ${userId} OR d.created_by = ${userId} OR dtm.user_id = ${userId})
      ORDER BY COALESCE(d.expected_close_date, CURRENT_DATE + INTERVAL '10 years') ASC, d.updated_at DESC
      LIMIT 100
    `),
    db.execute(sql`
      SELECT DISTINCT
        p.id,
        p.name,
        p.stage,
        p.status,
        p.progress_percent,
        p.end_date,
        p.actual_end_date,
        c.name AS company_name,
        CASE
          WHEN p.owner_id = ${userId} THEN 'Owner'
          WHEN p.created_by = ${userId} THEN 'Creator'
          ELSE COALESCE(pm.role, 'Member')
        END AS involvement
      FROM projects p
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE p.deleted_at IS NULL
        AND (p.owner_id = ${userId} OR p.created_by = ${userId} OR pm.user_id = ${userId})
      ORDER BY
        CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
        COALESCE(p.end_date, CURRENT_DATE + INTERVAL '10 years') ASC,
        p.updated_at DESC
      LIMIT 100
    `),
    db.execute(sql`
      SELECT
        a.id,
        a.activity_type,
        a.subject,
        a.occurred_at,
        a.call_outcome,
        a.task_due_date,
        a.task_completed_at,
        c.first_name AS contact_first_name,
        c.last_name AS contact_last_name,
        co.name AS company_name,
        d.title AS deal_title
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN companies co ON co.id = a.company_id
      LEFT JOIN deals d ON d.id = a.deal_id
      WHERE a.deleted_at IS NULL
        AND a.is_automated = false
        AND a.performed_by = ${userId}
      ORDER BY a.occurred_at DESC
      LIMIT 50
    `),
  ]);

  const member = (memberResult as { rows: Rows }).rows[0];
  if (!member) return null;

  return {
    member,
    prospects: (prospectsResult as { rows: Rows }).rows,
    projects: (projectsResult as { rows: Rows }).rows,
    activities: (activitiesResult as { rows: Rows }).rows,
  };
}
