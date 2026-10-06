import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  GUESTS_CANNOT_IMPORT,
  MAY_NOT_OPEN,
  assertMayImport,
  assertMayLinkSubtask,
  assertMayMerge,
  enrichmentRefusals,
  mergeLevel,
  writtenFields,
} from './import-access'

/*
 * WHO MAY IMPORT, AND WHAT A MERGE ASKS OF THE TASK IT WRITES (`import-access.ts`).
 * The membership lookup is answered by a stand-in; which tasks an import may match is
 * the read rule's, measured against Postgres in the `imports` suite.
 */
const WS = '11111111-1111-4111-8111-111111111111'
const ACTOR = '44444444-4444-4444-8444-444444444444'

function memberAs(rows: unknown[]) {
  const node = (r: unknown[]) => {
    const p = Promise.resolve(r) as any
    for (const v of ['from', 'where', 'limit']) p[v] = () => p
    return p
  }
  return { select: () => node(rows) } as any
}

describe('assertMayImport (found-6-oct/a-guest-who-may-import-makes-a-space)', () => {
  it('a guest is refused 403 “Guests cannot import data into a workspace”, whatever a custom role grants them', async () => {
    await assert.rejects(
      () => assertMayImport(memberAs([{ role: 'guest' }]), { workspaceId: WS, actorId: ACTOR }),
      (e: unknown) => e instanceof ForbiddenException && e.message === GUESTS_CANNOT_IMPORT,
    )
    assert.equal(GUESTS_CANNOT_IMPORT, 'Guests cannot import data into a workspace')
  })

  it('a member, a manager and an admin are not refused by it, nor a platform admin who is no member', async () => {
    for (const rows of [[{ role: 'member' }], [{ role: 'manager' }], [{ role: 'workspace_admin' }], []]) {
      await assertMayImport(memberAs(rows), { workspaceId: WS, actorId: ACTOR })
    }
  })
})

describe('mergeLevel (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)', () => {
  it('a merge of status alone, or of status and assignees, asks the comment level, as PATCH and the assignee routes ask it', () => {
    assert.equal(mergeLevel(['status', 'statusCategory']), 'comment')
    assert.equal(mergeLevel(['status', 'assignees']), 'comment')
    assert.equal(mergeLevel(['assignees']), 'comment')
    assert.equal(mergeLevel([]), 'comment')
  })

  it('any other field it writes — a description, a priority, a date, a tag, a custom value — asks edit', () => {
    for (const field of ['description', 'priority', 'dueDate', 'startDate', 'tags', 'customFields']) {
      assert.equal(mergeLevel(['status', field]), 'edit', field)
      assert.equal(mergeLevel([field]), 'edit', field)
    }
  })
})

describe('writtenFields', () => {
  it('names the columns a merge writes, and not a key whose value is undefined, which the update leaves out', () => {
    assert.deepEqual(writtenFields({ description: undefined, status: 'done', dueDate: undefined }), ['status'])
    assert.deepEqual(writtenFields({ description: '', priority: 'low' }), ['description', 'priority'])
    assert.deepEqual(writtenFields({}), [])
  })
})

/** The write rule, answered for a test: what it was asked, in order; `refuse` names a task it refuses, with the error. */
function writeRule(refuse: Record<string, Error> = {}) {
  const asked: Array<{ taskId: string; actorId: string; level: string | undefined }> = []
  const writable = async (_db: unknown, taskId: string, actorId: string, opts: { level?: 'comment' | 'edit' | 'full' | 'subtask' } = {}) => {
    asked.push({ taskId, actorId, level: opts.level })
    if (refuse[taskId]) throw refuse[taskId]
    return {} as any
  }
  return { writable, asked }
}

describe('assertMayMerge (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)', () => {
  it('asks the write rule of the task it merges into at the level of what it writes: comment for a status, edit for anything else', async () => {
    const { writable, asked } = writeRule()
    await assertMayMerge({} as any, { taskId: 'task-1', actorId: ACTOR, fields: ['status', 'statusCategory'] }, writable)
    await assertMayMerge({} as any, { taskId: 'task-2', actorId: ACTOR, fields: ['priority'] }, writable)
    await assertMayMerge({} as any, { taskId: 'task-3', actorId: ACTOR, fields: ['status', 'description'] }, writable)
    assert.deepEqual(asked, [
      { taskId: 'task-1', actorId: ACTOR, level: 'comment' },
      { taskId: 'task-2', actorId: ACTOR, level: 'edit' },
      { taskId: 'task-3', actorId: ACTOR, level: 'edit' },
    ])
  })
})

/**
 * A database stand-in for the link rule's two reads, in order: the parent's own parent, then
 * whether the child has a subtask.
 */
function linkDb(parentOfParent: string | null, childHasSubtask: boolean) {
  const answers = [[{ parentTaskId: parentOfParent }], childHasSubtask ? [{ id: 'its-subtask' }] : []]
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit']) p[v] = () => p
    return p
  }
  return { select: () => node(answers.shift() ?? []) } as any
}

describe('assertMayLinkSubtask (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)', () => {
  it('asks edit of a child that was already there and Full edit of a parent that was already there — no level of a task the run made — and a refusal is the rule’s', async () => {
    const cases: Array<[boolean, boolean, Array<[string, string]>]> = [
      [true, false, [['child', 'edit']]],
      // Full edit, asked as adding a subtask, whose refusal says so (`found-6-oct/adding-a-subtask-is-refused-as-deleting`).
      [false, true, [['parent', 'subtask']]],
      [true, true, [['child', 'edit'], ['parent', 'subtask']]],
      [false, false, []],
    ]
    for (const [childWasThere, parentWasThere, expected] of cases) {
      const { writable, asked } = writeRule()
      await assertMayLinkSubtask(linkDb(null, false), { childId: 'child', parentId: 'parent', actorId: ACTOR, childWasThere, parentWasThere }, writable)
      assert.deepEqual(asked.map((a) => [a.taskId, a.level]), expected, `child there ${childWasThere}, parent there ${parentWasThere}`)
    }
    const refusal = new ForbiddenException(`This space's default permission is "Edit", which does not allow adding subtasks to its tasks`)
    const { writable } = writeRule({ parent: refusal })
    await assert.rejects(
      () => assertMayLinkSubtask(linkDb(null, false), { childId: 'child', parentId: 'parent', actorId: ACTOR, childWasThere: false, parentWasThere: true }, writable),
      (e: unknown) => e === refusal,
    )
  })

  it('refuses, in the routes’ words, a task as its own parent, a parent that is a subtask, and a child that has subtasks — whoever links them', async () => {
    const { writable } = writeRule()
    const link = (db: unknown, childId: string, parentId: string) =>
      assertMayLinkSubtask(db as any, { childId, parentId, actorId: ACTOR, childWasThere: false, parentWasThere: false }, writable)
    const refusedWith = (message: string) => (e: unknown) => e instanceof BadRequestException && e.message === message
    await assert.rejects(() => link(linkDb(null, false), 'same', 'same'), refusedWith('A task cannot be its own parent'))
    await assert.rejects(() => link(linkDb('grandparent', false), 'child', 'parent'), refusedWith('Subtasks can only be nested one level deep'))
    await assert.rejects(() => link(linkDb(null, true), 'child', 'parent'), refusedWith('A task with subtasks cannot become a subtask itself'))
    await link(linkDb(null, false), 'child', 'parent')
  })
})

describe('enrichmentRefusals (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)', () => {
  const IMPORTER = { id: ACTOR, role: 'user' }

  it('a task its importer may not open is refused whole, in the read rule’s words, and neither of the other rules is asked', async () => {
    const asked: string[] = []
    const answer = await enrichmentRefusals({} as any, { workspaceId: WS, taskId: 'task-h', importer: IMPORTER }, {
      readable: async (_db, workspaceId, taskId, actor) => {
        asked.push(`read ${workspaceId} ${taskId} ${actor.id}`)
        return null
      },
      commentable: async () => {
        asked.push('comment')
      },
      writable: async () => {
        asked.push('write')
        return {} as any
      },
    })
    assert.deepEqual(answer, { task: MAY_NOT_OPEN, comments: MAY_NOT_OPEN, attachments: MAY_NOT_OPEN })
    assert.equal(MAY_NOT_OPEN, 'You do not have access to this task')
    assert.deepEqual(asked, [`read ${WS} task-h ${ACTOR}`])
  })

  it('a task it may open asks the comment rule for comments and the write rule at edit for files, each refusal in its own words', async () => {
    const viewOnly = new ForbiddenException(`This space's default permission is "View only", which does not allow changing its comments`)
    const atComment = new ForbiddenException(`This space's default permission is "Comment", which does not allow changing its tasks`)
    const levels: Array<string | undefined> = []
    const readable = async () => ({ taskId: 'task', listId: 'list', projectId: 'project' })
    const writable = async (_db: unknown, _taskId: string, _actorId: string, opts: { level?: 'comment' | 'edit' | 'full' | 'subtask' } = {}) => {
      levels.push(opts.level)
      throw atComment
    }
    const answer = await enrichmentRefusals({} as any, { workspaceId: WS, taskId: 'task', importer: IMPORTER }, {
      readable,
      commentable: async () => {
        throw viewOnly
      },
      writable,
    })
    assert.deepEqual(answer, { task: null, comments: viewOnly.message, attachments: atComment.message })
    assert.deepEqual(levels, ['edit'], 'a file asks edit, as the attachment route does')
    const allowed = await enrichmentRefusals({} as any, { workspaceId: WS, taskId: 'task', importer: IMPORTER }, {
      readable,
      commentable: async () => {},
      writable: async () => ({}) as any,
    })
    assert.deepEqual(allowed, { task: null, comments: null, attachments: null })
    const binned = new ConflictException('This task is in the bin. Restore it before editing.')
    const inBin = await enrichmentRefusals({} as any, { workspaceId: WS, taskId: 'task', importer: IMPORTER }, {
      readable,
      commentable: async () => {
        throw binned
      },
      writable: async () => {
        throw binned
      },
    })
    assert.deepEqual(inBin, { task: null, comments: binned.message, attachments: binned.message })
  })

  it('a failure that is no refusal is not reported as one: it is thrown on', async () => {
    const broken = new Error('connection terminated')
    await assert.rejects(
      () =>
        enrichmentRefusals({} as any, { workspaceId: WS, taskId: 'task', importer: IMPORTER }, {
          readable: async () => ({ taskId: 'task', listId: 'list', projectId: 'project' }),
          commentable: async () => {
            throw broken
          },
          writable: async () => {
            throw new NotFoundException('Task not found')
          },
        }),
      (e: unknown) => e === broken,
    )
  })
})
