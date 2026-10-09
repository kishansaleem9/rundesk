import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { calendarSyncEvents, taskAssignees, userCalendarAccounts } from '@rundesk/db'
import { CalendarSyncRulesService, taskEvent, taskEventSpan, type TaskForSync } from './calendar-sync-rules.service'

/*
 * CLICKUP'S "SYNC TASKS TO CALENDAR" (`ledger-rows/row-1962`): which calendars a
 * task goes to, and the event it becomes there. The provider is stood in for —
 * the account service's write and delete are counted — and the database by a
 * table of rows each query's condition is read back against, as SQL.
 */

const dialect = new PgDialect()
const paramsOf = (cond: unknown): unknown[] => (cond ? (dialect.sqlToQuery(cond as never).params as unknown[]) : [])

/** Rows in memory: a select keeps those its condition names (every id it asks, or any of an `in` list of accounts). */
function fakeDb(tables: Map<object, any[]>) {
  const matches = (table: object, row: any, params: unknown[]) =>
    table === userCalendarAccounts
      ? params.length === 0 || params.includes(row.id)
      : params.every((p) => typeof p !== 'string' || Object.values(row).includes(p))
  return {
    select: () => ({
      from: (table: object) => ({
        where: (cond: unknown) => {
          const ps = paramsOf(cond)
          const out = (tables.get(table) ?? []).filter((r) => matches(table, r, ps))
          const p = Promise.resolve(out) as any
          p.limit = async (n: number) => out.slice(0, n)
          p.orderBy = () => p
          return p
        },
      }),
    }),
    insert: (table: object) => ({
      values: (v: any) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const list = tables.get(table)!
            if (list.some((r) => r.accountId === v.accountId && r.taskId === v.taskId)) return []
            const row = { id: `row-${list.length + 1}`, ...v }
            list.push(row)
            return [{ id: row.id }]
          },
        }),
      }),
    }),
    update: (table: object) => ({
      set: (patch: any) => ({
        where: async (cond: unknown) => {
          const ps = paramsOf(cond)
          for (const r of tables.get(table)!) if (matches(table, r, ps)) Object.assign(r, patch)
        },
      }),
    }),
    delete: (table: object) => ({
      where: async (cond: unknown) => {
        const ps = paramsOf(cond)
        const list = tables.get(table)!
        for (let i = list.length - 1; i >= 0; i--) if (matches(table, list[i], ps)) list.splice(i, 1)
      },
    }),
  } as any
}

const WS = 'ws-1'
const TASK: TaskForSync = {
  id: 'task-1',
  title: 'Launch plan',
  description: '<p>The plan</p>',
  startDate: null,
  dueDate: new Date('2026-10-20T15:00:00.000Z'),
  startDateHasTime: false,
  dueDateHasTime: true,
  isArchived: false,
  containerArchived: false,
  listId: 'list-1',
  projectId: 'project-1',
  folderId: null,
  spaceId: 'space-1',
  workspaceId: WS,
}
const account = (id: string, userId: string, extra: Record<string, unknown> = {}) => ({
  id, userId, workspaceId: WS, provider: 'gcal', externalCalendarId: 'primary', status: 'connected', accessToken: `token-${id}`, ...extra,
})
const rule = (id: string, userId: string, accountId: string, assignedOnly = false) => ({
  id, workspaceId: WS, userId, accountId, scopeType: 'list', scopeId: 'list-1', assignedOnly,
})

function harness(opts: {
  task?: TaskForSync | null
  rules: ReturnType<typeof rule>[]
  accounts: ReturnType<typeof account>[]
  assignees?: string[]
  events?: Array<{ id: string; accountId: string; taskId: string; externalEventId: string; fingerprint: string }>
  readers: string[]
}) {
  const tables = new Map<object, any[]>([
    [userCalendarAccounts, opts.accounts],
    [taskAssignees, (opts.assignees ?? []).map((userId) => ({ taskId: TASK.id, userId }))],
    [calendarSyncEvents, opts.events ?? []],
  ])
  const writes: Array<{ account: string; eventId: string | null; title: string }> = []
  const deletes: Array<{ account: string; eventId: string }> = []
  const accounts = {
    writeBlockEvent: async (a: any, e: any, eventId: string | null) => {
      writes.push({ account: a.id, eventId, title: e.title })
      return eventId ?? `evt-${a.id}`
    },
    deleteBlockEvent: async (a: any, eventId: string) => {
      deletes.push({ account: a.id, eventId })
    },
  }
  const svc = new CalendarSyncRulesService(fakeDb(tables), accounts as any)
  mock.method(svc as any, 'taskForSync', async () => (opts.task === undefined ? TASK : opts.task))
  mock.method(svc as any, 'rulesFor', async () => opts.rules)
  mock.method(svc as any, 'mayTake', async (userId: string) => opts.readers.includes(userId))
  return { svc, writes, deletes, events: tables.get(calendarSyncEvents)! }
}

describe('taskEventSpan — when a task is on the calendar, as ClickUp draws it', () => {
  const at = (iso: string) => new Date(iso)
  it('a due date with a time is the hour before it', () => {
    assert.deepEqual(taskEventSpan({ startDate: null, dueDate: at('2026-10-20T15:00:00Z'), startDateHasTime: false, dueDateHasTime: true }),
      { start: at('2026-10-20T14:00:00Z'), end: at('2026-10-20T15:00:00Z'), allDay: false })
  })
  it('a due date with no time is its day', () => {
    assert.deepEqual(taskEventSpan({ startDate: null, dueDate: at('2026-10-20T00:00:00Z'), startDateHasTime: false, dueDateHasTime: false }),
      { start: at('2026-10-20T00:00:00Z'), end: at('2026-10-21T00:00:00Z'), allDay: true })
  })
  it('a start and a due date with no time span their days, the due day included', () => {
    assert.deepEqual(taskEventSpan({ startDate: at('2026-10-18T00:00:00Z'), dueDate: at('2026-10-20T00:00:00Z'), startDateHasTime: false, dueDateHasTime: false }),
      { start: at('2026-10-18T00:00:00Z'), end: at('2026-10-21T00:00:00Z'), allDay: true })
  })
  it('a start and a due date with times span from one to the other', () => {
    assert.deepEqual(taskEventSpan({ startDate: at('2026-10-20T09:30:00Z'), dueDate: at('2026-10-20T11:00:00Z'), startDateHasTime: true, dueDateHasTime: true }),
      { start: at('2026-10-20T09:30:00Z'), end: at('2026-10-20T11:00:00Z'), allDay: false })
  })
  it('a start after the due date is no span: the due date alone is drawn', () => {
    assert.deepEqual(taskEventSpan({ startDate: at('2026-10-22T09:00:00Z'), dueDate: at('2026-10-20T15:00:00Z'), startDateHasTime: true, dueDateHasTime: true }),
      { start: at('2026-10-20T14:00:00Z'), end: at('2026-10-20T15:00:00Z'), allDay: false })
  })
  it('a start alone with a time is the hour from it, and with none its day', () => {
    assert.deepEqual(taskEventSpan({ startDate: at('2026-10-20T09:00:00Z'), dueDate: null, startDateHasTime: true, dueDateHasTime: false }),
      { start: at('2026-10-20T09:00:00Z'), end: at('2026-10-20T10:00:00Z'), allDay: false })
    assert.deepEqual(taskEventSpan({ startDate: at('2026-10-20T00:00:00Z'), dueDate: null, startDateHasTime: false, dueDateHasTime: false }),
      { start: at('2026-10-20T00:00:00Z'), end: at('2026-10-21T00:00:00Z'), allDay: true })
  })
  it('a task with no date is off the calendar', () => {
    assert.equal(taskEventSpan({ startDate: null, dueDate: null, startDateHasTime: false, dueDateHasTime: false }), null)
  })
})

describe('taskEvent — what the event shows', () => {
  it('the task’s name, its description as text, and the way back to the task', () => {
    const e = taskEvent(TASK)!
    assert.equal(e.title, 'Launch plan')
    assert.match(e.description!, /^The plan\n\nhttps?:\/\/[^\s]+\/app\/ws-1\/space-1\/project-1\/list-1\?task=task-1$/)
  })
  it('none for an archived task, or one whose list, project or space is in the bin', () => {
    assert.equal(taskEvent({ ...TASK, isArchived: true }), null)
    assert.equal(taskEvent({ ...TASK, containerArchived: true }), null)
  })
})

describe('CalendarSyncRulesService.syncTask — which calendars a task goes to', () => {
  it('writes into the calendar of a sync whose owner may open the task, and not into one whose owner may not', async () => {
    const h = harness({
      rules: [rule('r-keeper', 'keeper', 'acc-keeper'), rule('r-admin', 'admin', 'acc-admin')],
      accounts: [account('acc-keeper', 'keeper'), account('acc-admin', 'admin')],
      readers: ['admin'],
    })
    const out = await h.svc.syncTask(TASK.id)
    assert.deepEqual(h.writes.map((w) => w.account), ['acc-admin'], 'nothing is sent to the calendar of an owner who may not read the task')
    assert.deepEqual(out.written, ['acc-admin'])
    assert.deepEqual(h.events.map((e) => [e.accountId, e.externalEventId]), [['acc-admin', 'evt-acc-admin']])
  })

  it('a sync of only its owner’s tasks takes one assigned to them, and gives up one that is not, taking its event off', async () => {
    const assigned = harness({
      rules: [rule('r', 'me', 'acc-me', true)],
      accounts: [account('acc-me', 'me')],
      assignees: ['me'],
      readers: ['me'],
    })
    await assigned.svc.syncTask(TASK.id)
    assert.deepEqual(assigned.writes.map((w) => w.account), ['acc-me'])

    const notAssigned = harness({
      rules: [rule('r', 'me', 'acc-me', true)],
      accounts: [account('acc-me', 'me')],
      assignees: ['someone-else'],
      events: [{ id: 'row-1', accountId: 'acc-me', taskId: TASK.id, externalEventId: 'evt-old', fingerprint: 'x' }],
      readers: ['me'],
    })
    const out = await notAssigned.svc.syncTask(TASK.id)
    assert.equal(notAssigned.writes.length, 0)
    assert.deepEqual(notAssigned.deletes, [{ account: 'acc-me', eventId: 'evt-old' }])
    assert.deepEqual(out.removed, ['acc-me'])
    assert.equal(notAssigned.events.length, 0, 'and its row goes with it')
  })

  it('an archived task, or one no sync holds any more, comes off every calendar it was written to', async () => {
    const h = harness({
      task: { ...TASK, isArchived: true },
      rules: [rule('r', 'me', 'acc-me')],
      accounts: [account('acc-me', 'me'), account('acc-other', 'other')],
      events: [
        { id: 'row-1', accountId: 'acc-me', taskId: TASK.id, externalEventId: 'evt-me', fingerprint: 'x' },
        { id: 'row-2', accountId: 'acc-other', taskId: TASK.id, externalEventId: 'evt-other', fingerprint: 'y' },
      ],
      readers: ['me', 'other'],
    })
    await h.svc.syncTask(TASK.id)
    assert.equal(h.writes.length, 0)
    assert.deepEqual(h.deletes.map((d) => d.eventId).sort(), ['evt-me', 'evt-other'])
  })

  it('changes the event it wrote rather than writing a second, and writes nothing when what the event shows has not changed', async () => {
    const h = harness({
      rules: [rule('r', 'me', 'acc-me')],
      accounts: [account('acc-me', 'me')],
      events: [{ id: 'row-1', accountId: 'acc-me', taskId: TASK.id, externalEventId: 'evt-me', fingerprint: 'stale' }],
      readers: ['me'],
    })
    await h.svc.syncTask(TASK.id)
    assert.deepEqual(h.writes, [{ account: 'acc-me', eventId: 'evt-me', title: 'Launch plan' }])
    const again = await h.svc.syncTask(TASK.id)
    assert.equal(h.writes.length, 1, 'a second push of the same task writes nothing')
    assert.deepEqual(again.unchanged, ['acc-me'])
  })

  it('takes no calendar a sync names that is not its owner’s own', async () => {
    const h = harness({
      rules: [rule('r', 'me', 'acc-colleague')],
      accounts: [account('acc-colleague', 'colleague')],
      readers: ['me', 'colleague'],
    })
    await h.svc.syncTask(TASK.id)
    assert.equal(h.writes.length, 0)
  })

  it('Sync now writes only the calendars it is given, each event whether or not it looks changed', async () => {
    const fingerprintNow = harness({ rules: [rule('r', 'me', 'acc-me')], accounts: [account('acc-me', 'me')], readers: ['me'] })
    await fingerprintNow.svc.syncTask(TASK.id)
    const fingerprint = fingerprintNow.events[0]?.fingerprint
    const h = harness({
      rules: [rule('r-me', 'me', 'acc-me'), rule('r-other', 'other', 'acc-other')],
      accounts: [account('acc-me', 'me'), account('acc-other', 'other')],
      events: [
        { id: 'row-1', accountId: 'acc-me', taskId: TASK.id, externalEventId: 'evt-me', fingerprint },
        { id: 'row-2', accountId: 'acc-other', taskId: TASK.id, externalEventId: 'evt-other', fingerprint: 'stale' },
      ],
      readers: ['me', 'other'],
    })
    const out = await h.svc.syncTask(TASK.id, { accounts: new Set(['acc-me']), force: true })
    assert.deepEqual(h.writes, [{ account: 'acc-me', eventId: 'evt-me', title: 'Launch plan' }], 'the presser’s event is written though unchanged, and the other calendar is not touched')
    assert.deepEqual(out.written, ['acc-me'])
  })

  it('two syncs of one calendar write one event', async () => {
    const h = harness({
      rules: [rule('r-list', 'me', 'acc-me'), { ...rule('r-space', 'me', 'acc-me'), scopeType: 'space', scopeId: 'space-1' }],
      accounts: [account('acc-me', 'me')],
      readers: ['me'],
    })
    await h.svc.syncTask(TASK.id)
    assert.equal(h.writes.length, 1)
  })
})
