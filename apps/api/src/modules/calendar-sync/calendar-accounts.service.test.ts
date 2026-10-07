import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { CalendarAccountsService } from './calendar-accounts.service'

/**
 * The events of the calendars a person reads (`found-25-sep/connected-calendars-read-by-nothing`):
 * each account read on its own, a failure costing only its own events and SAID,
 * and an expired token refreshed rather than refused an hour after connecting.
 */

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.GOOGLE_CALENDAR_API_URL
  delete process.env.MS_GRAPH_API_URL
  delete process.env.GOOGLE_TOKEN_URL
})

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** The accounts `busyAccountsWithTokens` reads, and every token write recorded. */
function dbWith(accounts: any[]) {
  const writes: unknown[] = []
  const db = {
    select: () => ({ from: () => ({ where: async () => accounts }) }),
    update: () => ({ set: (v: unknown) => ({ where: async () => { writes.push(v) } }) }),
  }
  return { db, writes }
}

const account = (over: Record<string, unknown>) => ({
  id: 'acc',
  userId: 'u1',
  workspaceId: 'ws1',
  provider: 'gcal',
  externalCalendarId: 'primary',
  externalAccountEmail: 'me@example.test',
  accessToken: 'live',
  refreshToken: null,
  tokenExpiresAt: null,
  countsAsBusy: true,
  status: 'connected',
  ...over,
})

describe('CalendarAccountsService.events — what each calendar reads, and what could not be read', () => {
  it('reads every ticked calendar, and names one that refused rather than drawing its week empty', async () => {
    process.env.GOOGLE_CALENDAR_API_URL = 'http://stub.test/google/calendar/v3'
    process.env.MS_GRAPH_API_URL = 'http://stub.test/graph/v1.0'
    const { db } = dbWith([
      account({ id: 'g', provider: 'gcal', accessToken: 'g-token' }),
      account({ id: 'o', provider: 'outlook', accessToken: 'gone', externalAccountEmail: 'work@example.test' }),
    ])
    globalThis.fetch = mock.fn(async (url: string | URL) => {
      if (String(url).includes('/graph/')) return answer(401, { error: { code: 'InvalidAuthenticationToken' } })
      return answer(200, { items: [{ id: 'e1', summary: 'Standup', start: { dateTime: '2026-10-08T09:00:00Z' }, end: { dateTime: '2026-10-08T09:15:00Z' } }] })
    }) as never
    const svc = new CalendarAccountsService(db as never)
    const read = await svc.events('u1', 'ws1', new Date('2026-10-08T00:00:00Z'), new Date('2026-10-09T00:00:00Z'))
    assert.deepEqual(read.events.map((e) => [e.accountId, e.id, e.title]), [['g', 'e1', 'Standup']])
    assert.deepEqual(read.unread, [{ accountId: 'o', email: 'work@example.test', provider: 'outlook', reason: 'refused' }])
  })

  it('an expired token is refreshed, kept, and read with; the stored one is never sent', async () => {
    process.env.GOOGLE_CALENDAR_API_URL = 'http://stub.test/google/calendar/v3'
    process.env.GOOGLE_TOKEN_URL = 'http://stub.test/google/token'
    const { db, writes } = dbWith([
      account({ accessToken: 'expired', refreshToken: 'refresh-1', tokenExpiresAt: new Date(Date.now() - 60_000) }),
    ])
    const sent: string[] = []
    globalThis.fetch = mock.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('/google/token')) {
        assert.match(String(init?.body), /grant_type=refresh_token/)
        assert.match(String(init?.body), /refresh_token=refresh-1/)
        return answer(200, { access_token: 'fresh', expires_in: 3599 })
      }
      sent.push((init?.headers as Record<string, string>).Authorization)
      return answer(200, { items: [] })
    }) as never
    const svc = new CalendarAccountsService(db as never)
    const read = await svc.events('u1', 'ws1', new Date('2026-10-08T00:00:00Z'), new Date('2026-10-09T00:00:00Z'))
    assert.deepEqual(read.unread, [])
    assert.deepEqual(sent, ['Bearer fresh'])
    assert.equal((writes[0] as { accessToken?: string }).accessToken, 'fresh', 'the refreshed token was not kept')
  })

  it('a token the provider refuses is refreshed once and the read asked again, not given up on', async () => {
    process.env.GOOGLE_CALENDAR_API_URL = 'http://stub.test/google/calendar/v3'
    process.env.GOOGLE_TOKEN_URL = 'http://stub.test/google/token'
    const { db } = dbWith([account({ accessToken: 'revoked-early', refreshToken: 'refresh-2' })])
    const sent: string[] = []
    globalThis.fetch = mock.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('/google/token')) return answer(200, { access_token: 'second', expires_in: 3599 })
      const auth = (init?.headers as Record<string, string>).Authorization
      sent.push(auth)
      return auth === 'Bearer second' ? answer(200, { items: [] }) : answer(401, { error: { code: 401 } })
    }) as never
    const svc = new CalendarAccountsService(db as never)
    const read = await svc.events('u1', 'ws1', new Date('2026-10-08T00:00:00Z'), new Date('2026-10-09T00:00:00Z'))
    assert.deepEqual(sent, ['Bearer revoked-early', 'Bearer second'])
    assert.deepEqual(read.unread, [])
  })
})
