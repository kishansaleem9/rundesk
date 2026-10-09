import { and, eq } from 'drizzle-orm'
import { workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'

/**
 * WHAT A PERSON MAY DO WHERE THEY ONLY VIEW — ClickUp's four individual
 * permissions for view-only members and guests
 * (`found-25-sep/view-only-individual-permissions`). Its help centre, "Manage
 * individual permissions for view only users" (through search excerpts):
 *
 *   · time estimates and time tracking are on by default;
 *   · adding or removing tags, and creating views, are off by default;
 *   · an owner or admin turns each on or off for a person, on the Manage
 *     people page, in the row's permissions.
 *
 * Asked only where the person's level on the location is View: at Comment and
 * above, the level's own rule decides, as it did before.
 */
export const VIEW_ONLY_PERMISSIONS = ['timeEstimates', 'timeTracking', 'tags', 'createViews'] as const
export type ViewOnlyPermission = (typeof VIEW_ONLY_PERMISSIONS)[number]
export type ViewOnlyPermissions = Record<ViewOnlyPermission, boolean>

/** ClickUp's defaults, which the columns default to (migration 0176). */
export const VIEW_ONLY_DEFAULTS: ViewOnlyPermissions = { timeEstimates: true, timeTracking: true, tags: false, createViews: false }

/** What a refusal at View says, so the person reads why and whom to ask. */
export const VIEW_ONLY_REFUSALS: Record<ViewOnlyPermission, string> = {
  timeEstimates: 'You can only view here, and your workspace has not allowed you to set time estimates',
  timeTracking: 'You can only view here, and your workspace has not allowed you to track time',
  tags: 'You can only view here, and your workspace has not allowed you to add or remove tags',
  createViews: 'You can only view here, and your workspace has not allowed you to create views',
}

/** A member row's four switches, as one object. */
export function viewOnlyPermissionsOf(row: {
  viewOnlyTimeEstimates: boolean
  viewOnlyTimeTracking: boolean
  viewOnlyTags: boolean
  viewOnlyCreateViews: boolean
}): ViewOnlyPermissions {
  return {
    timeEstimates: row.viewOnlyTimeEstimates,
    timeTracking: row.viewOnlyTimeTracking,
    tags: row.viewOnlyTags,
    createViews: row.viewOnlyCreateViews,
  }
}

/** Whether this member of the workspace may do this where they only view; false for somebody who is no member. */
export async function viewOnlyMay(db: Db, workspaceId: string, userId: string, permission: ViewOnlyPermission): Promise<boolean> {
  const [row] = await db
    .select({
      viewOnlyTimeEstimates: workspaceMembers.viewOnlyTimeEstimates,
      viewOnlyTimeTracking: workspaceMembers.viewOnlyTimeTracking,
      viewOnlyTags: workspaceMembers.viewOnlyTags,
      viewOnlyCreateViews: workspaceMembers.viewOnlyCreateViews,
    })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return row ? viewOnlyPermissionsOf(row)[permission] : false
}

/**
 * A change of the switches as sent: only the four names, each true or false;
 * anything else is refused by the caller. Answers the columns to write.
 */
export function readViewOnlyChange(raw: unknown):
  | { ok: true; set: Partial<{ viewOnlyTimeEstimates: boolean; viewOnlyTimeTracking: boolean; viewOnlyTags: boolean; viewOnlyCreateViews: boolean }> }
  | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'Send the permissions to change, each true or false' }
  const set: Partial<{ viewOnlyTimeEstimates: boolean; viewOnlyTimeTracking: boolean; viewOnlyTags: boolean; viewOnlyCreateViews: boolean }> = {}
  const COLUMN = {
    timeEstimates: 'viewOnlyTimeEstimates',
    timeTracking: 'viewOnlyTimeTracking',
    tags: 'viewOnlyTags',
    createViews: 'viewOnlyCreateViews',
  } as const
  for (const [key, on] of Object.entries(raw as Record<string, unknown>)) {
    if (!(VIEW_ONLY_PERMISSIONS as readonly string[]).includes(key)) return { ok: false, reason: `Unknown view-only permission: ${key}` }
    if (typeof on !== 'boolean') return { ok: false, reason: `View-only permission ${key} must be true or false` }
    set[COLUMN[key as ViewOnlyPermission]] = on
  }
  if (Object.keys(set).length === 0) return { ok: false, reason: 'Send the permissions to change, each true or false' }
  return { ok: true, set }
}
