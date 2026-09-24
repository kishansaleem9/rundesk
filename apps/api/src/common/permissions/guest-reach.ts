import { and, eq, inArray, not, notInArray, or, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { folders, lists, objectShares, projectMembers, projects, spaceMembers, spaces, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'

/*
 * WHAT A GUEST READS: WHAT IS SHARED WITH THEM, AND THE WAY TO IT.
 *
 * The container rule treated a guest as a member, so every open space was
 * theirs to read — its projects, lists, tasks and docs, by id, in every
 * listing and in search (`found-24-sep/guests-read-every-open-space`). Goals
 * and sprints alone gave a guest nothing.
 *
 * ClickUp's rule (help.clickup.com "Use ClickUp as a guest or limited member",
 * "Share Spaces, Folders, Subfolders, Lists, and tasks"; search snippets): a
 * guest sees only what is shared with them, and what is inside a shared item
 * comes with it — a shared task's subtasks too. So, for a guest of a
 * workspace, two questions:
 *
 *   - REACH, what they read: everything under a grant on its space (a space
 *     membership, or a share of the space), its folder, or its project (a
 *     project membership, or a share of it); a list shared with them; a task
 *     shared with them, and its subtasks;
 *   - PATH, the way to it: the containers above anything in reach, listed so
 *     the tree can be walked to it — and nothing else inside them.
 *
 * Each predicate below is self-contained SQL over its own unaliased table: it
 * lets through every row unless its reader is a GUEST of the row's workspace,
 * and then only what the rule allows. So it goes into any query with that
 * table in scope, whoever the reader is, and the per-row checks ask the same
 * SQL of one row (`guestMayRead`), which keeps this the one statement of it.
 */

/** Workspaces this person is a guest of. */
const guestWorkspaces = (db: Db, actorId: string) =>
  db.select({ id: workspaceMembers.workspaceId }).from(workspaceMembers).where(and(eq(workspaceMembers.userId, actorId), eq(workspaceMembers.role, 'guest')))

/** Ids of one kind of thing shared with this person. */
const sharedIds = (db: Db, actorId: string, type: 'space' | 'folder' | 'project' | 'list' | 'task') =>
  db.select({ id: objectShares.objectId }).from(objectShares).where(and(eq(objectShares.userId, actorId), eq(objectShares.objectType, type)))

/** A grant on the space: a membership of it, or a share of it. `col` is a space id column. */
const spaceGranted = (db: Db, actorId: string, col: AnyPgColumn): SQL =>
  or(
    inArray(col, db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, actorId))),
    inArray(col, sharedIds(db, actorId, 'space')),
  )!

/** REACH for `projects`: a grant on its space, its folder, or itself. */
const projectReach = (db: Db, actorId: string) =>
  or(
    spaceGranted(db, actorId, projects.spaceId),
    inArray(projects.folderId, sharedIds(db, actorId, 'folder')),
    inArray(projects.id, db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, actorId))),
    inArray(projects.id, sharedIds(db, actorId, 'project')),
  )

/** Lists in reach: under a project in reach, or shared themselves. */
const listsInReach = (db: Db, actorId: string) =>
  db
    .select({ id: lists.id })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .where(or(projectReach(db, actorId), inArray(lists.id, sharedIds(db, actorId, 'list'))))

/** Tasks shared with this person, and the lists and projects they sit in (the way to them). */
const sharedTaskLists = (db: Db, actorId: string) =>
  db.select({ id: tasks.listId }).from(tasks).where(inArray(tasks.id, sharedIds(db, actorId, 'task')))

/** Projects the way to something in reach passes through: a shared list's, or a shared task's. */
const pathProjects = (db: Db, actorId: string) =>
  db
    .select({ id: lists.projectId })
    .from(lists)
    .where(or(inArray(lists.id, sharedIds(db, actorId, 'list')), inArray(lists.id, sharedTaskLists(db, actorId))))

/** Spaces the way passes through: those of a shared folder, of a project in reach or on the way. */
const pathSpaces = (db: Db, actorId: string) =>
  db
    .select({ id: projects.spaceId })
    .from(projects)
    .where(or(projectReach(db, actorId), inArray(projects.id, pathProjects(db, actorId))))

/** `spaces` a guest may see: granted, or on the way to something in reach. Every space of a workspace they are not a guest of. */
export function guestSpaceFilter(db: Db, actorId: string): SQL | undefined {
  return or(
    notInArray(spaces.workspaceId, guestWorkspaces(db, actorId)),
    spaceGranted(db, actorId, spaces.id),
    inArray(spaces.id, db.select({ id: folders.spaceId }).from(folders).where(inArray(folders.id, sharedIds(db, actorId, 'folder')))),
    inArray(spaces.id, pathSpaces(db, actorId)),
  )
}

/** `folders` a guest may see: in a granted space, shared, or holding a project on the way. */
export function guestFolderFilter(db: Db, actorId: string): SQL | undefined {
  const guestSpaces = db.select({ id: spaces.id }).from(spaces).where(inArray(spaces.workspaceId, guestWorkspaces(db, actorId)))
  return or(
    notInArray(folders.spaceId, guestSpaces),
    spaceGranted(db, actorId, folders.spaceId),
    inArray(folders.id, sharedIds(db, actorId, 'folder')),
    inArray(folders.id, db.select({ id: projects.folderId }).from(projects).where(or(projectReach(db, actorId), inArray(projects.id, pathProjects(db, actorId))))),
  )
}

/** `projects` a guest may see: in reach, or on the way to a list or task in reach. */
export function guestProjectFilter(db: Db, actorId: string): SQL | undefined {
  const guestSpaces = db.select({ id: spaces.id }).from(spaces).where(inArray(spaces.workspaceId, guestWorkspaces(db, actorId)))
  return or(notInArray(projects.spaceId, guestSpaces), projectReach(db, actorId), inArray(projects.id, pathProjects(db, actorId)))
}

/** Projects of the workspaces this person is a guest of. */
const guestProjects = (db: Db, actorId: string) =>
  db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(inArray(spaces.workspaceId, guestWorkspaces(db, actorId)))

/** `lists` a guest may see: in reach, or holding a task shared with them. */
export function guestListFilter(db: Db, actorId: string): SQL | undefined {
  return or(notInArray(lists.projectId, guestProjects(db, actorId)), inArray(lists.id, listsInReach(db, actorId)), inArray(lists.id, sharedTaskLists(db, actorId)))
}

/**
 * Whether the whole of a list is a guest's — in reach, not only on the way to
 * a task shared with them. What carries every task of a list (its realtime
 * room) asks this; a listing of its tasks filters them instead.
 */
export async function guestReachesList(db: Db, actorId: string, listId: string): Promise<boolean> {
  const rows = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), or(notInArray(lists.projectId, guestProjects(db, actorId)), inArray(lists.id, listsInReach(db, actorId)))))
    .limit(1)
  return rows.length > 0
}

/** `tasks` a guest may READ: in a list in reach, shared with them, or a subtask of one that is. */
export function guestTaskFilter(db: Db, actorId: string): SQL | undefined {
  const guestLists = db
    .select({ id: lists.id })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(inArray(spaces.workspaceId, guestWorkspaces(db, actorId)))
  return or(
    notInArray(tasks.listId, guestLists),
    inArray(tasks.listId, listsInReach(db, actorId)),
    inArray(tasks.id, sharedIds(db, actorId, 'task')),
    inArray(tasks.parentTaskId, sharedIds(db, actorId, 'task')),
  )
}

/**
 * The same rule for ONE row, for a check that has an id rather than a query:
 * a space, folder, project or list may be SEEN on the way to what is in reach;
 * a task is read only in reach. Whoever is not a guest of the row's workspace
 * passes, as in the filters.
 */
export async function guestMayRead(db: Db, actorId: string, kind: 'space' | 'folder' | 'project' | 'list' | 'task', id: string): Promise<boolean> {
  const one = async (q: Promise<Array<{ id: string }>>) => (await q).length > 0
  switch (kind) {
    case 'space':
      return one(db.select({ id: spaces.id }).from(spaces).where(and(eq(spaces.id, id), guestSpaceFilter(db, actorId))).limit(1))
    case 'folder':
      return one(db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, id), guestFolderFilter(db, actorId))).limit(1))
    case 'project':
      return one(db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), guestProjectFilter(db, actorId))).limit(1))
    case 'list':
      return one(db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, id), guestListFilter(db, actorId))).limit(1))
    case 'task':
      return one(db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, id), guestTaskFilter(db, actorId))).limit(1))
  }
}

/** Every space of this workspace a guest holds no grant on: what the doc rule treats as refused. Empty for anybody else. */
export async function spacesRefusedToGuest(db: Db, workspaceId: string, actorId: string): Promise<string[] | null> {
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorId)))
    .limit(1)
  if (membership?.role !== 'guest') return null
  const rows = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.workspaceId, workspaceId), not(spaceGranted(db, actorId, spaces.id))))
  return rows.map((r) => r.id)
}
