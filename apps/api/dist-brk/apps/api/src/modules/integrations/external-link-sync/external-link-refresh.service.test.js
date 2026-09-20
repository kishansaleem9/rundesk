"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const external_link_refresh_service_1 = require("./external-link-refresh.service");
/**
 * §12.2 / §12.8 — background sync cron. Three layers:
 *   1. `selectStaleLinks` — pure selection/cadence (which links, how many, order).
 *   2. `refreshStale` — DB mocked + the provider-fetch seam (`fetchState`)
 *      stubbed: proves the env-gate on the provider connection and that state is
 *      written back, without any live HTTP.
 *   3. `fetchGitlabState` — SSRF / token-exfiltration guard: a pasted host must
 *      NEVER receive the workspace OAuth token unless it's on the operator
 *      allowlist, and even allowlisted targets go through safeFetch (which
 *      blocks private/reserved IPs). Mirrors TasksService's hardened path so the
 *      cron and the manual "refresh" button enforce the same allowlist.
 */
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-07-16T12:00:00Z');
function link(over) {
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
    };
}
(0, node_test_1.describe)('selectStaleLinks — cadence + selection', () => {
    (0, node_test_1.it)('selects links whose lastRefreshedAt is older than maxAgeHours', () => {
        const links = [
            link({ id: 'stale', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 8 * HOUR).toISOString() } }),
            link({ id: 'fresh', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 1 * HOUR).toISOString() } }),
        ];
        const out = (0, external_link_refresh_service_1.selectStaleLinks)(links, NOW, 6, 50);
        strict_1.default.deepEqual(out.map((l) => l.id), ['stale']);
    });
    (0, node_test_1.it)('falls back to createdAt when no lastRefreshedAt has been recorded', () => {
        const links = [
            link({ id: 'never-refreshed-old', metadata: {}, createdAt: new Date(NOW.getTime() - 10 * HOUR) }),
            link({ id: 'never-refreshed-new', metadata: {}, createdAt: new Date(NOW.getTime() - 2 * HOUR) }),
        ];
        const out = (0, external_link_refresh_service_1.selectStaleLinks)(links, NOW, 6, 50);
        strict_1.default.deepEqual(out.map((l) => l.id), ['never-refreshed-old']);
    });
    (0, node_test_1.it)('orders oldest-refreshed first and caps at batchSize', () => {
        const links = [
            link({ id: 'a', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 7 * HOUR).toISOString() } }),
            link({ id: 'b', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 20 * HOUR).toISOString() } }),
            link({ id: 'c', metadata: { lastRefreshedAt: new Date(NOW.getTime() - 9 * HOUR).toISOString() } }),
        ];
        const out = (0, external_link_refresh_service_1.selectStaleLinks)(links, NOW, 6, 2);
        strict_1.default.deepEqual(out.map((l) => l.id), ['b', 'c'], 'oldest first, limited to 2');
    });
    (0, node_test_1.it)('returns [] when nothing is stale', () => {
        const links = [link({ metadata: { lastRefreshedAt: NOW.toISOString() } })];
        strict_1.default.deepEqual((0, external_link_refresh_service_1.selectStaleLinks)(links, NOW, 6, 50), []);
    });
});
/** Chainable drizzle stand-in with a queue of select results + captured updates. */
function makeDb(selectResults) {
    const queue = [...selectResults];
    const updates = [];
    const VERBS = ['from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin'];
    const node = (rows) => {
        const p = Promise.resolve(rows);
        for (const v of VERBS)
            p[v] = () => p;
        return p;
    };
    const db = {
        select: node_test_1.mock.fn(() => node(queue.shift() ?? [])),
        update: node_test_1.mock.fn(() => ({
            set: (v) => ({
                where: () => {
                    updates.push(v);
                    return Promise.resolve([]);
                },
            }),
        })),
    };
    return { db, updates };
}
const CONNECTED_GH = [{ status: 'connected', accessToken: 'gh-token' }];
(0, node_test_1.describe)('ExternalLinkRefreshService.refreshStale — gating + write-back', () => {
    (0, node_test_1.it)('refreshes stale PR links when the provider is connected', async () => {
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
        ];
        // selects: [candidate pool, connection lookup]
        const { db, updates } = makeDb([candidates, CONNECTED_GH]);
        const svc = new external_link_refresh_service_1.ExternalLinkRefreshService(db);
        // Stub the provider-fetch seam so the test stays network-free (the live HTTP
        // path is safeFetch, exercised by the SSRF-guard tests below).
        const fetchState = node_test_1.mock.fn(async (..._args) => ({
            status: 'merged',
            title: 'Merged PR',
            metadata: { state: 'closed' },
        }));
        svc.fetchState = fetchState;
        const summary = await svc.refreshStale(NOW);
        strict_1.default.equal(summary.scanned, 1);
        strict_1.default.equal(summary.selected, 1);
        strict_1.default.equal(summary.refreshed, 1);
        strict_1.default.equal(summary.skippedNoConnection, 0);
        // Called once with the connected token + the parsed ref (proves gating).
        strict_1.default.equal(fetchState.mock.callCount(), 1);
        const args = fetchState.mock.calls[0].arguments;
        strict_1.default.equal(args[0], 'github');
        strict_1.default.equal(args[1], 'pull_request');
        strict_1.default.deepEqual(args[2], { owner: 'acme', repo: 'web', number: '5' });
        strict_1.default.equal(args[3], 'gh-token');
        // Wrote back merged status + fresh title + a lastRefreshedAt stamp.
        strict_1.default.equal(updates.length, 1);
        strict_1.default.equal(updates[0].status, 'merged');
        strict_1.default.equal(updates[0].title, 'Merged PR');
        strict_1.default.ok(updates[0].metadata.lastRefreshedAt);
    });
    (0, node_test_1.it)('skips links whose workspace has no connected provider (env-gate), never calling the API', async () => {
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
        ];
        // connection lookup returns [] → not connected
        const { db, updates } = makeDb([candidates, []]);
        const svc = new external_link_refresh_service_1.ExternalLinkRefreshService(db);
        const fetchState = node_test_1.mock.fn(async () => {
            throw new Error('fetchState must not run when the provider is unconnected');
        });
        svc.fetchState = fetchState;
        const summary = await svc.refreshStale(NOW);
        strict_1.default.equal(summary.selected, 1);
        strict_1.default.equal(summary.refreshed, 0);
        strict_1.default.equal(summary.skippedNoConnection, 1);
        strict_1.default.equal(fetchState.mock.callCount(), 0, 'no live call when unconnected');
        strict_1.default.equal(updates.length, 0, 'no write-back when unconnected');
    });
    (0, node_test_1.it)('does nothing when nothing is stale', async () => {
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
        ];
        const { db } = makeDb([fresh]);
        const svc = new external_link_refresh_service_1.ExternalLinkRefreshService(db);
        const summary = await svc.refreshStale(NOW);
        strict_1.default.equal(summary.selected, 0);
        strict_1.default.equal(summary.refreshed, 0);
    });
});
(0, node_test_1.describe)('ExternalLinkRefreshService.fetchGitlabState — GitLab host allowlist (SSRF)', () => {
    (0, node_test_1.it)('skips (returns null, sends no token) when the pasted host is off the allowlist', async () => {
        delete process.env.GITLAB_ALLOWED_HOSTS;
        const svc = new external_link_refresh_service_1.ExternalLinkRefreshService(makeDb([]).db);
        const out = await svc.fetchGitlabState('pull_request', { projectPath: 'a/b', number: '1', host: 'gitlab.evil.com' }, 'super-secret-token');
        strict_1.default.equal(out, null);
    });
    (0, node_test_1.it)('gitlabAllowedHosts always includes gitlab.com and parses GITLAB_ALLOWED_HOSTS', async () => {
        const svc = new external_link_refresh_service_1.ExternalLinkRefreshService(makeDb([]).db);
        delete process.env.GITLAB_ALLOWED_HOSTS;
        let hosts = svc.gitlabAllowedHosts();
        strict_1.default.equal(hosts.has('gitlab.com'), true);
        strict_1.default.equal(hosts.has('gitlab.evil.com'), false);
        process.env.GITLAB_ALLOWED_HOSTS = 'gitlab.internal.example.com, GITLAB.CORP.com ,';
        hosts = svc.gitlabAllowedHosts();
        strict_1.default.equal(hosts.has('gitlab.com'), true);
        strict_1.default.equal(hosts.has('gitlab.internal.example.com'), true);
        strict_1.default.equal(hosts.has('gitlab.corp.com'), true, 'entries are trimmed + lowercased');
        delete process.env.GITLAB_ALLOWED_HOSTS;
    });
    (0, node_test_1.it)('admits an allowlisted host but still blocks a private/reserved IP target via safeFetch', async () => {
        // 127.0.0.1 on the allowlist ⇒ NOT skipped (would return null if skipped);
        // instead safeFetch's SSRF guard rejects the loopback target synchronously.
        process.env.GITLAB_ALLOWED_HOSTS = '127.0.0.1';
        const svc = new external_link_refresh_service_1.ExternalLinkRefreshService(makeDb([]).db);
        try {
            await strict_1.default.rejects(() => svc.fetchGitlabState('issue', { projectPath: 'a/b', number: '1', host: '127.0.0.1' }, 'tok'), /private|reserved|blocked/i);
        }
        finally {
            delete process.env.GITLAB_ALLOWED_HOSTS;
        }
    });
});
//# sourceMappingURL=external-link-refresh.service.test.js.map