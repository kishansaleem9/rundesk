import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PeopleService } from './people.service'

/**
 * `ledger-rows/row-850` — a task added to a COLLEAGUE's priorities.
 *
 * ClickUp ("Personal Priorities", formerly LineUp): members, admins and owners
 * may add a task to somebody else's priorities, guests may not, and the owner's
 * list says who added each one. Here, on top of that, the task must be one both
 * of them may open, and the colleague must be in the workspace.
 *
 * The two questions the rules ask of the database — who is a member, and who
 * may open the task — are answered by each test, so what is under test is what
 * `addPriorityFor` does with the answers: which refusal, in which words, and
 * what it writes. The answers themselves are `readableTask`'s, and
 * `test/e2e/assign-to-priorities.mjs` asks them of a real database.
 */

/** A select that resolves to `rows` however it is chained. */
function selectChain(rows: unknown[]) {
  const q = Promise.resolve(rows) as any
  for (const step of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) q[step] = () => q
  return q
}

/**
 * A database that answers its selects in order and keeps the one insert.
 * `conflict` fails the insert as the unique index on (owner, workspace, task) does.
 */
function fakeDb(selects: unknown[][], conflict: boolean) {
  const written: { values?: Record<string, unknown> } = {}
  const queue = [...selects]
  const db = {
    select: mock.fn(() => selectChain(queue.shift() ?? [])),
    insert: mock.fn(() => ({
      values: (values: Record<string, unknown>) => {
        written.values = values
        return {
          returning: async () => {
            if (conflict) throw Object.assign(new Error('duplicate key value'), { code: '23505' })
            return [{ id: 'row-new', ...values }]
          },
        }
      },
    })),
  }
  return { db, written }
}

const WS = '11111111-1111-4111-8111-111111111111'
const ME = '22222222-2222-4222-8222-222222222222'
const MATE = '33333333-3333-4333-8333-333333333333'
const TASK = '44444444-4444-4444-8444-444444444444'

type Member = { role: string; platformRole?: string; displayName?: string }

function service(opts: {
  members: Record<string, Member>
  /** Who may open the task; everybody when left out. */
  opens?: (actorId: string) => boolean
  selects?: unknown[][]
  conflict?: boolean
}) {
  const { db, written } = fakeDb(opts.selects ?? [[]], opts.conflict ?? false)
  const svc = new PeopleService(db as any, {} as any, {} as any)
  const askedAbout: string[] = []
  ;(svc as any).memberRoles = async (_ws: string, ids: string[]) =>
    new Map(
      ids
        .filter((id) => opts.members[id])
        .map((id) => [id, { userId: id, platformRole: 'member', displayName: 'Mate Tahir', ...opts.members[id] }]),
    )
  ;(svc as any).mayOpenTask = async (_ws: string, _task: string, actor: { id: string }) => {
    askedAbout.push(actor.id)
    return (opts.opens ?? (() => true))(actor.id)
  }
  return { svc, db, written, askedAbout }
}

const both = { [ME]: { role: 'member' }, [MATE]: { role: 'member' } }

describe("PeopleService.addPriorityFor — a task on a colleague's priorities (ledger-rows/row-850)", () => {
  it("refuses a guest (403) and writes nothing — ClickUp: guests cannot add to somebody else's priorities", async () => {
    const { svc, db } = service({ members: { [ME]: { role: 'guest' }, [MATE]: { role: 'member' } } })
    await assert.rejects(
      () => svc.addPriorityFor(WS, { id: ME }, MATE, { taskId: TASK }),
      (err: unknown) => err instanceof ForbiddenException && /guest/i.test(err.message),
    )
    assert.equal(db.insert.mock.callCount(), 0, 'nothing is written for a guest')
  })

  it('does not find a colleague who is not in the workspace (404), and writes nothing', async () => {
    const { svc, db } = service({ members: { [ME]: { role: 'member' } } })
    await assert.rejects(
      () => svc.addPriorityFor(WS, { id: ME }, MATE, { taskId: TASK }),
      (err: unknown) => err instanceof NotFoundException && /not in this workspace/.test(err.message),
    )
    assert.equal(db.insert.mock.callCount(), 0, 'nothing is written for somebody outside the workspace')
  })

  it("puts only a task on somebody else's list, never a typed line (400)", async () => {
    const { svc, db } = service({ members: both })
    await assert.rejects(
      () => svc.addPriorityFor(WS, { id: ME }, MATE, { title: 'Call the accountant' }),
      (err: unknown) => err instanceof BadRequestException,
    )
    assert.equal(db.insert.mock.callCount(), 0, 'a typed line is not written onto a colleague’s list')
  })

  it('answers a task the caller may not open as not found (404)', async () => {
    const { svc, db } = service({ members: both, opens: (id) => id !== ME })
    await assert.rejects(
      () => svc.addPriorityFor(WS, { id: ME }, MATE, { taskId: TASK }),
      (err: unknown) => err instanceof NotFoundException && /task is not in this workspace/.test(err.message),
    )
    assert.equal(db.insert.mock.callCount(), 0)
  })

  it('refuses a task the colleague may not open (403), asked as the colleague, and writes nothing', async () => {
    const { svc, db, askedAbout } = service({ members: both, opens: (id) => id !== MATE })
    await assert.rejects(
      () => svc.addPriorityFor(WS, { id: ME }, MATE, { taskId: TASK }),
      (err: unknown) => err instanceof ForbiddenException && /Mate Tahir cannot open this task/.test(err.message),
    )
    assert.deepEqual(askedAbout, [ME, MATE], 'the task is asked of the caller, and then of the colleague as themself')
    assert.equal(db.insert.mock.callCount(), 0, 'no row its owner could not read is written')
  })

  it("writes the row onto the colleague's list, at its end, and records who added it", async () => {
    const { svc, written } = service({ members: both, selects: [[{ position: 4 }]] })
    const row = await svc.addPriorityFor(WS, { id: ME }, MATE, { taskId: TASK, title: 'ignored beside a task' })
    assert.equal(written.values?.userId, MATE, 'the row is the colleague’s')
    assert.equal(written.values?.addedById, ME, 'and says who put it there')
    assert.equal(written.values?.taskId, TASK)
    assert.equal(written.values?.title, null, 'a task row keeps no typed title')
    assert.equal(written.values?.position, 5, 'appended after their last one')
    assert.equal((row as { id: string }).id, 'row-new')
  })

  it('answers a task already on their list with the row that is there, not a second one', async () => {
    const existing = { id: 'row-there', userId: MATE, workspaceId: WS, taskId: TASK, addedById: MATE }
    const { svc, db } = service({ members: both, conflict: true, selects: [[{ position: 0 }], [existing]] })
    const row = await svc.addPriorityFor(WS, { id: ME }, MATE, { taskId: TASK })
    assert.deepEqual(row, existing)
    assert.equal(db.insert.mock.callCount(), 1, 'one attempt, refused by the unique index, and no other')
  })

  it("takes your own id as your own add — a guest's typed line too — and records you as its adder", async () => {
    const { svc, written } = service({
      members: { [ME]: { role: 'guest' } },
      // Your own add's two reads for a typed line: your membership, your last position.
      selects: [[{ userId: ME }], [{ position: 2 }]],
    })
    await svc.addPriorityFor(WS, { id: ME }, ME, { title: 'Call the accountant' })
    assert.equal(written.values?.userId, ME)
    assert.equal(written.values?.title, 'Call the accountant', 'your own list takes a typed line')
    assert.equal(written.values?.addedById, ME, 'a row you add yourself says so')
    assert.equal(written.values?.position, 3)
  })
})
