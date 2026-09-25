import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { lists, projects, spaces, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { readableList } from './read-access'
import { assertCanCreateInSpace } from './container-access'
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

/** The list's workspace, space, project and folder; null when there is no such list. */
async function listHome(db: Db, listId: string) {
  const [row] = await db
    .select({ workspaceId: spaces.workspaceId, spaceId: spaces.id, projectId: lists.projectId, folderId: projects.folderId })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .innerJoin(spaces, eq(spaces.id, projects.spaceId))
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
 *   - not a guest — 403, as before;
 *   - on a space that lets them add to it: Full edit
 *     (`assertCanCreateInSpace`, which `moveTask` already asks of a
 *     destination) — 403 in a space whose default is "view only",
 *     "comment" or "edit", as ClickUp's are (`found-25-sep/full-edit-enforced-nowhere`).
 * A super-admin passes where they are not a member, as every guard lets them.
 */
export async function assertCanCreateTaskIn(
  db: Db,
  listId: string,
  actorId: string,
): Promise<{ workspaceId: string; spaceId: string; projectId: string; folderId: string | null }> {
  const home = isUuid(listId) ? await listHome(db, listId) : null
  if (!home) throw new NotFoundException('List not found')
  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
  const list = await readableList(db, home.workspaceId, listId, { id: actorId, role: account?.role })
  if (!list) throw new NotFoundException('List not found')
  if (list.role === 'guest') throw new ForbiddenException('Guests cannot create tasks')
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
export async function canCreateTaskIn(db: Db, listId: string, actorId: string): Promise<boolean> {
  try {
    await assertCanCreateTaskIn(db, listId, actorId)
    return true
  } catch (err) {
    if (err instanceof HttpException) return false
    throw err
  }
}
