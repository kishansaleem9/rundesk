"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const tasks_service_1 = require("./tasks.service");
/**
 * Security regressions for the tasks module:
 *
 *   1. IDOR — `listAttachments` must gate on task READ access (workspace
 *      membership + private-container membership), not return signed R2 URLs for
 *      any task id.
 *   2. Cross-tenant object refs — `addAttachment` must reject a client
 *      `storageKey` that isn't under this task's own per-workspace R2 prefix, and
 *      must not let the `url` path smuggle a raw storage key.
 *   3. SSRF / token exfiltration — `fetchGitlabState` must never send the
 *      workspace OAuth token to a host derived from the pasted URL unless it's on
 *      the operator allowlist; off-allowlist hosts are skipped, and even
 *      allowlisted targets go through safeFetch (private/reserved IPs blocked).
 *   4. Private-container leak — `getTasksForWorkspace` must not return tasks in
 *      private spaces/projects the caller isn't a member of.
 *
 * Uses the repo's queued-thenable Drizzle stand-in: every db.select() pops the
 * next planned rows; insert captures its `.values()` payload.
 */
const VERBS = [
    'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy',
    'values', 'onConflictDoNothing', 'set', 'returning',
];
function node(rows) {
    const p = Promise.resolve(rows);
    for (const v of VERBS)
        p[v] = () => p;
    return p;
}
function makeDb(selectResults = []) {
    const selects = [...selectResults];
    const inserted = [];
    const deletes = [];
    const db = {
        select: node_test_1.mock.fn(() => node(selects.shift() ?? [])),
        insert: node_test_1.mock.fn(() => ({
            values: (v) => {
                inserted.push(v);
                return node([{ id: 'row-1', ...v }]);
            },
        })),
        update: node_test_1.mock.fn(() => ({ set: (v) => node([{ id: 'row-1', ...v }]) })),
        delete: node_test_1.mock.fn(() => {
            deletes.push(true);
            return node([]);
        }),
    };
    return { db, inserted, deletes };
}
function makeService(db, overrides = {}) {
    const realtime = { emitToTask: node_test_1.mock.fn(), emitToList: node_test_1.mock.fn(), emitToUser: node_test_1.mock.fn(), emitToWorkspace: node_test_1.mock.fn() };
    const search = { indexTaskAttachment: node_test_1.mock.fn(async () => undefined) };
    const r2 = overrides.r2 ?? { configured: false };
    return new tasks_service_1.TasksService(db, realtime, search, { fire: node_test_1.mock.fn(async () => undefined) }, // automations
    { fire: node_test_1.mock.fn(async () => undefined) }, // webhooks
    { notify: node_test_1.mock.fn(async () => undefined) }, // slack
    {}, // notifications
    r2, { deleteEverywhere: node_test_1.mock.fn(async () => undefined) }, // calendarSync
    { logAuditEvent: node_test_1.mock.fn(async () => undefined) });
}
// A task-context row shaped like assertTaskReadAccess's select.
const CTX = (over = {}) => [{
        taskId: 't1', listId: 'l1', createdById: 'u-creator', workspaceId: 'w1',
        spaceId: 's1', spaceVisibility: 'public', projectId: 'p1', projectVisibility: null,
        ...over,
    }];
// --- 1. listAttachments IDOR ------------------------------------------------
(0, node_test_1.describe)('TasksService.listAttachments — read-access gate (IDOR)', () => {
    const ATT = [{
            id: 'a1', fileName: 'secret.pdf', sizeBytes: 12, contentType: 'application/pdf',
            uploadedById: 'u1', createdAt: new Date('2026-01-01'),
            storageKey: 'workspaces/w1/tasks/t1/attachments/1-secret.pdf',
        }];
    (0, node_test_1.it)('accepts a plain workspace member on a public container and returns rows', async () => {
        const { db } = makeDb([CTX(), [{ role: 'member' }], ATT]);
        const svc = makeService(db);
        const out = await svc.listAttachments('t1', 'member-1');
        strict_1.default.equal(out.length, 1);
        strict_1.default.equal(out[0].id, 'a1');
        // r2 unconfigured → url falls back to the raw storage key (no signing).
        strict_1.default.equal(out[0].url, 'workspaces/w1/tasks/t1/attachments/1-secret.pdf');
    });
    (0, node_test_1.it)('rejects a non-member (no workspace membership row)', async () => {
        const { db } = makeDb([CTX(), []]);
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.listAttachments('t1', 'outsider'), /workspace not found/i);
        // The attachment query is never reached.
        strict_1.default.equal(db.select.mock.callCount(), 2);
    });
    (0, node_test_1.it)('rejects a workspace member who is not a member of the task\'s private space', async () => {
        const { db } = makeDb([
            CTX({ spaceVisibility: 'private' }),
            [{ role: 'member' }],
            [], // space-membership lookup empty
        ]);
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.listAttachments('t1', 'ws-member'), /private/i);
    });
    (0, node_test_1.it)('404s for a missing task before any membership work', async () => {
        const { db } = makeDb([[]]); // ctx lookup empty
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.listAttachments('missing', 'u1'), /task not found/i);
    });
});
// --- 2. addAttachment storageKey prefix ------------------------------------
(0, node_test_1.describe)('TasksService.addAttachment — storageKey prefix enforcement', () => {
    const mockWrite = (svc) => {
        svc.assertTaskWriteAccess = node_test_1.mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }));
    };
    (0, node_test_1.it)('rejects a storageKey pointing outside the task\'s own prefix (cross-tenant object)', async () => {
        const { db, inserted } = makeDb([]);
        const svc = makeService(db);
        mockWrite(svc);
        await strict_1.default.rejects(() => svc.addAttachment('t1', 'u1', {
            fileName: 'evil',
            storageKey: 'workspaces/other-ws/tasks/t9/attachments/steal.pdf',
            sizeBytes: 1024,
        }), /upload prefix/i);
        strict_1.default.equal(inserted.length, 0, 'nothing is stored when the key is rejected');
    });
    (0, node_test_1.it)('accepts a storageKey under this task\'s prefix and stores it verbatim', async () => {
        const key = 'workspaces/w1/tasks/t1/attachments/1700000000-file.pdf';
        const { db, inserted } = makeDb([[{ id: 't1' }]]); // task existence lookup
        const svc = makeService(db);
        mockWrite(svc);
        const out = await svc.addAttachment('t1', 'u1', {
            fileName: 'file.pdf', storageKey: key, contentType: 'application/pdf', sizeBytes: 1024,
        });
        strict_1.default.equal(inserted[0].storageKey, key);
        strict_1.default.equal(out.storageKey, key);
    });
    (0, node_test_1.it)('keeps the URL-link path working for a genuine http(s) link', async () => {
        const { db, inserted } = makeDb([[{ id: 't1' }]]);
        const svc = makeService(db);
        mockWrite(svc);
        await svc.addAttachment('t1', 'u1', {
            fileName: 'Design doc', url: 'https://example.com/doc', sizeBytes: 1024,
        });
        strict_1.default.equal(inserted[0].storageKey, 'https://example.com/doc');
    });
    (0, node_test_1.it)('rejects a `url` that is a raw storage key rather than an http(s) link', async () => {
        const { db, inserted } = makeDb([]);
        const svc = makeService(db);
        mockWrite(svc);
        await strict_1.default.rejects(() => svc.addAttachment('t1', 'u1', {
            fileName: 'evil',
            url: 'workspaces/other-ws/tasks/t9/attachments/steal.pdf',
            sizeBytes: 1024,
        }), /presign step/i);
        strict_1.default.equal(inserted.length, 0);
    });
});
// --- 3. fetchGitlabState SSRF ----------------------------------------------
(0, node_test_1.describe)('TasksService.fetchGitlabState — GitLab host allowlist (SSRF)', () => {
    (0, node_test_1.it)('skips (returns null, sends no token) when the pasted host is off the allowlist', async () => {
        delete process.env.GITLAB_ALLOWED_HOSTS;
        const svc = makeService(makeDb([]).db);
        const out = await svc.fetchGitlabState('pull_request', { projectPath: 'a/b', number: '1', host: 'gitlab.evil.com' }, 'super-secret-token');
        strict_1.default.equal(out, null);
    });
    (0, node_test_1.it)('gitlabAllowedHosts always includes gitlab.com and parses GITLAB_ALLOWED_HOSTS', async () => {
        const svc = makeService(makeDb([]).db);
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
        const svc = makeService(makeDb([]).db);
        try {
            await strict_1.default.rejects(() => svc.fetchGitlabState('issue', { projectPath: 'a/b', number: '1', host: '127.0.0.1' }, 'tok'), /private|reserved|blocked/i);
        }
        finally {
            delete process.env.GITLAB_ALLOWED_HOSTS;
        }
    });
});
// --- 4. getTasksForWorkspace private-container scoping ----------------------
(0, node_test_1.describe)('TasksService.getTasksForWorkspace — private-container scoping', () => {
    const ROWS = () => [
        { id: 't-pub', title: 'Public', spaceId: 's-pub', spaceVisibility: 'public', projectId: 'p-pub', projectVisibility: null },
        { id: 't-priv-space', title: 'Secret space', spaceId: 's-secret', spaceVisibility: 'private', projectId: 'p2', projectVisibility: null },
        { id: 't-priv-proj', title: 'Secret proj', spaceId: 's-pub', spaceVisibility: 'public', projectId: 'p-secret', projectVisibility: 'private' },
    ];
    (0, node_test_1.it)('hides private-space/project tasks from a plain member who is not a container member', async () => {
        const { db } = makeDb([
            ROWS(), // base task select
            [{ role: 'member' }], // workspace membership
            [], // actor's space memberships (none)
            [], // actor's project memberships (none)
        ]);
        const svc = makeService(db);
        const out = await svc.getTasksForWorkspace('w1', 500, { actorId: 'u-member', actorRole: 'member', includeAssignees: false });
        strict_1.default.deepEqual(out.map((r) => r.id), ['t-pub']);
        // Visibility helper columns are stripped from the response.
        strict_1.default.equal('spaceVisibility' in out[0], false);
        strict_1.default.equal('projectVisibility' in out[0], false);
    });
    (0, node_test_1.it)('includes private containers the member actually belongs to', async () => {
        const { db } = makeDb([
            ROWS(),
            [{ role: 'member' }],
            [{ spaceId: 's-secret', role: 'member' }], // member of the private space
            [{ projectId: 'p-secret' }], // member of the private project
        ]);
        const svc = makeService(db);
        const out = await svc.getTasksForWorkspace('w1', 500, { actorId: 'u-member', actorRole: 'member', includeAssignees: false });
        strict_1.default.deepEqual(out.map((r) => r.id).sort(), ['t-priv-proj', 't-priv-space', 't-pub']);
    });
    (0, node_test_1.it)('a manager sees everything with no container-membership lookups', async () => {
        const { db } = makeDb([ROWS(), [{ role: 'workspace_admin' }]]);
        const svc = makeService(db);
        const out = await svc.getTasksForWorkspace('w1', 500, { actorId: 'u-admin', actorRole: 'member', includeAssignees: false });
        strict_1.default.equal(out.length, 3);
        strict_1.default.equal(db.select.mock.callCount(), 2, 'base select + membership only');
    });
    (0, node_test_1.it)('a platform super_admin bypasses filtering without a membership row', async () => {
        const { db } = makeDb([ROWS()]); // only the base select is issued
        const svc = makeService(db);
        const out = await svc.getTasksForWorkspace('w1', 500, { actorId: 'root', actorRole: 'super_admin', includeAssignees: false });
        strict_1.default.equal(out.length, 3);
        strict_1.default.equal(db.select.mock.callCount(), 1, 'no membership lookups for super_admin');
    });
    (0, node_test_1.it)('stays unfiltered when no actor is supplied (internal callers)', async () => {
        const { db } = makeDb([ROWS()]);
        const svc = makeService(db);
        const out = await svc.getTasksForWorkspace('w1', 500, { includeAssignees: false });
        strict_1.default.equal(out.length, 3);
        strict_1.default.equal(db.select.mock.callCount(), 1);
    });
});
//# sourceMappingURL=tasks-security.test.js.map