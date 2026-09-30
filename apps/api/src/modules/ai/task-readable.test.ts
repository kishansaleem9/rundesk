import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { AiService } from './ai.service'

/**
 * `found-30-sep/private-task-reads-say-403` — Summarize, Draft a reply, a
 * deadline and the dock ask `assertTaskReadable` first. A task its reader may
 * not open was 403 "You do not have access to this task" where an id naming
 * nothing was 404 "Task not found", so any id said whether it named a task.
 *
 * A Drizzle stand-in whose selects answer in order: the task's workspace, then
 * what `readableTask` reads — the task where it lives, the reader's role, the
 * project's folder, the private task's assignees.
 */
function dbOf(queue: unknown[][]) {
  let i = 0
  const chain = (rows: unknown[]): any => {
    const c: any = {}
    for (const k of ['from', 'innerJoin', 'leftJoin', 'where', 'limit', 'orderBy', 'groupBy']) c[k] = () => c
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows).then(res, rej)
    return c
  }
  return { select: () => chain(queue[i++] ?? []) } as any
}
const svc = (queue: unknown[][]) => new AiService({ get: () => undefined } as any, dbOf(queue), {} as any)
const TASK = '44444444-4444-4444-8444-444444444444'
const READER = { id: 'a-member', role: 'member' }
const privateTask = [
  [{ workspaceId: 'w1' }],
  [{ taskId: TASK, listId: 'l1', taskVisibility: 'private', taskCreatedById: 'the-admin', listVisibility: 'public', listCreatedById: 'the-admin', projectId: 'p1', projectVisibility: null, spaceId: 's1', spaceVisibility: 'public' }],
  [{ role: 'member' }],
  [], // the project's folder: none
  [], // the private task's assignees: not this reader
]

describe('a task by id, for a reader who may not open it (found-30-sep/private-task-reads-say-403)', () => {
  it('is refused as a task that is not there, in the same words', async () => {
    const refused = await svc(privateTask).assertTaskReadable(TASK, READER).then(() => null, (e: Error) => e)
    const missing = await svc([[]]).assertTaskReadable(TASK, READER).then(() => null, (e: Error) => e)
    assert.ok(missing instanceof NotFoundException, `the miss answered ${missing?.constructor?.name}`)
    assert.ok(refused instanceof NotFoundException, `refused with ${refused?.constructor?.name}: ${refused?.message}`)
    assert.equal(refused.message, missing.message)
  })

  it('and its maker, who may open it, is answered with its workspace', async () => {
    const own = privateTask.map((rows, i) => (i === 1 ? [{ ...(rows[0] as object), taskCreatedById: READER.id }] : rows))
    assert.equal(await svc(own).assertTaskReadable(TASK, READER), 'w1')
  })
})

/*
 * ASSIGN WITH AI makes its own read check (`suggestAssignee`), on a route that
 * names no workspace, so no guard stands in front of it. It answered a task
 * its asker may not open `no_permission` ("You do not have permission to
 * assign that task") and an id naming nothing `unknown_task`, to a member
 * refused the task and to a user of any other organisation alike
 * (`found-30-sep/private-task-reads-say-403`, review). Its selects, in order:
 * the task where it lives, then what `readableTask` reads.
 */
describe('Assign with AI, for an asker who may not open the task (found-30-sep/private-task-reads-say-403)', () => {
  const found = [{ id: TASK, listId: 'l1', workspaceId: 'w1' }]
  it('answers a member refused it, and a user of another organisation, word for word as an id naming nothing', async () => {
    const member = await svc([found, ...privateTask.slice(1)]).suggestAssignee(TASK, READER.id)
    const stranger = await svc([found, privateTask[1], []]).suggestAssignee(TASK, 'a-stranger')
    const miss = await svc([[]]).suggestAssignee(TASK, READER.id)
    assert.equal(miss.ok, false)
    assert.equal((miss as any).reason, 'unknown_task')
    assert.deepEqual(member, miss)
    assert.deepEqual(stranger, miss)
  })

  it('and its maker, who may open it, is refused neither way — so the refusal above is about reading it', async () => {
    const own = [found, [{ ...(privateTask[1][0] as object), taskCreatedById: READER.id }], [{ role: 'member' }], [], [{ role: 'member' }]]
    const res = (await svc(own).suggestAssignee(TASK, READER.id)) as any
    assert.ok(res.reason !== 'unknown_task' && res.reason !== 'no_permission', `its maker was answered ${JSON.stringify(res)}`)
  })
})
