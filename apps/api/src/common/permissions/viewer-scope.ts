import { and, eq, inArray, or } from 'drizzle-orm'
import type { Column, SQL } from 'drizzle-orm'
import { projectMembers, projects, spaceMembers, spaces, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { isAdminRole } from './workspace-roles'
import { resolveIsManager, taskVisibilityFilter } from './item-visibility'
import { taskInReachFilter } from './container-access.guard-helper'

/*
 * WHOSE WORK A PERSON IS SHOWN IN A VIEW OF MANY PEOPLE — reports, the Time
 * page's team week and monthly rollup (Plan §3.3):
 *   - an admin (and a platform admin) sees everyone;
 *   - a manager sees their team: the spaces and projects they belong to, and
 *     their own rows;
 *   - anyone else sees their own.
 *
 * The reports kept this in `ReportsService`, and the Time page kept "the
 * admins', or your own" beside it, so one page answered it two ways
 * (`found-25-sep/time-page-answers-whose-hours-twice`). It is stated once here.
 */
export type ViewerScope =
  | { kind: 'all' }
  | { kind: 'user'; userId: string }
  | { kind: 'containers'; spaceIds: string[]; projectIds: string[]; userId: string }

/** The scope `userId` reads the workspace's people-wide views with. */
export async function viewerScopeOf(db: Db, workspaceId: string, userId: string): Promise<ViewerScope> {
  const [m] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  if (m && isAdminRole(m.role)) return { kind: 'all' }
  if (m && m.role === 'manager') {
    const [spaceRows, projectRows] = await Promise.all([
      db
        .select({ spaceId: spaceMembers.spaceId })
        .from(spaceMembers)
        .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(spaceMembers.userId, userId))),
      db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .innerJoin(projects, eq(projects.id, projectMembers.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(projectMembers.userId, userId))),
    ])
    return {
      kind: 'containers',
      spaceIds: [...new Set(spaceRows.map((r) => r.spaceId))],
      projectIds: [...new Set(projectRows.map((r) => r.projectId))],
      userId,
    }
  }
  return { kind: 'user', userId }
}

/**
 * A row is inside a manager's team: its space or project is one they belong
 * to, or it is their own. `undefined` — no condition — for every other scope,
 * whose own narrowing (everyone, or `userId` alone) the caller applies.
 */
export function containerScopeCondition(
  viewer: ViewerScope,
  cols: { spaceIdCol: Column; projectIdCol: Column; ownerCol: Column },
): SQL | undefined {
  if (viewer.kind !== 'containers') return undefined
  const parts: SQL[] = []
  if (viewer.spaceIds.length) parts.push(inArray(cols.spaceIdCol, viewer.spaceIds))
  if (viewer.projectIds.length) parts.push(inArray(cols.projectIdCol, viewer.projectIds))
  parts.push(eq(cols.ownerCol, viewer.userId))
  return or(...parts)
}

/**
 * The tasks `actor` may read, as a WHERE fragment over the unaliased `tasks`
 * table: the container rule and the private-item rule. `undefined` for a
 * manager, and for a trusted caller that passes no actor (a scheduled mailer,
 * a cron), whose workspace-wide aggregates are unchanged.
 */
export async function taskReadFilterFor(
  db: Db,
  workspaceId: string,
  actor?: { id: string; role?: string | null },
): Promise<SQL | undefined> {
  if (!actor) return undefined
  const isManager = await resolveIsManager(db, workspaceId, actor.id, actor.role)
  return and(taskInReachFilter(db, workspaceId, actor.id, isManager), taskVisibilityFilter(db, actor.id, isManager))
}
