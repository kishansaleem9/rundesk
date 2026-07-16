import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  ExternalLinkRefreshService,
  selectStaleLinks,
  type RefreshableLink,
} from './external-link-refresh.service'

/**
 * §12.2 — background sync cron. Two layers:
 *   1. `selectStaleLinks` — pure selection/cadence (which links, how many, order).
 *   2. `refreshStale` — DB + provider fully mocked: proves the env-gate on the
 *      provider connection and that state is written back.
 */

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-07-16T12:00:00Z')

function link(over: Partial<RefreshableLink>): RefreshableLink {
  return {
    id: 'l1',
    workspaceId: 'w1',
    provider: 'github',
    kind: 'pull_request',
    title: null,
    status: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    metadata: {},
    ...over,
  }
}

describe('selectStaleLinks — cadence + selection', () => {
  it('selects links whose lastRefreshedAt is older than maxAgeHours', () => {
    const links = [
      link({ id: 'stale', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 8 * HOUR).toISOString() } }),
      link({ id: 'fresh', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() } }),
    ]
    const out = selectStaleLinks(links, NOW, 6, 50)
    assert.deepEqual(out.map((l) => l.id), ['stale'])
  })

  it('falls back to createdAt when no lastRefreshedAt has been recorded', () => {
    const links = [
      link({ id: 'never-refreshed-old', metadata: {}, createdAt: new Date(NOW.getTime() - 10 * HOUR) }),
      link({ id: 'never-refreshed-new', metadata: {}, createdAt: new Date(NOW.getTime() - 2 * HOUR) }),
    ]
    const out = selectStaleLinks(links, NOW, 6, 50)
    assert.deepEqual(out.map((l) => l.id), ['never-refreshed-old'])
  })

  it('orders oldest-refreshed first and caps at batchSize', () => {
    const links = [
      link({ id: 'a', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 7 * HOUR).toISOString() } }),
      link({ id: 'b', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() } }),
      link({ id: 'c', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 9 * HOUR).toISOString() } }),
    ]
    const out = selectStaleLinks(links, NOW, 6, 2)
    assert.deepEqual(out.map((l) => l.id), ['b', 'c'], 'oldest first, limited to 2')
  })

  it('returns [] when nothing is stale', () => {
    const links = [link({ metadata: { lastRefreshedAt: NOW.toISOString() } })]
    assert.deepEqual(selectStaleLinks(links, NOW, 6, 50), [])
  })
})

/** Chainable drizzle stand-in with a queue of select results + captured updates. */
function makeDb(selectResults: unknown[][]) {
  const queue = [...selectResults]
  const updates: Array<Record<string, unknown>> = []
  const VERBS = ['from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin']
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of VERBS) p[v] = () => p
    return p
  }
  const db = {
    select: mock.fn(() => node(queue.shift() ?? [])),
    update: mock.fn(() => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updates.push(v)
          return Promise.resolve([])
        },
      }),
    })),
  } as any
  return { db, updates }
}

const CONNECTED_GH = [{ status: 'connected', accessToken: 'gh-token' }]

describe('ExternalLinkRefreshService.refreshStale — gating + write-back', () => {
  it('refreshes stale PR links when the provider is connected', async () => {
    const candidates = [
      {
        id: 'l-stale',
        workspaceId: 'w1',
        provider: 'github',
        kind: 'pull_request',
        title: 'old title',
        status: 'open',
        createdAt: new Date(NOW.getTime() - 30 * HOUR),
        metadata: { ref: { owner: 'acme', repo: 'web', number: '5' }, lastRefreshedAt: new Date(NOW.getTime() - 30 * HOUR).toISOString() },
      },
    ]
    // selects: [candidate pool, connection lookup]
    const { db, updates } = makeDb([candidates, CONNECTED_GH])
    const svc = new ExternalLinkRefreshService(db)

    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async () => ({ ok: true, status: 200, json: async () => ({ state: 'closed', merged: true, title: 'Merged PR' }) }) as any,
    )
    try {
      const summary = await svc.refreshStale(NOW)
      assert.equal(summary.scanned, 1)
      assert.equal(summary.selected, 1)
      assert.equal(summary.refreshed, 1)
      assert.equal(summary.skippedNoConnection, 0)
      assert.equal(fetchMock.mock.callCount(), 1)
      const [reqUrl] = fetchMock.mock.calls[0].arguments as [string]
      assert.match(String(reqUrl), /repos\/acme\/web\/pulls\/5/)
      // Wrote back merged status + fresh title + a lastRefreshedAt stamp.
      assert.equal(updates.length, 1)
      assert.equal(updates[0].status, 'merged')
      assert.equal(updates[0].title, 'Merged PR')
      assert.ok((updates[0].metadata as any).lastRefreshedAt)
    } finally {
      fetchMock.mock.restore()
    }
  })

  it('skips links whose workspace has no connected provider (env-gate), never calling the API', async () => {
    const candidates = [
      {
        id: 'l-stale',
        workspaceId: 'w1',
        provider: 'github',
        kind: 'pull_request',
        title: null,
        status: null,
        createdAt: new Date(NOW.getTime() - 30 * HOUR),
        metadata: { ref: { owner: 'acme', repo: 'web', number: '5' } },
      },
    ]
    // connection lookup returns [] → not connected
    const { db, updates } = makeDb([candidates, []])
    const svc = new ExternalLinkRefreshService(db)

    const fetchMock = mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }) as any)
    try {
      const summary = await svc.refreshStale(NOW)
      assert.equal(summary.selected, 1)
      assert.equal(summary.refreshed, 0)
      assert.equal(summary.skippedNoConnection, 1)
      assert.equal(fetchMock.mock.callCount(), 0, 'no live call when unconnected')
      assert.equal(updates.length, 0, 'no write-back when unconnected')
    } finally {
      fetchMock.mock.restore()
    }
  })

  it('does nothing when nothing is stale', async () => {
    const fresh = [
      {
        id: 'l-fresh',
        workspaceId: 'w1',
        provider: 'github',
        kind: 'pull_request',
        title: null,
        status: 'open',
        createdAt: NOW,
        metadata: { ref: {}, lastRefreshedAt: NOW.toISOString() },
      },
    ]
    const { db } = makeDb([fresh])
    const svc = new ExternalLinkRefreshService(db)
    const summary = await svc.refreshStale(NOW)
    assert.equal(summary.selected, 0)
    assert.equal(summary.refreshed, 0)
  })
})
