import { and, eq, inArray, sql } from 'drizzle-orm'
import { labels, projects, spaces, taskLabelAssignments } from '@rundesk/db'
import type { Db } from '@rundesk/db'

/** What an import run has made so far — what `undoRun` takes away if it fails. */
export type RunMade = { spaceId?: string; projectId?: string; labelIds: string[] }

/**
 * WHAT A RUN THAT FAILED MADE, TAKEN AWAY AGAIN: its project — and with it
 * every list, status and task in it, by the foreign keys' cascade — its
 * space when it made one, and the tags it made that label nothing once
 * those are gone. A merge it wrote into a task that was already there
 * stays: that task is not the run's to remove. `null` when all of it went,
 * or the sentence the job's error carries when some could not.
 *
 * Both imports' (`found-5-oct/xlsx-read-as-text` for the spreadsheet's;
 * `found-6-oct/clickup-import-leaves-a-failed-run-behind` for ClickUp's, whose
 * failed run left its space, project, list and tasks).
 */
export async function undoRun(db: Db, made: RunMade): Promise<string | null> {
  try {
    if (made.projectId) await db.delete(projects).where(eq(projects.id, made.projectId))
    if (made.spaceId) await db.delete(spaces).where(eq(spaces.id, made.spaceId))
    if (made.labelIds.length > 0) {
      await db
        .delete(labels)
        .where(
          and(
            inArray(labels.id, made.labelIds),
            sql`not exists (select 1 from ${taskLabelAssignments} where ${taskLabelAssignments.labelId} = ${labels.id})`,
          ),
        )
    }
    return null
  } catch (e: any) {
    return `What it made could not all be removed: ${e?.message ?? 'unknown error'}`
  }
}
