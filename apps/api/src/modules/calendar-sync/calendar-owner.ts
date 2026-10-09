import { and, eq } from 'drizzle-orm'
import { users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { readableTask } from '../../common/permissions/read-access'

/**
 * WHETHER THE PERSON WHOSE CALENDAR THIS IS MAY OPEN THIS TASK NOW: still a
 * member of the task's workspace — the iCal feed's rule, asked of a platform
 * admin too, whom the read rule lets through wherever they are — and let in by
 * the task read rule (`readableTask`), asked with their account's role as every
 * read asks it. Nobody (a connection whose owner's account is gone) may open
 * nothing.
 *
 * The one statement of it, for the workspace's connections
 * (`CalendarSyncService.ownerMayRead`, which a task's Google Meet and Zoom ask)
 * and a person's syncs (`CalendarSyncRulesService`), which ask it of every task
 * at every push: a calendar takes what its owner may open, and nothing once
 * they have left (`found-5-oct/calendar-push-ignores-who-may-read`).
 */
export async function calendarOwnerMayRead(
  db: Db,
  ownerId: string | null,
  task: { id: string; workspaceId: string },
): Promise<boolean> {
  if (!ownerId) return false
  const [member] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, task.workspaceId), eq(workspaceMembers.userId, ownerId)))
    .limit(1)
  if (!member) return false
  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, ownerId)).limit(1)
  return (await readableTask(db, task.workspaceId, task.id, { id: ownerId, role: account?.role })) !== null
}
