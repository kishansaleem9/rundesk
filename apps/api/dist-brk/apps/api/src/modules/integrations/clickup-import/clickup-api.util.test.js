"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const clickup_api_util_1 = require("./clickup-api.util");
/**
 * §12.5 gap-closer — the ClickUp REST client that fetches the comments +
 * attachments a CSV export cannot carry. All HTTP is mocked via an injected
 * `fetchImpl` (real `Response` objects), so parsing, cursor pagination, 429
 * backoff, and defensive download behaviour are exercised without a network.
 */
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
(0, node_test_1.describe)('clickup-api pure helpers', () => {
    (0, node_test_1.it)('extractCommentText prefers comment_text, falls back to segments', () => {
        strict_1.default.equal((0, clickup_api_util_1.extractCommentText)({ id: '1', comment_text: 'flat' }), 'flat');
        strict_1.default.equal((0, clickup_api_util_1.extractCommentText)({ id: '1', comment: [{ text: 'a' }, { text: 'b' }] }), 'ab');
        strict_1.default.equal((0, clickup_api_util_1.extractCommentText)({ id: '1' }), '');
    });
    (0, node_test_1.it)('clickupDate parses epoch-ms strings and rejects junk', () => {
        strict_1.default.ok((0, clickup_api_util_1.clickupDate)('1700000000000') instanceof Date);
        strict_1.default.equal((0, clickup_api_util_1.clickupDate)(undefined), undefined);
        strict_1.default.equal((0, clickup_api_util_1.clickupDate)('not-a-number'), undefined);
        strict_1.default.equal((0, clickup_api_util_1.clickupDate)('0'), undefined);
    });
    (0, node_test_1.it)('safeAttachmentName strips unsafe chars and never yields empty', () => {
        strict_1.default.equal((0, clickup_api_util_1.safeAttachmentName)('my file (1).png'), 'my_file_1_.png');
        // Empty (or all-stripped-to-empty) input falls back to a stable default.
        strict_1.default.equal((0, clickup_api_util_1.safeAttachmentName)(''), 'attachment');
        // A non-empty run of unsafe chars collapses to a single underscore.
        strict_1.default.equal((0, clickup_api_util_1.safeAttachmentName)('***'), '_');
    });
});
(0, node_test_1.describe)('ClickUpApiClient.getTaskComments', () => {
    (0, node_test_1.it)('parses one page and returns comments oldest-first', async () => {
        const calls = [];
        const fetchImpl = async (input) => {
            calls.push(String(input));
            // ClickUp returns newest-first.
            return json({
                comments: [
                    { id: 'c2', comment_text: 'second', date: '200' },
                    { id: 'c1', comment_text: 'first', date: '100' },
                ],
            });
        };
        const client = new clickup_api_util_1.ClickUpApiClient({ apiToken: 'tok', fetchImpl });
        const comments = await client.getTaskComments('task-1');
        strict_1.default.deepEqual(comments.map((c) => c.id), ['c1', 'c2']);
        strict_1.default.equal(calls.length, 1);
        strict_1.default.match(calls[0], /\/task\/task-1\/comment$/);
    });
    (0, node_test_1.it)('follows the start/start_id cursor across pages', async () => {
        const calls = [];
        const page1 = Array.from({ length: 25 }, (_, i) => ({
            id: `p1-${i}`,
            comment_text: `c${i}`,
            date: String(1000 + i),
        }));
        const fetchImpl = async (input) => {
            const url = String(input);
            calls.push(url);
            if (!url.includes('start'))
                return json({ comments: page1 });
            return json({ comments: [{ id: 'p2-0', comment_text: 'last', date: '2000' }] });
        };
        const client = new clickup_api_util_1.ClickUpApiClient({ apiToken: 'tok', fetchImpl });
        const comments = await client.getTaskComments('task-1');
        strict_1.default.equal(comments.length, 26);
        strict_1.default.equal(calls.length, 2);
        // The oldest comment of page 1 (id p1-24, date 1024) drives page 2's cursor.
        strict_1.default.match(calls[1], /start=1024/);
        strict_1.default.match(calls[1], /start_id=p1-24/);
    });
    (0, node_test_1.it)('throws on a hard HTTP error (caller collects it)', async () => {
        const fetchImpl = async () => new Response('nope', { status: 500 });
        const client = new clickup_api_util_1.ClickUpApiClient({ apiToken: 'tok', fetchImpl });
        await strict_1.default.rejects(() => client.getTaskComments('task-1'), /HTTP 500/);
    });
});
(0, node_test_1.describe)('ClickUpApiClient.getTaskAttachments', () => {
    (0, node_test_1.it)('reads attachments[] off the task object', async () => {
        const fetchImpl = async () => json({ attachments: [{ id: 'a1', title: 'x.png', mimetype: 'image/png', size: 9, url: 'u' }] });
        const client = new clickup_api_util_1.ClickUpApiClient({ apiToken: 'tok', fetchImpl });
        const atts = await client.getTaskAttachments('task-1');
        strict_1.default.equal(atts.length, 1);
        strict_1.default.equal(atts[0].title, 'x.png');
    });
    (0, node_test_1.it)('tolerates a task with no attachments field', async () => {
        const fetchImpl = async () => json({});
        const client = new clickup_api_util_1.ClickUpApiClient({ apiToken: 'tok', fetchImpl });
        strict_1.default.deepEqual(await client.getTaskAttachments('t'), []);
    });
});
(0, node_test_1.describe)('ClickUpApiClient.downloadAttachment', () => {
    const safeRes = (over = {}) => {
        const status = over.status ?? 200;
        const body = over.body ?? Buffer.from('hello');
        const headers = over.contentType ? { 'content-type': over.contentType } : {};
        return async () => ({ status, headers, body, text: () => body.toString('utf8') });
    };
    (0, node_test_1.it)('streams bytes on success (via the SSRF-guarded fetch)', async () => {
        const client = new clickup_api_util_1.ClickUpApiClient({
            apiToken: 'tok',
            safeFetchImpl: safeRes({ contentType: 'image/png' }),
        });
        const dl = await client.downloadAttachment({
            id: 'a',
            url: 'https://attachments.clickup.com/a.png',
            mimetype: 'image/png',
        });
        strict_1.default.ok(dl);
        strict_1.default.equal(dl.buffer.toString(), 'hello');
        strict_1.default.equal(dl.contentType, 'image/png');
    });
    (0, node_test_1.it)('returns null (never throws) on http error, network throw, or missing url', async () => {
        const notFound = new clickup_api_util_1.ClickUpApiClient({ apiToken: 'tok', safeFetchImpl: safeRes({ status: 404 }) });
        strict_1.default.equal(await notFound.downloadAttachment({ id: 'a', url: 'https://x/a' }), null);
        const throwing = new clickup_api_util_1.ClickUpApiClient({
            apiToken: 'tok',
            safeFetchImpl: async () => {
                throw new Error('network down');
            },
        });
        strict_1.default.equal(await throwing.downloadAttachment({ id: 'a', url: 'https://x/a' }), null);
        const ok = new clickup_api_util_1.ClickUpApiClient({ apiToken: 'tok', safeFetchImpl: safeRes() });
        strict_1.default.equal(await ok.downloadAttachment({ id: 'a' }), null);
    });
    (0, node_test_1.it)('blocks a private/reserved target via the real safeFetch guard → null (no injection)', async () => {
        // No safeFetchImpl → the real safeFetch is used. A literal link-local IP
        // (the cloud-metadata endpoint) is rejected synchronously, so no network
        // request is made and the download degrades to null.
        const client = new clickup_api_util_1.ClickUpApiClient({ apiToken: 'tok' });
        strict_1.default.equal(await client.downloadAttachment({ id: 'a', url: 'http://169.254.169.254/latest/meta-data/' }), null);
    });
});
(0, node_test_1.describe)('ClickUpApiClient rate limiting', () => {
    (0, node_test_1.it)('retries a 429 with bounded backoff then succeeds', async () => {
        let n = 0;
        const fetchImpl = async () => {
            n++;
            if (n === 1)
                return new Response('', { status: 429, headers: { 'retry-after': '0' } });
            return json({ attachments: [] });
        };
        const sleeps = [];
        const client = new clickup_api_util_1.ClickUpApiClient({
            apiToken: 'tok',
            fetchImpl,
            sleep: async (ms) => {
                sleeps.push(ms);
            },
        });
        strict_1.default.deepEqual(await client.getTaskAttachments('t'), []);
        strict_1.default.equal(n, 2);
        strict_1.default.equal(sleeps.length, 1);
    });
});
//# sourceMappingURL=clickup-api.util.test.js.map