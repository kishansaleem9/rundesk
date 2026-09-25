import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { projects, spaces, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { ReadActor } from './read-access'
import { assertSpaceLevel, type WithinStep } from './space-default-permission'

/*
 * WHO MAY DEFINE, RENAME OR DELETE A PROJECT'S FIELDS — somebody who may
 * change the project, and not a guest (`found-25-sep/field-values-written-by-readers`).
 * Opening the project was enough: measured on lane 5, a member in a view-only
 * space defined a field from a task there (201), and so did a guest with only
 * a view share on one; deleting a field takes every task's value in it.
 * ClickUp (help centre, "Custom Field permissions", search snippets): guests
 * with edit change fields' values and create none; a field belongs to its
 * location, and changing a location asks "edit" of it.
 *
 * Stated here rather than in `CustomFieldsService` so the list page's answer
 * (`TasksService.listCapabilities`) asks the rule the field routes ask
 * (`found-25-sep/list-page-offers-refused-edits`), as `status-access.ts` is
 * asked by the status routes and by the project page's answer.
 */
export async function assertMayDefineFields(
  db: Db,
  params: { workspaceId: string; projectId: string; reader: ReadActor; listId?: string | null },
): Promise<void> {
  const { workspaceId, projectId, reader, listId } = params
  if (reader.role === 'super_admin') return
  const [row] = await db
    .select({ role: workspaceMembers.role, spaceId: projects.spaceId, folderId: projects.folderId })
    .from(projects)
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, spaces.workspaceId), eq(workspaceMembers.userId, reader.id)))
    .where(and(eq(projects.id, projectId), eq(spaces.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw new NotFoundException('Project not found in this workspace')
  if (row.role === 'guest') throw new ForbiddenException('Guests cannot define custom fields')
  const within: WithinStep[] = [
    ...(listId ? [{ type: 'list' as const, id: listId }] : []),
    { type: 'project', id: projectId },
    ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : []),
  ]
  await assertSpaceLevel(db, { spaceId: row.spaceId, actorId: reader.id, required: 'edit', kind: 'custom fields', within })
}
