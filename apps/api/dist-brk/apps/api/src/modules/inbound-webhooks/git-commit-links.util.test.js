"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const git_commit_links_util_1 = require("./git-commit-links.util");
/**
 * §12.8 — commit-message → task-reference parsing for the inbound push webhook.
 * Pure, no DB / no network.
 */
const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UUID_B = 'a1b2c3d4-e5f6-4789-abcd-0123456789ab';
(0, node_test_1.describe)('parseTaskRefsFromMessage — reference markers', () => {
    (0, node_test_1.it)('matches the conventional RD-<uuid> token', () => {
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(`fix login flow RD-${UUID_A}`), [UUID_A]);
    });
    (0, node_test_1.it)('matches the #<uuid> token', () => {
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(`bugfix #${UUID_A}`), [UUID_A]);
    });
    (0, node_test_1.it)('matches a pasted deep-link ?task=<uuid> query param', () => {
        const msg = `see https://app.rundesk.com/app/w/s/p/l?task=${UUID_A} for context`;
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(msg), [UUID_A]);
    });
    (0, node_test_1.it)('matches /task/<uuid> and /tasks/<uuid> path forms', () => {
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(`ref /task/${UUID_A}`), [UUID_A]);
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(`ref /tasks/${UUID_A}`), [UUID_A]);
    });
    (0, node_test_1.it)('is case-insensitive on the RD- marker and lower-cases the id', () => {
        const upper = UUID_A.toUpperCase();
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(`rd-${upper}`), [UUID_A]);
    });
    (0, node_test_1.it)('extracts multiple distinct refs and de-duplicates', () => {
        const msg = `RD-${UUID_A} and #${UUID_B} plus a dup RD-${UUID_A}`;
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(msg), [UUID_A, UUID_B]);
    });
    (0, node_test_1.it)('handles a multi-line message (subject + body trailer)', () => {
        const msg = `feat: add export\n\nDetails here.\n\nCloses RD-${UUID_B}`;
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(msg), [UUID_B]);
    });
    (0, node_test_1.it)('returns [] when there is no marker (bare uuid is ignored)', () => {
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(`chore: bump deps ${UUID_A}`), []);
    });
    (0, node_test_1.it)('does not match RD- glued to a preceding word char (word boundary)', () => {
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(`wordRD-${UUID_A}`), []);
    });
    (0, node_test_1.it)('returns [] for empty / null / undefined', () => {
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(''), []);
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(null), []);
        strict_1.default.deepEqual((0, git_commit_links_util_1.parseTaskRefsFromMessage)(undefined), []);
    });
});
(0, node_test_1.describe)('normalizePushCommits', () => {
    (0, node_test_1.it)('normalizes a GitHub push payload', () => {
        const payload = {
            ref: 'refs/heads/main',
            repository: { full_name: 'acme/webapp' },
            commits: [
                { id: 'abcdef1234567890', message: `fix RD-${UUID_A}`, url: 'https://github.com/acme/webapp/commit/abcdef1234567890', author: { name: 'Dev' } },
                { id: 'deadbeefcafebabe', message: 'no ref here', url: 'https://github.com/acme/webapp/commit/deadbeefcafebabe' },
            ],
        };
        const out = (0, git_commit_links_util_1.normalizePushCommits)('github', payload);
        strict_1.default.equal(out.length, 2);
        strict_1.default.equal(out[0].sha, 'abcdef1234567890');
        strict_1.default.equal(out[0].repoSlug, 'acme/webapp');
        strict_1.default.equal(out[0].authorName, 'Dev');
        strict_1.default.equal(out[0].message, `fix RD-${UUID_A}`);
    });
    (0, node_test_1.it)('normalizes a GitLab push payload (path_with_namespace + username author)', () => {
        const payload = {
            object_kind: 'push',
            project: { path_with_namespace: 'group/sub/webapp' },
            commits: [{ id: 'aaaaaaaaaaaa', message: `#${UUID_B}`, url: 'https://gitlab.com/group/sub/webapp/-/commit/aaaaaaaaaaaa', author: { username: 'gluser' } }],
        };
        const out = (0, git_commit_links_util_1.normalizePushCommits)('gitlab', payload);
        strict_1.default.equal(out.length, 1);
        strict_1.default.equal(out[0].repoSlug, 'group/sub/webapp');
        strict_1.default.equal(out[0].authorName, 'gluser');
    });
    (0, node_test_1.it)('returns [] for missing / malformed payloads', () => {
        strict_1.default.deepEqual((0, git_commit_links_util_1.normalizePushCommits)('github', null), []);
        strict_1.default.deepEqual((0, git_commit_links_util_1.normalizePushCommits)('github', {}), []);
        strict_1.default.deepEqual((0, git_commit_links_util_1.normalizePushCommits)('github', { commits: 'nope' }), []);
    });
    (0, node_test_1.it)('skips commits without a sha', () => {
        const out = (0, git_commit_links_util_1.normalizePushCommits)('github', { repository: { full_name: 'a/b' }, commits: [{ message: 'x' }] });
        strict_1.default.equal(out.length, 0);
    });
});
(0, node_test_1.describe)('buildCommitLinkFields — matches external-links.util commit shape', () => {
    (0, node_test_1.it)('builds GitHub owner/repo ref and <slug>@<sha> external id', () => {
        const f = (0, git_commit_links_util_1.buildCommitLinkFields)('github', 'acme/webapp', 'abcdef1234567890');
        strict_1.default.equal(f.externalId, 'acme/webapp@abcdef1234567890');
        strict_1.default.equal(f.title, 'acme/webapp@abcdef1');
        strict_1.default.deepEqual(f.ref, { owner: 'acme', repo: 'webapp', sha: 'abcdef1234567890' });
    });
    (0, node_test_1.it)('builds GitLab projectPath ref', () => {
        const f = (0, git_commit_links_util_1.buildCommitLinkFields)('gitlab', 'group/sub/webapp', 'aaaaaaabbbbb');
        strict_1.default.equal(f.externalId, 'group/sub/webapp@aaaaaaabbbbb');
        strict_1.default.deepEqual(f.ref, { projectPath: 'group/sub/webapp', sha: 'aaaaaaabbbbb' });
    });
    (0, node_test_1.it)('shortSha shortens hex shas but leaves non-hex untouched', () => {
        strict_1.default.equal((0, git_commit_links_util_1.shortSha)('abcdef1234567890'), 'abcdef1');
        strict_1.default.equal((0, git_commit_links_util_1.shortSha)('HEAD'), 'HEAD');
    });
});
//# sourceMappingURL=git-commit-links.util.test.js.map