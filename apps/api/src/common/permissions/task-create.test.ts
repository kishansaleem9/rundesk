import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { assertCanCreateTaskIn, canCreateTaskIn, heldInTrashWords, LIST_IN_TRASH_ASK, LIST_IN_TRASH_RESTORE, ListInTrashException } from './task-create'

/*
 * A LIST IN THE TRASH TAKES NO NEW TASK
 * (`found-5-oct/default-list-files-into-an-archived-list`). The create gate
 * asked a list its workspace, the read rule and the space's level, and never
 * whether it had been deleted, so `POST /tasks` into a deleted list answered
 * 201. A queued Drizzle stand-in answers the selects in the order the gate
 * asks them: the list's home, the account, the read rule's own, the space's level.
 */
function makeDb(results: unknown[][]) {
  const queue = [...results]
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
    return p
  }
  return { select: () => node(queue.shift() ?? []), left: () => queue.length } as any
}

const LIST = '11111111-1111-4111-8111-111111111111'
/** The list's home; `deletedById`, who put it in the trash — the member 'm' by default. */
const home = (inTrash: boolean, deletedById: string | null = 'm') => [{ workspaceId: 'w1', spaceId: 's1', projectId: 'p1', folderId: null, inTrash, deletedById }]
/** The read rule's row for the list: open, in an open space and project. */
const OPEN_LIST = { listId: LIST, listVisibility: 'public', listCreatedById: 'maker', projectId: 'p1', projectVisibility: 'public', spaceId: 's1', spaceVisibility: 'public' }
/** The same list, made private by somebody else. */
const PRIVATE_LIST = { ...OPEN_LIST, listVisibility: 'private' }
/** A member's read of it: their workspace role, then the project's folder (none). */
const MEMBER_READS = [[{ role: 'member' }], []]
/** The space's level, Full edit: its row, the membership, no share or grant below it, none on it. */
const FULL_EDIT = [[{ workspaceId: 'w1', defaultPermission: 'admin' }], [{ role: 'member' }], [], [], [], []]

describe('assertCanCreateTaskIn — a list in the trash', () => {
  it('refuses a task in a list in the trash, 409, saying so, to somebody who may open it', async () => {
    const db = makeDb([home(true), [{ role: 'member' }], [OPEN_LIST], ...MEMBER_READS])
    await assert.rejects(
      () => assertCanCreateTaskIn(db, LIST, 'm'),
      (e: unknown) =>
        e instanceof ListInTrashException && e instanceof ConflictException &&
        /^This list is in the trash\. /.test(e.message),
    )
    assert.equal(db.left(), 0, 'and refuses it before the space’s level is asked')
  })

  it('tells somebody who may not open it nothing of the trash: the list is not found, as before', async () => {
    const db = makeDb([home(true), [{ role: 'member' }], [PRIVATE_LIST], ...MEMBER_READS])
    await assert.rejects(() => assertCanCreateTaskIn(db, LIST, 'm'), (e: unknown) => e instanceof NotFoundException && e.message === 'List not found')
  })

  it('lets a task into the same list when it is not in the trash', async () => {
    const db = makeDb([home(false), [{ role: 'member' }], [OPEN_LIST], ...MEMBER_READS, ...FULL_EDIT])
    const at = await assertCanCreateTaskIn(db, LIST, 'm')
    assert.equal(at.workspaceId, 'w1')
    assert.equal(db.left(), 0)
  })

  it('answers no for a list in the trash, as a yes-or-no', async () => {
    assert.equal(await canCreateTaskIn(makeDb([home(true), [{ role: 'member' }], [OPEN_LIST], ...MEMBER_READS]), LIST, 'm'), false)
  })
})

/*
 * WHAT TO DO IS SAID BY THE TRASH'S OWN RULE: an admin restores anything in it,
 * anybody else only what they deleted (ClickUp: "Members and guests can only see
 * and restore items they have deleted"). "Restore it from Trash" was said to
 * everybody, and a member whose list an admin had deleted could not.
 */
describe('assertCanCreateTaskIn — what the refusal tells each person to do', () => {
  const refusedWith = (words: string, mayRestore: boolean) => (e: unknown) =>
    e instanceof ListInTrashException && e.message === words && e.mayRestore === mayRestore

  it('tells the member who deleted it to restore it from Trash', async () => {
    const db = makeDb([home(true, 'm'), [{ role: 'member' }], [OPEN_LIST], ...MEMBER_READS])
    await assert.rejects(() => assertCanCreateTaskIn(db, LIST, 'm'), refusedWith(LIST_IN_TRASH_RESTORE, true))
  })

  it('tells a member who did not delete it to ask an admin, or whoever did, to restore it — the Trash refuses them its restore', async () => {
    const db = makeDb([home(true, 'the-admin'), [{ role: 'member' }], [OPEN_LIST], ...MEMBER_READS])
    await assert.rejects(() => assertCanCreateTaskIn(db, LIST, 'm'), refusedWith(LIST_IN_TRASH_ASK, false))
  })

  it('tells a workspace admin to restore it, whoever deleted it', async () => {
    const db = makeDb([home(true, 'somebody-else'), [{ role: 'member' }], [OPEN_LIST], [{ role: 'workspace_admin' }], []])
    await assert.rejects(() => assertCanCreateTaskIn(db, LIST, 'the-admin'), refusedWith(LIST_IN_TRASH_RESTORE, true))
  })

  it('asks nothing of the trash of a caller asking what the person may do with the list itself (its address): evenInTrash', async () => {
    const db = makeDb([home(true, 'somebody-else'), [{ role: 'member' }], [OPEN_LIST], ...MEMBER_READS, ...FULL_EDIT])
    assert.equal(await canCreateTaskIn(db, LIST, 'm', { evenInTrash: true }), true)
    assert.equal(db.left(), 0, 'and still asks the space’s level')
  })
})

/*
 * NOR ONE WHOSE PROJECT, FOLDER OR SPACE IS IN THE TRASH
 * (`found-6-oct/task-fallback-files-into-a-deleted-project`): deleting what
 * holds a list leaves the list's own flag as it was, and only that was asked.
 */
describe('assertCanCreateTaskIn — what holds the list, in the trash', () => {
  const held = (where: 'project' | 'folder' | 'space', deletedById = 'm') => [{ ...home(false)[0], [`${where}InTrash`]: true, [`${where}DeletedById`]: deletedById }]

  it('refuses a task in a list whose project, folder or space is in the trash, 409, naming it and what to do — and tells a member who did not delete it to ask', async () => {
    for (const where of ['project', 'folder', 'space'] as const) {
      const db = makeDb([held(where), [{ role: 'member' }], [OPEN_LIST], ...MEMBER_READS])
      await assert.rejects(
        () => assertCanCreateTaskIn(db, LIST, 'm'),
        (e: unknown) => e instanceof ListInTrashException && e.heldIn === where && (e as Error).message === heldInTrashWords(where, true),
        `the ${where} in the trash`,
      )
    }
    const db = makeDb([held('project', 'the-admin'), [{ role: 'member' }], [OPEN_LIST], ...MEMBER_READS])
    await assert.rejects(
      () => assertCanCreateTaskIn(db, LIST, 'm'),
      (e: unknown) => e instanceof ListInTrashException && (e as Error).message === heldInTrashWords('project', false),
    )
  })
})

/*
 * A PLATFORM ADMIN MAKES A TASK ONLY WHERE THEY ARE A MEMBER
 * (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`). The read
 * rule lets a platform super_admin open every workspace's lists, so one with
 * no member row made a task there that the write rule then refused them
 * changing. The gate asks the membership after the read rule, in the write
 * rule's words.
 */
describe('assertCanCreateTaskIn — a platform admin outside the workspace', () => {
  it('refuses a platform super_admin who is no member of the list’s workspace, 403 “You are not a member of this workspace”', async () => {
    const db = makeDb([home(false), [{ role: 'super_admin' }], [OPEN_LIST], []])
    await assert.rejects(
      () => assertCanCreateTaskIn(db, LIST, 'sa'),
      (e: unknown) => e instanceof ForbiddenException && e.message === 'You are not a member of this workspace',
    )
    assert.equal(db.left(), 0, 'and asks nothing after the membership')
  })
})
