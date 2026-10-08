import { ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common'
import { and, eq, sql, type SQL } from 'drizzle-orm'
import { folders, lists, projects, spaces, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { READ_REFUSALS, readableList } from './read-access'
import { assertCanCreateInSpace } from './container-access'
import { isAdminRole } from './workspace-roles'
import { isUuid } from '../validation/uuid'

/*
 * MAY THIS PERSON MAKE A TASK IN THIS LIST — the create gate, stated once for
 * every service that makes one or hands out a way to. It lived in
 * `TasksService`, and a module `TasksService` itself depends on could not ask
 * it: the list's email address, which makes a task for whoever mails it, was
 * answered to every reader of the list, a guest with a view share included
 * (`found-25-sep/list-address-read-by-those-who-may-not-add`). As
 * `task-write.ts` states the write rule for services, this states the create
 * rule; `TasksService.assertCanCreateTaskIn` asks it.
 */

/*
 * WHAT HOLDS A LIST, IN THE TRASH (`found-6-oct/task-fallback-files-into-a-deleted-project`).
 * Deleting a project, a folder or a space puts it in the trash, and what it
 * holds with it, by its own `is_archived` alone: its lists' own flags stay as
 * they were. Only the list's own was asked, so with the workspace's starter
 * project deleted `/task` filed into its list (201) — while the space listed no
 * such project — `POST /tasks` into it answered 201 too, and the Default-list
 * picker still offered it. A list whose project, folder or space is in the
 * trash takes no task, as a list in the trash takes none.
 */
export type HeldIn = 'project' | 'folder' | 'space'

/** The trash state of what holds a list, for a select of lists joined to their project and space. The folder is the project's, if any. */
export const HOLDER_TRASH_COLUMNS = {
  projectInTrash: projects.isArchived,
  projectDeletedById: projects.archivedById,
  folderInTrash: sql<boolean>`coalesce((select ${folders.isArchived} from ${folders} where ${folders.id} = ${projects.folderId}), false)`,
  folderDeletedById: sql<string | null>`(select ${folders.archivedById} from ${folders} where ${folders.id} = ${projects.folderId})`,
  spaceInTrash: spaces.isArchived,
  spaceDeletedById: spaces.archivedById,
}

/** The nearest of a list's holders in the trash — its project, the project's folder, the space — and who put it there; null when none is. */
export function nearestHolderInTrash(row: {
  projectInTrash?: boolean | null
  projectDeletedById?: string | null
  folderInTrash?: boolean | null
  folderDeletedById?: string | null
  spaceInTrash?: boolean | null
  spaceDeletedById?: string | null
}): { where: HeldIn; deletedById: string | null } | null {
  if (row.projectInTrash) return { where: 'project', deletedById: row.projectDeletedById ?? null }
  if (row.folderInTrash) return { where: 'folder', deletedById: row.folderDeletedById ?? null }
  if (row.spaceInTrash) return { where: 'space', deletedById: row.spaceDeletedById ?? null }
  return null
}

/** For a select of lists joined to their project and space: none whose project, the project's folder or space is in the trash. */
export function holdersNotInTrash(): SQL {
  return and(
    eq(projects.isArchived, false),
    eq(spaces.isArchived, false),
    sql`not exists (select 1 from ${folders} where ${folders.id} = ${projects.folderId} and ${folders.isArchived})`,
  ) as SQL
}

/** Whether what holds the list is in the trash, the nearest first, and who put it there; null when nothing is, or there is no such list. */
export async function heldInTrash(db: Db, listId: string): Promise<{ where: HeldIn; deletedById: string | null } | null> {
  const [row] = await db
    .select(HOLDER_TRASH_COLUMNS)
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(eq(lists.id, listId))
    .limit(1)
  return row ? nearestHolderInTrash(row) : null
}

/** The list's workspace, space, project and folder, whether it is in the trash and who put it there, and what holds it in the trash; null when there is no such list. */
async function listHome(db: Db, listId: string) {
  const [row] = await db
    .select({
      workspaceId: spaces.workspaceId,
      spaceId: spaces.id,
      projectId: lists.projectId,
      folderId: projects.folderId,
      inTrash: lists.isArchived,
      deletedById: lists.archivedById,
      ...HOLDER_TRASH_COLUMNS,
    })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
    .where(eq(lists.id, listId))
    .limit(1)
  return row ?? null
}

/**
 * A LIST IN THE TRASH TAKES NO NEW TASK (`found-5-oct/default-list-files-into-an-archived-list`).
 *
 * Deleting a list puts it in the trash (`is_archived`), out of every list of
 * lists, its tasks with it, until it is restored or purged. Nothing here asked
 * it, so `POST /tasks` into a deleted list answered 201, and `/task`, a chat
 * message and the AI filed their tasks into a deleted Default list — where
 * nobody could find them, and where the purge would take them. A task in the
 * bin refuses a change the same way (`assertTaskNotInBin`, 409): the list is
 * really there, and it can be restored. The ways a task reaches a list without
 * `createTask` ask it too: a move (`moveTask`, and the bulk move through it), a
 * form's submission and the form's target (`FormsService`), mail to the list's
 * address (`EmailToTaskService`), and a hook's delivery (`InboundWebhooksService`).
 *
 * Its own class, so a caller choosing among lists (`defaultListFor`) can tell
 * this refusal from the ones it passes over.
 *
 * WHAT TO DO IS SAID BY THE TRASH'S OWN RULE: a workspace admin restores
 * anything in it, anybody else only what they deleted themselves
 * (`TrashService`; ClickUp, "Restore items from the Trash": "Members and guests
 * can only see and restore items they have deleted"). "Restore it from Trash"
 * was said to everybody, and a member whose list an admin had deleted found it
 * in no Trash of theirs, and was refused its restore (403 "You can only manage
 * items you deleted"). `mayRestore` says which they are (`mayRestoreList`).
 */
export const LIST_IN_TRASH_RESTORE = 'This list is in the trash. Restore it from Trash before adding tasks to it.'
export const LIST_IN_TRASH_ASK =
  'This list is in the trash. Ask a workspace admin, or whoever deleted it, to restore it before adding tasks to it.'

/** The same refusal when what is in the trash is what holds the list: its project, folder or space. */
export function heldInTrashWords(where: HeldIn, mayRestore: boolean): string {
  return mayRestore
    ? `This list's ${where} is in the trash. Restore the ${where} from Trash before adding tasks to the list.`
    : `This list's ${where} is in the trash. Ask a workspace admin, or whoever deleted the ${where}, to restore it before adding tasks to the list.`
}

export class ListInTrashException extends ConflictException {
  /** `heldIn`: what holds the list is in the trash, not the list itself (`HeldIn`). */
  constructor(readonly mayRestore: boolean = true, readonly heldIn: HeldIn | null = null) {
    super(heldIn ? heldInTrashWords(heldIn, mayRestore) : mayRestore ? LIST_IN_TRASH_RESTORE : LIST_IN_TRASH_ASK)
  }
}

/**
 * Whether this person may restore this list from the Trash, by the Trash's
 * rule (`TrashService.assertMayAct`): an admin of its workspace — a platform
 * admin among them, whose role the read rule answers as "super_admin" — or the
 * person who deleted it.
 */
export function mayRestoreList(role: string | null | undefined, deletedById: string | null | undefined, actorId: string): boolean {
  return isAdminRole(role) || (!!deletedById && deletedById === actorId)
}

/** Whether the list is in the trash, and who put it there; null when there is no such list. */
export async function listTrashState(db: Db, listId: string): Promise<{ inTrash: boolean; deletedById: string | null } | null> {
  const [row] = await db
    .select({ inTrash: lists.isArchived, deletedById: lists.archivedById })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1)
  return row ?? null
}

/**
 * MAY THIS PERSON MAKE A TASK IN THIS LIST — one answer, asked by
 * `createTask` itself, so every route that makes a task asks it.
 *
 * It was asked in pieces. `POST /tasks` had `ResourceMemberGuard`; the rest
 * reached `createTask`, which asked only `assertNotGuestInList`, and each
 * added what it thought of: the AI's plan executor asked membership, an
 * inbound webhook the container rule, the meeting items `readableList`, and
 * making a task from a chat message asked nothing about the list at all.
 * Measured: a member refused a private list made tasks in it from a chat
 * message and from an AI plan (201 each), and a user of ANOTHER organisation
 * made one in this workspace's list from a message of their own
 * (`found-24-sep/task-makers-skip-the-list-rule`).
 *
 * So, for the person the task is made by:
 *   - a member of the list's workspace, who may open the list (the container
 *     rule and the private-list rule, `readableList`) — else not found;
 *   - a list that is not in the trash — 409, saying so and what they may do
 *     about it (`ListInTrashException`) — unless the caller asks what the
 *     person may do with the list itself, not whether a task may go in now
 *     (`evenInTrash`: its email address, which is managed in the trash too);
 *   - holding Full edit where it goes (`assertCanCreateInSpace`, which
 *     `moveTask` already asks of a destination) — 403 in a space whose
 *     default is "view only", "comment" or "edit", as ClickUp's are
 *     (`found-25-sep/full-edit-enforced-nowhere`). A guest holds what is
 *     shared with them, on the list or above it, and adds a task where that
 *     is Full edit: every guest was refused first
 *     (`found-25-sep/guests-with-full-edit-make-no-tasks`), where ClickUp's
 *     Full edit "creates tasks and subtasks", a guest's included.
 * A platform super_admin is asked to be a MEMBER of the list's workspace
 * (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`): the read
 * rule lets them open every workspace's lists, so one with no member row made a
 * task there (201) that the write rule then refused them changing. ClickUp has
 * no platform-wide role; its own owners and admins work where they belong, and
 * a task is made by somebody of its workspace. So they are refused as the write
 * rule refuses them, 403 "You are not a member of this workspace", and read on
 * as before.
 */
export async function assertCanCreateTaskIn(
  db: Db,
  listId: string,
  actorId: string,
  opts: { evenInTrash?: boolean } = {},
): Promise<{ workspaceId: string; spaceId: string; projectId: string; folderId: string | null }> {
  const home = isUuid(listId) ? await listHome(db, listId) : null
  if (!home) throw new NotFoundException('List not found')
  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
  const list = await readableList(db, home.workspaceId, listId, { id: actorId, role: account?.role })
  if (!list) throw new NotFoundException('List not found')
  if (list.role === 'super_admin' && !(await isWorkspaceMember(db, home.workspaceId, actorId))) {
    throw new ForbiddenException(READ_REFUSALS.notMember)
  }
  // Asked of somebody who may open the list, so it tells nobody else it is there.
  // What holds it in the trash refuses as the list itself does; the list's own trash is said first (below).
  const held = home.inTrash ? null : nearestHolderInTrash(home)
  if (held && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, held.deletedById, actorId), held.where)
  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))
  await assertCanCreateInSpace(db, {
    spaceId: home.spaceId,
    actorId,
    kind: 'task',
    // What is shared of the way to it counts for a guest, as it does for a list (`WithinStep`).
    within: [
      { type: 'list', id: listId },
      { type: 'project', id: home.projectId },
      ...(home.folderId ? [{ type: 'folder' as const, id: home.folderId }] : []),
    ],
  })
  return home
}

/** `assertCanCreateTaskIn` as a yes or no, for a caller choosing among lists. A failure that is not a refusal is not a no. */
export async function canCreateTaskIn(db: Db, listId: string, actorId: string, opts: { evenInTrash?: boolean } = {}): Promise<boolean> {
  try {
    await assertCanCreateTaskIn(db, listId, actorId, opts)
    return true
  } catch (err) {
    if (err instanceof HttpException) return false
    throw err
  }
}

/** Whether `userId` has a member row in the workspace — a guest's included. */
async function isWorkspaceMember(db: Db, workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return !!row
}
