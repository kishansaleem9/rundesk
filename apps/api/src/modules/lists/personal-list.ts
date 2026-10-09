import { and, asc, eq } from 'drizzle-orm'
import { lists, personalTasks, projects, spaces, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { categoryForDefaultKey, seedListStatuses } from './list-statuses.defaults'

/**
 * EVERYBODY'S PERSONAL LIST (`found-24-sep/planner-default-list-read-by-nothing`).
 *
 * ClickUp: "Your Personal List is the default location for new tasks" — a task
 * made with no location lands there — a list private to the person, under My
 * Tasks in Home, "not part of the Workspace hierarchy" and not visible to
 * other members (help centre, "Use Personal List" and "Create and add tasks to
 * your Personal List", through search excerpts, 9 October). A task moved into
 * it takes its sharing.
 *
 * Here it is a list like any other, so a task in it is opened, edited,
 * commented on and moved by the same routes and rules as any task: one a
 * person a workspace (`lists.personal_of`), in the container of the
 * workspace's personal space (`spaces.is_personal`), which no navigation
 * shows. It is its owner's alone — `canSeePrivateItem` and the read filters
 * pass it over for everybody else, managers included.
 *
 * A guest has none: a guest makes no tasks of their own here.
 */
export const PERSONAL_SPACE_NAME = 'Personal'
export const PERSONAL_LIST_NAME = 'Personal List'

export type PersonalList = { id: string; spaceId: string; projectId: string }

/** The workspace's personal space, made the first time anybody's Personal List is. */
async function personalSpaceOf(db: Db, workspaceId: string): Promise<string> {
  const find = () =>
    db.select({ id: spaces.id }).from(spaces).where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, true))).limit(1)
  const [had] = await find()
  if (had) return had.id
  // Full edit for whoever reaches a list in it, and a list in it is reached by its owner alone.
  const [made] = await db
    .insert(spaces)
    .values({ workspaceId, name: PERSONAL_SPACE_NAME, isPersonal: true, visibility: 'public', defaultPermission: 'admin' })
    .onConflictDoNothing()
    .returning({ id: spaces.id })
  if (made) return made.id
  // Two first Personal Lists at once: the partial unique index lets one space in, and the other reads it.
  const [won] = await find()
  if (!won) throw new Error('the personal space could not be made')
  return won.id
}

/** The personal space's container project — the one a list made under a space lives in (`defaultContainerForSpace`). */
async function containerOf(db: Db, spaceId: string): Promise<string> {
  const find = () =>
    db.select({ id: projects.id }).from(projects).where(and(eq(projects.spaceId, spaceId), eq(projects.isDefaultContainer, true))).limit(1)
  const [had] = await find()
  if (had) return had.id
  const [made] = await db
    .insert(projects)
    .values({ spaceId, name: 'Lists', isDefaultContainer: true })
    .onConflictDoNothing()
    .returning({ id: projects.id })
  if (made) return made.id
  const [won] = await find()
  if (!won) throw new Error('the personal space has no container')
  return won.id
}

/**
 * The to-dos Home kept for the person before this list existed (`personal_tasks`),
 * moved into it as its first tasks — done ones done — so nothing written there
 * is lost when Home's Personal List becomes this list.
 */
async function moveHomeTodos(db: Db, workspaceId: string, userId: string, listId: string): Promise<void> {
  const todos = await db
    .select()
    .from(personalTasks)
    .where(and(eq(personalTasks.workspaceId, workspaceId), eq(personalTasks.userId, userId)))
    .orderBy(asc(personalTasks.position), asc(personalTasks.createdAt))
  if (todos.length === 0) return
  await db.insert(tasks).values(
    todos.map((t, i) => {
      const status = t.done ? 'done' : 'todo'
      return {
        listId,
        title: t.title,
        status,
        statusCategory: categoryForDefaultKey(status),
        position: i,
        createdById: userId,
        createdAt: t.createdAt,
        ...(t.done ? { completedAt: t.updatedAt } : {}),
      }
    }),
  )
  await db.delete(personalTasks).where(and(eq(personalTasks.workspaceId, workspaceId), eq(personalTasks.userId, userId)))
}

/**
 * The person's Personal List in this workspace, made the first time it is
 * asked for; null for a guest, or somebody who is no member, who have none.
 */
export async function ensurePersonalList(db: Db, workspaceId: string, userId: string): Promise<PersonalList | null> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  if (!member || member.role === 'guest') return null
  const spaceId = await personalSpaceOf(db, workspaceId)
  const projectId = await containerOf(db, spaceId)
  const find = () =>
    db.select({ id: lists.id }).from(lists).where(and(eq(lists.projectId, projectId), eq(lists.personalOf, userId))).limit(1)
  const [had] = await find()
  if (had) return { id: had.id, spaceId, projectId }
  return db.transaction(async (tx) => {
    const [made] = await tx
      .insert(lists)
      .values({ projectId, spaceId, name: PERSONAL_LIST_NAME, visibility: 'private', createdById: userId, personalOf: userId })
      .onConflictDoNothing()
      .returning({ id: lists.id })
    if (!made) {
      // Asked twice at once: the other made it, and moved the to-dos with it.
      const [won] = await tx.select({ id: lists.id }).from(lists).where(and(eq(lists.projectId, projectId), eq(lists.personalOf, userId))).limit(1)
      if (!won) throw new Error('the Personal List could not be made')
      return { id: won.id, spaceId, projectId }
    }
    await seedListStatuses(tx, made.id)
    await moveHomeTodos(tx as unknown as Db, workspaceId, userId, made.id)
    return { id: made.id, spaceId, projectId }
  })
}

/** Whether a list is somebody's Personal List: theirs to use, and nobody's to rename, move or delete. */
export async function personalOwnerOf(db: Db, listId: string): Promise<string | null> {
  const [row] = await db.select({ personalOf: lists.personalOf }).from(lists).where(eq(lists.id, listId)).limit(1)
  return row?.personalOf ?? null
}
