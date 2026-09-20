"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const git_commit_links_service_1 = require("./git-commit-links.service");
/**
 * §12.8 — push → commit-link service. DB fully mocked; asserts the env-gate on
 * the provider connection, idempotency, and the persisted commit-link shape.
 */
const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
/** Chainable drizzle stand-in: a queue of select results + captured inserts. */
function makeDb(selectResults) {
    const queue = [...selectResults];
    const inserted = [];
    const VERBS = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy'];
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
                return Promise.resolve([]);
            },
        })),
    };
    return { db, inserted };
}
function githubPush(message) {
    return {
        repository: { full_name: 'acme/webapp' },
        commits: [
            {
                id: 'abcdef1234567890',
                message,
                url: 'https://github.com/acme/webapp/commit/abcdef1234567890',
                author: { name: 'Dev' },
            },
        ],
    };
}
(0, node_test_1.describe)('GitCommitLinksService.ingestPush', () => {
    (0, node_test_1.it)('auto-links a commit to a referenced task when the workspace has GitHub connected', async () => {
        // selects: [resolveWorkspace, isConnected, existing-link-check(empty)]
        const { db, inserted } = makeDb([[{ workspaceId: 'w1' }], [{ status: 'connected' }], []]);
        const svc = new git_commit_links_service_1.GitCommitLinksService(db);
        const summary = await svc.ingestPush('github', githubPush(`fix login RD-${UUID}`));
        strict_1.default.equal(summary.commitsScanned, 1);
        strict_1.default.equal(summary.referencesFound, 1);
        strict_1.default.equal(summary.linked, 1);
        strict_1.default.equal(summary.skippedNoConnection, 0);
        strict_1.default.equal(inserted.length, 1);
        strict_1.default.equal(inserted[0].taskId, UUID);
        strict_1.default.equal(inserted[0].workspaceId, 'w1');
        strict_1.default.equal(inserted[0].provider, 'github');
        strict_1.default.equal(inserted[0].kind, 'commit');
        strict_1.default.equal(inserted[0].externalId, 'acme/webapp@abcdef1234567890');
        strict_1.default.equal(inserted[0].url, 'https://github.com/acme/webapp/commit/abcdef1234567890');
        strict_1.default.equal(inserted[0].metadata.source, 'push_webhook');
        strict_1.default.equal(inserted[0].metadata.autoLinked, true);
        strict_1.default.deepEqual(inserted[0].metadata.ref, { owner: 'acme', repo: 'webapp', sha: 'abcdef1234567890' });
        strict_1.default.equal(inserted[0].createdById, null);
    });
    (0, node_test_1.it)('is idempotent: does not double-link a commit already linked to the task', async () => {
        // existing-link-check returns a row → skip insert
        const { db, inserted } = makeDb([[{ workspaceId: 'w1' }], [{ status: 'connected' }], [{ id: 'existing' }]]);
        const svc = new git_commit_links_service_1.GitCommitLinksService(db);
        const summary = await svc.ingestPush('github', githubPush(`redo RD-${UUID}`));
        strict_1.default.equal(summary.linked, 0);
        strict_1.default.equal(summary.skippedExisting, 1);
        strict_1.default.equal(inserted.length, 0);
    });
    (0, node_test_1.it)('env-gate: skips linking when the workspace has no GitHub connection', async () => {
        // isConnected returns [] → not connected; no existing-check, no insert
        const { db, inserted } = makeDb([[{ workspaceId: 'w1' }], []]);
        const svc = new git_commit_links_service_1.GitCommitLinksService(db);
        const summary = await svc.ingestPush('github', githubPush(`fix RD-${UUID}`));
        strict_1.default.equal(summary.linked, 0);
        strict_1.default.equal(summary.skippedNoConnection, 1);
        strict_1.default.equal(inserted.length, 0);
    });
    (0, node_test_1.it)('skips a reference whose task cannot be resolved to a workspace', async () => {
        const { db, inserted } = makeDb([[]]); // resolveWorkspace → empty
        const svc = new git_commit_links_service_1.GitCommitLinksService(db);
        const summary = await svc.ingestPush('github', githubPush(`fix #${UUID}`));
        strict_1.default.equal(summary.skippedUnknownTask, 1);
        strict_1.default.equal(summary.linked, 0);
        strict_1.default.equal(inserted.length, 0);
    });
    (0, node_test_1.it)('scans commits with no task reference without linking anything', async () => {
        const { db, inserted } = makeDb([]);
        const svc = new git_commit_links_service_1.GitCommitLinksService(db);
        const summary = await svc.ingestPush('github', githubPush('chore: bump deps'));
        strict_1.default.equal(summary.commitsScanned, 1);
        strict_1.default.equal(summary.referencesFound, 0);
        strict_1.default.equal(summary.linked, 0);
        strict_1.default.equal(inserted.length, 0);
    });
});
//# sourceMappingURL=git-commit-links.service.test.js.map