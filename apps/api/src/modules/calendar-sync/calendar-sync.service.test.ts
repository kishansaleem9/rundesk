import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
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
