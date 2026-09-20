"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const external_links_util_1 = require("./external-links.util");
const tasks_service_1 = require("./tasks.service");
/**
 * §12.8 / §12.2 — task ↔ external-service links.
 *
 * Two layers:
 *   1. `parseExternalLinkUrl` — URL → provider/kind/external_id detection for
 *      GitHub + GitLab (commit/PR/issue), Google Drive (file), and the generic
 *      link fallback. Pure + deterministic, no DB.
 *   2. Link CRUD + access checks on `TasksService`, incl. the key guarantee
 *      that `status` stays null when no provider connection is configured
 *      (the live fetch is env-gated behind an integration connection).
 */
(0, node_test_1.describe)('parseExternalLinkUrl — GitHub', () => {
    (0, node_test_1.it)('detects a pull request', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://github.com/acme/webapp/pull/42');
        strict_1.default.equal(r.provider, 'github');
        strict_1.default.equal(r.kind, 'pull_request');
        strict_1.default.equal(r.externalId, 'acme/webapp#42');
        strict_1.default.deepEqual(r.ref, { owner: 'acme', repo: 'webapp', number: '42' });
    });
    (0, node_test_1.it)('detects a pull request with trailing path segments', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://github.com/acme/webapp/pull/42/files');
        strict_1.default.equal(r.kind, 'pull_request');
        strict_1.default.equal(r.ref.number, '42');
    });
    (0, node_test_1.it)('detects an issue', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://github.com/acme/webapp/issues/7');
        strict_1.default.equal(r.provider, 'github');
        strict_1.default.equal(r.kind, 'issue');
        strict_1.default.equal(r.externalId, 'acme/webapp#7');
    });
    (0, node_test_1.it)('detects a commit and shortens the sha in the title', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://github.com/acme/webapp/commit/abcdef1234567890');
        strict_1.default.equal(r.provider, 'github');
        strict_1.default.equal(r.kind, 'commit');
        strict_1.default.equal(r.externalId, 'acme/webapp@abcdef1234567890');
        strict_1.default.equal(r.ref.sha, 'abcdef1234567890');
        strict_1.default.match(r.title ?? '', /@abcdef1$/);
    });
    (0, node_test_1.it)('falls back to a generic github link for a repo root', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://github.com/acme/webapp');
        strict_1.default.equal(r.provider, 'github');
        strict_1.default.equal(r.kind, 'link');
        strict_1.default.equal(r.externalId, null);
    });
});
(0, node_test_1.describe)('parseExternalLinkUrl — GitLab', () => {
    (0, node_test_1.it)('detects a merge request (the /-/ separator)', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://gitlab.com/acme/group/webapp/-/merge_requests/12');
        strict_1.default.equal(r.provider, 'gitlab');
        strict_1.default.equal(r.kind, 'pull_request');
        strict_1.default.equal(r.externalId, 'acme/group/webapp!12');
        strict_1.default.equal(r.ref.projectPath, 'acme/group/webapp');
        strict_1.default.equal(r.ref.number, '12');
        strict_1.default.equal(r.ref.host, 'gitlab.com');
    });
    (0, node_test_1.it)('detects an issue', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://gitlab.com/acme/webapp/-/issues/99');
        strict_1.default.equal(r.provider, 'gitlab');
        strict_1.default.equal(r.kind, 'issue');
        strict_1.default.equal(r.externalId, 'acme/webapp#99');
    });
    (0, node_test_1.it)('detects a commit', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://gitlab.com/acme/webapp/-/commit/deadbeef12345');
        strict_1.default.equal(r.provider, 'gitlab');
        strict_1.default.equal(r.kind, 'commit');
        strict_1.default.equal(r.ref.sha, 'deadbeef12345');
    });
    (0, node_test_1.it)('detects a self-hosted GitLab MR by keyword shape', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://git.internal.example.com/team/svc/-/merge_requests/5');
        strict_1.default.equal(r.provider, 'gitlab');
        strict_1.default.equal(r.kind, 'pull_request');
        strict_1.default.equal(r.ref.host, 'git.internal.example.com');
        strict_1.default.equal(r.ref.projectPath, 'team/svc');
    });
});
(0, node_test_1.describe)('parseExternalLinkUrl — Google Drive', () => {
    (0, node_test_1.it)('detects a Drive file URL', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://drive.google.com/file/d/1AbC_dEfG/view?usp=sharing', 'google_drive');
        strict_1.default.equal(r.provider, 'google_drive');
        strict_1.default.equal(r.kind, 'file');
        strict_1.default.equal(r.externalId, '1AbC_dEfG');
        strict_1.default.equal(r.ref.fileId, '1AbC_dEfG');
    });
    (0, node_test_1.it)('detects a Google Docs URL as a file', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://docs.google.com/document/d/XYZ123/edit');
        strict_1.default.equal(r.provider, 'google_drive');
        strict_1.default.equal(r.kind, 'file');
        strict_1.default.equal(r.externalId, 'XYZ123');
    });
    (0, node_test_1.it)('detects the ?id= open form', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://drive.google.com/open?id=FILE_9');
        strict_1.default.equal(r.provider, 'google_drive');
        strict_1.default.equal(r.kind, 'file');
        strict_1.default.equal(r.ref.fileId, 'FILE_9');
    });
});
(0, node_test_1.describe)('parseExternalLinkUrl — Dropbox', () => {
    (0, node_test_1.it)('detects a legacy /s/ file share and reads the filename', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://www.dropbox.com/s/abc123/Q3-report.pdf?dl=0');
        strict_1.default.equal(r.provider, 'dropbox');
        strict_1.default.equal(r.kind, 'file');
        strict_1.default.equal(r.title, 'Q3-report.pdf');
        strict_1.default.equal(r.ref.fileId, 'abc123');
        strict_1.default.equal(r.ref.sharedUrl, 'https://www.dropbox.com/s/abc123/Q3-report.pdf?dl=0');
    });
    (0, node_test_1.it)('detects a current /scl/fi/ file share and decodes the filename', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://www.dropbox.com/scl/fi/xyz789/Design%20Spec.fig?rlkey=k&dl=0');
        strict_1.default.equal(r.provider, 'dropbox');
        strict_1.default.equal(r.kind, 'file');
        strict_1.default.equal(r.title, 'Design Spec.fig');
        strict_1.default.equal(r.ref.fileId, 'xyz789');
    });
    (0, node_test_1.it)('treats a folder share as a plain dropbox link', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://www.dropbox.com/scl/fo/folderid/rlkey?dl=0');
        strict_1.default.equal(r.provider, 'dropbox');
        strict_1.default.equal(r.kind, 'link');
        strict_1.default.equal(r.externalId, null);
    });
    (0, node_test_1.it)('honours a dropbox hint on an unrecognised URL', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://example.com/x', 'dropbox');
        strict_1.default.equal(r.provider, 'dropbox');
        strict_1.default.equal(r.kind, 'link');
    });
});
(0, node_test_1.describe)('parseExternalLinkUrl — generic + hints', () => {
    (0, node_test_1.it)('treats an unknown URL as a plain link', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://example.com/some/page');
        strict_1.default.equal(r.provider, 'link');
        strict_1.default.equal(r.kind, 'link');
        strict_1.default.equal(r.externalId, null);
    });
    (0, node_test_1.it)('honours a provider hint only for the generic case', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://example.com/x', 'google_drive');
        strict_1.default.equal(r.provider, 'google_drive');
        strict_1.default.equal(r.kind, 'link');
    });
    (0, node_test_1.it)('lets a recognised URL win over a mismatched hint', () => {
        const r = (0, external_links_util_1.parseExternalLinkUrl)('https://github.com/acme/webapp/pull/1', 'link');
        strict_1.default.equal(r.provider, 'github');
        strict_1.default.equal(r.kind, 'pull_request');
    });
    (0, node_test_1.it)('rejects non-URLs via isHttpUrl', () => {
        strict_1.default.equal((0, external_links_util_1.isHttpUrl)('not a url'), false);
        strict_1.default.equal((0, external_links_util_1.isHttpUrl)('ftp://x/y'), false);
        strict_1.default.equal((0, external_links_util_1.isHttpUrl)('https://github.com/a/b/pull/1'), true);
    });
});
// --- Service: CRUD + access + env-gated status ----------------------------
/** Minimal drizzle stand-in that records insert values and returns them back. */
function makeCaptureDb(selects) {
    const queue = [...selects];
    const inserted = [];
    const deletes = [];
    const VERBS = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'set', 'returning', 'onConflictDoNothing'];
    const node = (rows) => {
        const p = Promise.resolve(rows);
        for (const v of VERBS)
            p[v] = () => p;
        return p;
    };
    const db = {
        select: node_test_1.mock.fn(() => node(queue.shift() ?? [])),
        insert: node_test_1.mock.fn(() => ({
            values: (v) => {
                inserted.push(v);
                return node([{ id: 'link-1', ...v }]);
            },
        })),
        // `.set(v)` echoes the patched row back through `.returning()` so
        // update-then-return flows (recording attach) can assert the result.
        update: node_test_1.mock.fn(() => ({ set: (v) => node([{ id: 'link-1', ...v }]) })),
        delete: node_test_1.mock.fn(() => {
            deletes.push(true);
            return node([]);
        }),
    };
    return { db, inserted, deletes };
}
function makeService(db) {
    return new tasks_service_1.TasksService(db, {}, {}, {}, {}, {}, {}, {}, {}, {});
}
const CTX = [{ taskId: 't1', listId: 'l1', createdById: 'u-creator', workspaceId: 'w1' }];
const ADMIN = [{ role: 'workspace_admin' }];
(0, node_test_1.describe)('TasksService external links — CRUD + access', () => {
    (0, node_test_1.it)('persists a GitHub PR link with status null when no provider connection is configured', async () => {
        // selects: task ctx, membership, provider-connection (empty → unconfigured)
        const { db, inserted } = makeCaptureDb([CTX, ADMIN, []]);
        const svc = makeService(db);
        const row = await svc.addExternalLink('t1', 'u1', {
            url: 'https://github.com/acme/webapp/pull/42',
            provider: 'github',
        });
        strict_1.default.equal(inserted.length, 1);
        strict_1.default.equal(inserted[0].provider, 'github');
        strict_1.default.equal(inserted[0].kind, 'pull_request');
        strict_1.default.equal(inserted[0].externalId, 'acme/webapp#42');
        strict_1.default.equal(inserted[0].status, null, 'status stays null when unconfigured (env-gated)');
        strict_1.default.equal(inserted[0].workspaceId, 'w1');
        strict_1.default.deepEqual(inserted[0].metadata.ref, { owner: 'acme', repo: 'webapp', number: '42' });
        strict_1.default.equal(row.status, null);
    });
    (0, node_test_1.it)('persists a Drive file link (unconfigured) with kind=file, status null', async () => {
        const { db, inserted } = makeCaptureDb([CTX, ADMIN, []]);
        const svc = makeService(db);
        await svc.addExternalLink('t1', 'u1', {
            url: 'https://drive.google.com/file/d/FILE_1/view',
            provider: 'google_drive',
        });
        strict_1.default.equal(inserted[0].provider, 'google_drive');
        strict_1.default.equal(inserted[0].kind, 'file');
        strict_1.default.equal(inserted[0].externalId, 'FILE_1');
        strict_1.default.equal(inserted[0].status, null);
    });
    (0, node_test_1.it)('persists a Dropbox file link (unconfigured) with kind=file, status null', async () => {
        const { db, inserted } = makeCaptureDb([CTX, ADMIN, []]);
        const svc = makeService(db);
        await svc.addExternalLink('t1', 'u1', {
            url: 'https://www.dropbox.com/s/abc123/spec.pdf?dl=0',
            provider: 'dropbox',
        });
        strict_1.default.equal(inserted[0].provider, 'dropbox');
        strict_1.default.equal(inserted[0].kind, 'file');
        strict_1.default.equal(inserted[0].externalId, 'abc123');
        strict_1.default.equal(inserted[0].status, null, 'status stays null when Dropbox is not connected (env-gated)');
        strict_1.default.equal(inserted[0].metadata.ref.sharedUrl, 'https://www.dropbox.com/s/abc123/spec.pdf?dl=0');
    });
    // --- §12.6 — attach a link (e.g. Dropbox file) to a specific comment -------
    (0, node_test_1.it)('persists a commentId when the comment belongs to the task', async () => {
        // selects: task ctx, membership, comment lookup (on this task), connection (empty)
        const { db, inserted } = makeCaptureDb([CTX, ADMIN, [{ taskId: 't1' }], []]);
        const svc = makeService(db);
        const row = await svc.addExternalLink('t1', 'u1', {
            url: 'https://www.dropbox.com/s/abc123/spec.pdf?dl=0',
            provider: 'dropbox',
            commentId: 'c1',
        });
        strict_1.default.equal(inserted.length, 1);
        strict_1.default.equal(inserted[0].commentId, 'c1', 'the comment scope is persisted');
        strict_1.default.equal(inserted[0].provider, 'dropbox');
        strict_1.default.equal(inserted[0].kind, 'file');
        strict_1.default.equal(row.commentId, 'c1');
    });
    (0, node_test_1.it)('rejects a commentId that belongs to a different task', async () => {
        // comment lookup returns a comment whose taskId != the target task
        const { db, inserted } = makeCaptureDb([CTX, ADMIN, [{ taskId: 't-other' }]]);
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.addExternalLink('t1', 'u1', {
            url: 'https://www.dropbox.com/s/abc123/spec.pdf?dl=0',
            provider: 'dropbox',
            commentId: 'c-foreign',
        }), /does not belong to this task/i);
        strict_1.default.equal(inserted.length, 0, 'nothing is inserted when validation fails');
    });
    (0, node_test_1.it)('rejects a commentId that does not exist', async () => {
        // comment lookup returns no row
        const { db } = makeCaptureDb([CTX, ADMIN, []]);
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.addExternalLink('t1', 'u1', {
            url: 'https://example.com/spec',
            commentId: 'c-missing',
        }), /does not belong to this task/i);
    });
    (0, node_test_1.it)('keeps task-level links working: commentId null and no comment lookup when omitted', async () => {
        // Only task ctx + membership selects — no comment lookup, no connection query.
        const { db, inserted } = makeCaptureDb([CTX, ADMIN]);
        const svc = makeService(db);
        await svc.addExternalLink('t1', 'u1', { url: 'https://example.com/spec' });
        strict_1.default.equal(inserted[0].commentId, null, 'task-level link stores commentId null');
        strict_1.default.equal(db.select.mock.callCount(), 2, 'no comment-belongs-to-task lookup when commentId omitted');
    });
    (0, node_test_1.it)('lists links attached to a specific comment', async () => {
        const links = [{ id: 'link-1', provider: 'dropbox', kind: 'file', url: 'u', commentId: 'c1' }];
        const { db } = makeCaptureDb([CTX, ADMIN, links]);
        const svc = makeService(db);
        const out = await svc.listExternalLinksForComment('t1', 'c1', 'u1');
        strict_1.default.deepEqual(out, links);
    });
    (0, node_test_1.it)('persists a generic link without any provider-connection lookup', async () => {
        // Only task ctx + membership selects; no connection query for provider=link.
        const { db, inserted } = makeCaptureDb([CTX, ADMIN]);
        const svc = makeService(db);
        await svc.addExternalLink('t1', 'u1', { url: 'https://example.com/spec' });
        strict_1.default.equal(inserted[0].provider, 'link');
        strict_1.default.equal(inserted[0].kind, 'link');
        strict_1.default.equal(db.select.mock.callCount(), 2, 'no connection lookup for a generic link');
    });
    (0, node_test_1.it)('rejects a non-http URL after the access check', async () => {
        const { db } = makeCaptureDb([CTX, ADMIN]);
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.addExternalLink('t1', 'u1', { url: 'javascript:alert(1)' }), /valid http/i);
    });
    (0, node_test_1.it)('denies a guest (access check)', async () => {
        const { db } = makeCaptureDb([CTX, [{ role: 'guest' }]]);
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.addExternalLink('t1', 'guest-user', { url: 'https://github.com/a/b/pull/1' }), /guest/i);
    });
    (0, node_test_1.it)('denies a non-member (access check)', async () => {
        const { db } = makeCaptureDb([CTX, []]); // no membership row
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.addExternalLink('t1', 'outsider', { url: 'https://github.com/a/b/pull/1' }), /workspace not found/i);
    });
    (0, node_test_1.it)('lists links for a task', async () => {
        const links = [{ id: 'link-1', provider: 'github', kind: 'pull_request', url: 'u', status: 'open' }];
        const { db } = makeCaptureDb([CTX, ADMIN, links]);
        const svc = makeService(db);
        const out = await svc.listExternalLinks('t1', 'u1');
        strict_1.default.deepEqual(out, links);
    });
    (0, node_test_1.it)('removes a link and returns ok', async () => {
        const { db, deletes } = makeCaptureDb([CTX, ADMIN]);
        const svc = makeService(db);
        const out = await svc.removeExternalLink('t1', 'link-1', 'u1');
        strict_1.default.deepEqual(out, { ok: true });
        strict_1.default.equal(deletes.length, 1);
    });
});
// --- Meetings: create + persistence + not-connected 400 (§12.9) -----------
//
// The provider API is fully mocked (no live Zoom / Google calls). We assert
// the persisted task_external_links meeting row, that the task's due date
// seeds the meeting start_time, and the clean "connect {provider} first" 400
// when the provider isn't connected.
(0, node_test_1.describe)('TasksService meetings — Zoom / Google Meet', () => {
    (0, node_test_1.it)('creates a Zoom meeting and persists a meeting link with the due date as start_time', async () => {
        const future = new Date(Date.now() + 3_600_000);
        const conn = [{ id: 'conn-1', status: 'connected', accessToken: 'tok', refreshToken: null, tokenExpiresAt: future }];
        const task = [{ title: 'Design review', dueDate: new Date('2026-08-01T10:00:00Z') }];
        const { db, inserted } = makeCaptureDb([CTX, ADMIN, task, conn]);
        const svc = makeService(db);
        const fetchMock = node_test_1.mock.method(globalThis, 'fetch', async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                id: 88,
                join_url: 'https://zoom.us/j/88',
                topic: 'Design review',
                start_time: '2026-08-01T10:00:00Z',
            }),
        }));
        try {
            const row = await svc.createTaskMeeting('t1', 'u1', 'zoom');
            strict_1.default.equal(inserted.length, 1);
            strict_1.default.equal(inserted[0].provider, 'zoom');
            strict_1.default.equal(inserted[0].kind, 'meeting');
            strict_1.default.equal(inserted[0].url, 'https://zoom.us/j/88');
            strict_1.default.equal(inserted[0].externalId, '88');
            strict_1.default.equal(inserted[0].status, null);
            strict_1.default.equal(row.url, 'https://zoom.us/j/88');
            // Exactly one live call (no token refresh — the token is still fresh).
            strict_1.default.equal(fetchMock.mock.callCount(), 1);
            const [reqUrl, reqInit] = fetchMock.mock.calls[0].arguments;
            strict_1.default.match(String(reqUrl), /users\/me\/meetings/);
            const sentBody = JSON.parse(String(reqInit.body));
            strict_1.default.equal(sentBody.start_time, '2026-08-01T10:00:00.000Z');
            strict_1.default.equal(sentBody.type, 2);
        }
        finally {
            fetchMock.mock.restore();
        }
    });
    (0, node_test_1.it)('creates a Google Meet meeting reusing the gcal connection', async () => {
        const future = new Date(Date.now() + 3_600_000);
        const conn = [{ id: 'conn-2', status: 'connected', accessToken: 'gtok', refreshToken: null, tokenExpiresAt: future }];
        const task = [{ title: 'Standup', dueDate: null }];
        const { db, inserted } = makeCaptureDb([CTX, ADMIN, task, conn]);
        const svc = makeService(db);
        const fetchMock = node_test_1.mock.method(globalThis, 'fetch', async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                id: 'evt1',
                hangoutLink: 'https://meet.google.com/abc-defg-hij',
                htmlLink: 'https://calendar.google.com/event',
            }),
        }));
        try {
            await svc.createTaskMeeting('t1', 'u1', 'google_meet');
            strict_1.default.equal(inserted[0].provider, 'google_meet');
            strict_1.default.equal(inserted[0].kind, 'meeting');
            strict_1.default.equal(inserted[0].url, 'https://meet.google.com/abc-defg-hij');
            const [reqUrl] = fetchMock.mock.calls[0].arguments;
            strict_1.default.match(String(reqUrl), /conferenceDataVersion=1/);
        }
        finally {
            fetchMock.mock.restore();
        }
    });
    (0, node_test_1.it)('rejects with a clean "connect zoom first" 400 when the provider is not connected', async () => {
        const task = [{ title: 'X', dueDate: null }];
        const { db } = makeCaptureDb([CTX, ADMIN, task, []]); // empty connection lookup
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.createTaskMeeting('t1', 'u1', 'zoom'), /connect zoom first/i);
    });
    (0, node_test_1.it)('attaches a recording link to a meeting row', async () => {
        const meetingLink = [{ id: 'link-1', taskId: 't1', kind: 'meeting', metadata: { meeting: { id: '88' } } }];
        const { db, inserted: _i } = makeCaptureDb([CTX, ADMIN, meetingLink]);
        void _i;
        const svc = makeService(db);
        const updated = await svc.attachMeetingRecording('t1', 'link-1', 'u1', 'https://zoom.us/rec/xyz');
        strict_1.default.equal(updated.metadata.recordingUrl, 'https://zoom.us/rec/xyz');
    });
    (0, node_test_1.it)('rejects attaching a recording to a non-meeting link', async () => {
        const fileLink = [{ id: 'link-2', taskId: 't1', kind: 'file', metadata: {} }];
        const { db } = makeCaptureDb([CTX, ADMIN, fileLink]);
        const svc = makeService(db);
        await strict_1.default.rejects(() => svc.attachMeetingRecording('t1', 'link-2', 'u1', 'https://x.com/rec'), /not a meeting/i);
    });
});
//# sourceMappingURL=external-links.test.js.map