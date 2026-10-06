import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { CalendarSyncService } from './calendar-sync.service'

/**
 * The service is a thin shell around Drizzle + fetch. The unit tests
 * cover the pieces that are deterministic and decoupled from HTTP:
 *   - iCal token mint/resolve roundtrip
 *   - VEVENT formatting (escape rules, header/footer, status mapping)
 *   - iCal feed builder hydrating from the join query
 *
 * Outbound HTTP calls are intentionally NOT exercised here — they require
 * a live Google/Microsoft account to validate end-to-end and are better
 * suited to an integration test harness.
 */

function buildDb(opts: {
  icalToken?: any
  tasksForFeed?: any[]
} = {}) {
  return {
    select: mock.fn(() => ({
      from: mock.fn(() => ({
        innerJoin: mock.fn(function chain(): any {
          return {
            innerJoin: mock.fn(() => chain()),
            leftJoin: mock.fn(() => ({
              where: mock.fn(async () => opts.tasksForFeed ?? []),
            })),
            where: mock.fn(async () => opts.tasksForFeed ?? []),
          }
        }),
        where: mock.fn(() => ({
          limit: mock.fn(async () => (opts.icalToken ? [opts.icalToken] : [])),
        })),
      })),
    })),
    insert: mock.fn(() => ({
      values: mock.fn(() => ({
        onConflictDoUpdate: mock.fn(async () => undefined),
        returning: mock.fn(async () => [{ id: 't-1' }]),
      })),
    })),
    update: mock.fn(() => ({
      set: mock.fn(() => ({
        where: mock.fn(() => Object.assign(Promise.resolve(undefined), {
          catch: () => Promise.resolve(undefined),
        })),
      })),
    })),
    delete: mock.fn(() => ({ where: mock.fn(async () => undefined) })),
  } as any
}

describe('CalendarSyncService.mintIcalToken', () => {
  it('mints an unguessable scim_-style token prefixed with ical_', async () => {
    const svc = new CalendarSyncService(buildDb())
    const result = await svc.mintIcalToken('u-1', 'ws-1')
    assert.ok(result.token.startsWith('ical_'), `token "${result.token}" missing ical_ prefix`)
    assert.ok(result.token.length >= 30, 'token should have enough entropy')
    assert.match(result.url, /\/ical\/ical_[\w-]+\.ics$/)
  })

  it('generates unique tokens across calls', async () => {
    const svc = new CalendarSyncService(buildDb())
    const a = await svc.mintIcalToken('u-1', 'ws-1')
    const b = await svc.mintIcalToken('u-1', 'ws-1')
    assert.notEqual(a.token, b.token)
  })
})

describe('CalendarSyncService.resolveIcalToken', () => {
  it('returns null for unknown tokens', async () => {
    const svc = new CalendarSyncService(buildDb())
    const result = await svc.resolveIcalToken('ical_unknown')
    assert.equal(result, null)
  })

  it('returns the user/workspace for a live token', async () => {
    const svc = new CalendarSyncService(
      buildDb({
        icalToken: {
          id: 't-1',
          userId: 'u-1',
          workspaceId: 'ws-1',
          token: 'ical_abc',
          revokedAt: null,
        },
      }),
    )
    const result = await svc.resolveIcalToken('ical_abc')
    assert.deepEqual(result, { userId: 'u-1', workspaceId: 'ws-1' })
  })

  it('returns null for revoked tokens', async () => {
    const svc = new CalendarSyncService(
      buildDb({
        icalToken: {
          id: 't-1',
          userId: 'u-1',
          workspaceId: 'ws-1',
          token: 'ical_abc',
          revokedAt: new Date(),
        },
      }),
    )
    const result = await svc.resolveIcalToken('ical_abc')
    assert.equal(result, null)
  })
})

describe('CalendarSyncService.buildIcalFeed', () => {
  it('returns a valid VCALENDAR scaffold even when there are no tasks', async () => {
    const svc = new CalendarSyncService(buildDb({ tasksForFeed: [] }))
    const ics = await svc.buildIcalFeed('u-1', 'ws-1')
    assert.match(ics, /^BEGIN:VCALENDAR/)
    assert.match(ics, /END:VCALENDAR$/)
    assert.match(ics, /PRODID:-\/\/Rundesk\/\/ICAL Subscription\/\/EN/)
    // No VEVENT blocks when zero tasks
    assert.equal(/BEGIN:VEVENT/.test(ics), false)
  })

  it('renders one VEVENT per task and escapes commas / newlines / semicolons', async () => {
    const due = new Date('2026-06-01T15:30:00Z')
    const svc = new CalendarSyncService(
      buildDb({
        tasksForFeed: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            title: 'Ship, hotfix; & rollback\nrunbook',
            description: 'Line one\nLine two',
            startDate: null,
            dueDate: due,
            updatedAt: due,
            status: 'in_progress',
            listId: 'list-1',
          },
        ],
      }),
    )
    const ics = await svc.buildIcalFeed('u-1', 'ws-1')
    assert.match(ics, /BEGIN:VEVENT[\s\S]+END:VEVENT/)
    assert.match(ics, /UID:task-11111111-1111-1111-1111-111111111111@rundesk/)
    assert.match(ics, /DTEND:20260601T153000Z/)
    // commas + semicolons + newlines escaped per RFC 5545
    assert.match(ics, /SUMMARY:Ship\\, hotfix\\; & rollback\\nrunbook/)
    assert.match(ics, /DESCRIPTION:Line one\\nLine two/)
    // in_progress -> TENTATIVE, closed -> CONFIRMED
    assert.match(ics, /STATUS:TENTATIVE/)
  })

  it('dedupes a task appearing on multiple assignee join rows', async () => {
    const due = new Date('2026-06-01T15:30:00Z')
    const dup = {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'Dedupe me',
      description: null,
      startDate: null,
      dueDate: due,
      updatedAt: due,
      status: 'todo',
      listId: 'list-1',
    }
    const svc = new CalendarSyncService(buildDb({ tasksForFeed: [dup, dup, dup] }))
    const ics = await svc.buildIcalFeed('u-1', 'ws-1')
    const matches = ics.match(/BEGIN:VEVENT/g) ?? []
    assert.equal(matches.length, 1)
  })
})

/*
 * A PUSH WRITES A TASK ONLY INTO THE CALENDAR OF SOMEBODY WHO MAY READ IT NOW
 * (`found-5-oct/calendar-push-ignores-who-may-read`). Every connection of the
 * workspace was written to, whoever had made it — a member refused the task's
 * private space, and one removed from the workspace. The provider is stood in
 * for (no lane may reach it); what is asked is which connections are written to.
 */
describe('CalendarSyncService.pushTask — whose calendar', () => {
  const TASK = {
    id: 't-1', title: 'Private plan', description: 'the secret', startDate: null,
    dueDate: new Date(Date.now() + 86_400_000), isArchived: false, workspaceId: 'ws-1',
  }
  const conn = (provider: string, connectedById: string | null) => ({
    id: `c-${provider}`, workspaceId: 'ws-1', provider, accessToken: null, refreshToken: null,
    tokenExpiresAt: null, externalAccountEmail: null, metadata: {}, connectedById,
  })

  it('writes into the connection whose owner may read the task, and not into the one whose owner may not', async () => {
    const svc = new CalendarSyncService({} as any)
    mock.method(svc as any, 'resolveTaskContext', async () => ({ task: TASK, connections: [conn('gcal', 'keeper'), conn('outlook', 'admin')] }))
    mock.method(svc as any, 'ownerMayRead', async (c: { connectedById: string }) => c.connectedById === 'admin')
    const google = mock.method(svc as any, 'upsertGoogleEvent', async () => undefined)
    const outlook = mock.method(svc as any, 'upsertOutlookEvent', async () => undefined)

    const res = await svc.pushTask('t-1')

    assert.equal(google.mock.callCount(), 0, 'nothing is sent to the calendar of an owner who may not read the task')
    assert.equal(outlook.mock.callCount(), 1, 'and the reader’s calendar still gets it')
    assert.deepEqual(res, { pushed: ['outlook'], skipped: [] })
  })
})

/*
 * WHO MAY READ IT NOW: a member of the task's workspace — asked of a platform
 * admin too, as the iCal feed asks it — let in by the task read rule with their
 * account's role. A queued Drizzle stand-in answers the selects in order.
 */
describe('CalendarSyncService.ownerMayRead', () => {
  const TASK = { id: 't-1', workspaceId: 'ws-1' }
  const queued = (results: unknown[][]) => {
    const queue = [...results]
    const node = (rows: unknown[]) => {
      const p = Promise.resolve(rows) as any
      for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
      return p
    }
    return { select: () => node(queue.shift() ?? []), left: () => queue.length } as any
  }
  /** The read rule's row: a task in a private space. */
  const IN_PRIVATE_SPACE = {
    taskId: 't-1', listId: 'l-1', taskVisibility: 'public', taskCreatedById: 'admin', listVisibility: 'public',
    listCreatedById: 'admin', projectId: 'p-1', projectVisibility: 'public', spaceId: 's-1', spaceVisibility: 'private',
  }
  const ask = (db: any, connectedById: string | null) =>
    (new CalendarSyncService(db) as any).ownerMayRead({ connectedById }, TASK) as Promise<boolean>

  it('is no for a member refused the task’s private space', async () => {
    // Their membership, their account, the read rule's row, their workspace role, no seat in the space.
    const db = queued([[{ userId: 'keeper' }], [{ role: 'member' }], [IN_PRIVATE_SPACE], [{ role: 'member' }], []])
    assert.equal(await ask(db, 'keeper'), false)
  })

  it('is no for somebody no longer in the workspace — a platform admin too', async () => {
    const db = queued([[], [{ role: 'super_admin' }], [IN_PRIVATE_SPACE]])
    assert.equal(await ask(db, 'gone'), false)
    assert.equal(db.left(), 2, 'their membership is asked first, and nothing after it')
  })

  it('is yes for a member who may open it — here a platform admin, by their account’s role', async () => {
    const db = queued([[{ userId: 'sa' }], [{ role: 'super_admin' }], [IN_PRIVATE_SPACE]])
    assert.equal(await ask(db, 'sa'), true)
  })

  it('is no for a connection nobody owns any more', async () => {
    assert.equal(await ask(queued([]), null), false)
  })
})

/*
 * A pull overwrites the task linked to each event it reads. The link is looked
 * up by the provider's event id, which is not the workspace's: the same
 * calendar connected in two workspaces, or an event id a calendar's owner
 * chose, puts one id on links in both. So the lookup is this workspace's links
 * alone (`calendar-pull-for-any-member`), or a pull in one workspace rewrites
 * a task in another. The provider is stubbed here — no lane can reach it with
 * a token that works — and the lookup's predicate is read back as SQL.
 */
describe('CalendarSyncService.pullEvents', () => {
  const WS = '11111111-1111-4111-8111-111111111111'
  const dialect = new PgDialect()

  it("looks each event's link up among the pulling workspace's links only", async () => {
    const lookups: unknown[] = []
    const db = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            lookups.push(condition)
            return { limit: async () => [] }
          },
        }),
      }),
      insert: () => ({ values: () => ({ returning: async () => [{ id: 'new-task', createdById: 'admin' }] }) }),
    } as any
    const svc = new CalendarSyncService(db)
    mock.method(svc as any, 'requireConnection', async () => ({ id: 'conn', workspaceId: WS, provider: 'gcal', metadata: { inboxListId: 'inbox' }, connectedById: 'admin' }))
    mock.method(svc as any, 'listGoogleEvents', async () => [{ id: 'evt-shared', etag: 'e1', summary: 'Standup', start: new Date(), end: new Date() }])

    await svc.pullEvents(WS, 'gcal')

    assert.equal(lookups.length, 1, 'one link lookup for the one event')
    const q = dialect.sqlToQuery(lookups[0] as never)
    assert.match(q.sql, /"task_calendar_links"\."workspace_id" = \$\d+/, `the lookup asks the workspace: ${q.sql}`)
    assert.ok(q.params.includes(WS), `and it is the pulling workspace: ${JSON.stringify(q.params)}`)
  })
})
