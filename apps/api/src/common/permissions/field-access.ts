import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { lists, projects, spaces, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { readableList, type ReadActor } from './read-access'
import { assertSpaceLevel, type WithinStep } from './space-default-permission'
import { isUuid } from '../validation/uuid'

/*
 * IS THIS A LIST OF THE PROJECT? A field belongs to a project and, when it is
 * scoped, to one of the project's own lists: ClickUp adds a field "to the
 * Hierarchy location where the view or task is located" (help centre, "Create
 * Custom Fields", read through search excerpts). The `listId` a definition was
 * sent was stored and asked of the rule below as sent, so an admin defined a
 * field in one project scoped to a list of another (201, a field no task can
 * have), and a member refused fields in a view-only space defined one there by
 * naming a list of another space shared with them to edit (201)
 * (`found-30-sep/field-definition-takes-a-foreign-list`).
 *
 * A STRING, or no list. `isUuid` tests the text of what it is handed, and
 * `["<a list's id>"]` reads as that id: the query matched, the rule took the
 * array as its list step, and the shares, matched by id, never matched it — so
 * a member shared a list to view, in a space they may edit, defined a field
 * scoped to it by sending its id in brackets (201, measured on lane 7).
 */
export async function listOfProject(db: Db, projectId: string, listId: unknown): Promise<boolean> {
  if (typeof listId !== 'string' || !isUuid(listId)) return false
  const [row] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.projectId, projectId)))
    .limit(1)
  return !!row
}

/*
 * A FIELD SCOPED TO A LIST IS READ WITH ITS LIST: a list of fields, as a
 * reader may have it, leaves out each field whose list they may not open (the
 * read rule, `readableList`). A field with no list is its project's, which the
 * caller of this has already asked. A project's field list and search's field
 * filter named a private list's field ("Private stage") to a member that list
 * refuses (403 "This list is private"), measured on lane 7
 * (`found-6-oct/field-lists-name-a-private-lists-fields`). ClickUp makes a List
 * private "so only certain people can access them" (help centre, "Make Spaces,
 * Folders, Subfolders, Lists, and tasks private", read through search
 * excerpts). Each list is asked once.
 */
export async function fieldsOnReadableLists<F extends { listId?: string | null }>(
  db: Db,
  workspaceId: string,
  fields: F[],
  reader: ReadActor,
): Promise<F[]> {
  const scopedTo = [...new Set(fields.map((f) => f.listId).filter((id): id is string => typeof id === 'string'))]
  const open = new Set<string>()
  for (const listId of scopedTo) {
    if (await readableList(db, workspaceId, listId, reader)) open.add(listId)
  }
  return fields.filter((f) => f.listId == null || open.has(f.listId))
}

/*
 * WHO MAY DEFINE, RENAME OR DELETE A PROJECT'S FIELDS — somebody who may
 * change the project, or for a field scoped to one of its lists that list, and
 * not a guest (`found-25-sep/field-values-written-by-readers`).
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
  /*
   * The list a field is scoped to is the most specific step, so a share on it
   * decides — when it is one of this project's lists. A list of another
   * project is no step on the way to this one: it is left out, as a list that
   * is not there, and the project's own answer stands. `createDefinition`
   * refuses such a list to whoever this rule lets through.
   *
   * Asked of a field being renamed or deleted as of one being made: the list
   * it is scoped to is where it is (`updateDefinition`, `deleteDefinition`).
   * Those asked without it, measured on lane 7: a member shared a list to view,
   * in a space they may edit, renamed and deleted a field scoped to it, its
   * values with it (200); one shared a view-only space's list to edit made a
   * field scoped to it (201) and could not rename it (403, the space's reason).
   * ClickUp: "When there are conflicting permissions for the same location,
   * permissions set on the most specific level of the Hierarchy are applied",
   * and "permissions on Lists override Subfolders and Folders" (help centre,
   * "Set permissions on individual locations", read through search excerpts).
   */
  const ownList = listId != null && (await listOfProject(db, projectId, listId)) ? listId : null
  /*
   * A PRIVATE LIST IS ITS OWN PEOPLE'S, its fields with it: one the caller may
   * not open (`readableList`, the read rule) is refused in its own words, as
   * every route refuses it. A member refused a private list defined a field
   * scoped to it (201), and renamed and deleted the admin's, its values with
   * it (200, measured on lane 7). ClickUp makes a List private "so only
   * certain people can access them" (help centre, "Make Spaces, Folders,
   * Subfolders, Lists, and tasks private", read through search excerpts).
   */
  if (ownList && !(await readableList(db, workspaceId, ownList, reader))) {
    throw new ForbiddenException('This list is private')
  }
  const within: WithinStep[] = [
    ...(ownList ? [{ type: 'list' as const, id: ownList }] : []),
    { type: 'project', id: projectId },
    ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : []),
  ]
  await assertSpaceLevel(db, { spaceId: row.spaceId, actorId: reader.id, required: 'edit', kind: 'custom fields', within })
}
