"use strict";
/**
 * ClickUp REST API client (Plan §12.5 gap-closer).
 *
 * The CSV export cannot carry comments or file attachments, so the CSV importer
 * honestly reports them as NOT imported. This client fetches exactly those two
 * things from the ClickUp API (v2) using a caller-supplied personal/OAuth token
 * so an import can be *enriched* with the data the CSV omits.
 *
 * Design notes:
 *  - Pure HTTP + parsing, no DB. Kept separate from the service so the request
 *    building, pagination, rate-limit backoff and payload parsing are unit
 *    testable with an injected `fetchImpl` (no real network).
 *  - Defensive: comment pagination is capped, 429s are retried with bounded
 *    backoff, and `downloadAttachment` never throws — a single bad file returns
 *    `null` so one failure can't sink an entire enrichment batch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClickUpApiClient = exports.DEFAULT_DOWNLOAD_MAX_BYTES = exports.COMMENT_PAGE_SIZE = exports.CLICKUP_API_BASE = void 0;
exports.extractCommentText = extractCommentText;
exports.clickupDate = clickupDate;
exports.safeAttachmentName = safeAttachmentName;
const safe_fetch_1 = require("../../../common/http/safe-fetch");
/** ClickUp REST API v2 base. Auth header is `Authorization: <token>` (raw). */
exports.CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';
/** ClickUp returns at most 25 comments per page. */
exports.COMMENT_PAGE_SIZE = 25;
/** Generous cap on a single attachment download (defence-in-depth, not a limit
 * users are expected to hit). Kept high so real imports don't regress. */
exports.DEFAULT_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024;
/** Join a ClickUp comment's text, preferring the flat field, then segments. */
function extractCommentText(c) {
    if (typeof c.comment_text === 'string' && c.comment_text.trim() !== '')
        return c.comment_text;
    if (Array.isArray(c.comment))
        return c.comment.map((s) => s?.text ?? '').join('');
    return '';
}
/** Parse a ClickUp epoch-milliseconds string into a Date (undefined if bad). */
function clickupDate(raw) {
    if (!raw)
        return undefined;
    const ms = Number(raw);
    if (!Number.isFinite(ms) || ms <= 0)
        return undefined;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
/** Filesystem/URL-safe attachment name (mirrors the email-ingest convention). */
function safeAttachmentName(name) {
    return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'attachment';
}
function urlHost(u) {
    try {
        return new URL(u).hostname;
    }
    catch {
        return '';
    }
}
const isClickUpHost = (host) => /(^|\.)clickup\.com$/i.test(host);
class ClickUpApiClient {
    constructor(opts) {
        this.apiToken = opts.apiToken;
        this.baseUrl = (opts.baseUrl ?? exports.CLICKUP_API_BASE).replace(/\/$/, '');
        this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
        this.maxPages = opts.maxPages ?? 40;
        this.maxRetries = opts.maxRetries ?? 3;
        this.timeoutMs = opts.timeoutMs ?? 20_000;
        this.downloadTimeoutMs = opts.downloadTimeoutMs ?? 60_000;
        this.downloadMaxBytes = opts.downloadMaxBytes ?? exports.DEFAULT_DOWNLOAD_MAX_BYTES;
        this.safeFetchImpl = opts.safeFetchImpl ?? ((url, o) => (0, safe_fetch_1.safeFetch)(url, o));
        this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    }
    /** All comments on a task, oldest-first, following ClickUp's cursor paging. */
    async getTaskComments(taskId) {
        const out = [];
        let start;
        let startId;
        for (let page = 0; page < this.maxPages; page++) {
            const qs = new URLSearchParams();
            if (start)
                qs.set('start', start);
            if (startId)
                qs.set('start_id', startId);
            const suffix = qs.toString() ? `?${qs.toString()}` : '';
            const res = await this.request(`${this.baseUrl}/task/${encodeURIComponent(taskId)}/comment${suffix}`);
            if (!res.ok) {
                throw new Error(`ClickUp GET comments for task ${taskId} failed: HTTP ${res.status}`);
            }
            const body = (await res.json());
            const batch = Array.isArray(body.comments) ? body.comments : [];
            out.push(...batch);
            if (batch.length < exports.COMMENT_PAGE_SIZE)
                break;
            const last = batch[batch.length - 1];
            // Cursor is the oldest comment in the page; stop if it can't advance.
            if (!last?.date || !last?.id || (last.date === start && last.id === startId))
                break;
            start = last.date;
            startId = last.id;
        }
        // ClickUp returns newest-first; reverse so imported comments read in order.
        return out.reverse();
    }
    /** A task's attachments come back on the task object itself. */
    async getTaskAttachments(taskId) {
        const res = await this.request(`${this.baseUrl}/task/${encodeURIComponent(taskId)}?include_subtasks=false`);
        if (!res.ok) {
            throw new Error(`ClickUp GET task ${taskId} failed: HTTP ${res.status}`);
        }
        const body = (await res.json());
        return Array.isArray(body.attachments) ? body.attachments : [];
    }
    /**
     * Stream an attachment's bytes. Returns `null` (never throws) on any failure
     * so one broken file is skipped, not fatal. The auth header is only sent to
     * clickup.com hosts so the token never leaks to a third-party CDN.
     *
     * The download goes through the SSRF-hardened `safeFetch`: attachment URLs are
     * only semi-trusted (they come from ClickUp's API response and may redirect),
     * so private/reserved-IP targets are blocked with DNS pinning and every
     * redirect hop is re-validated. A blocked/failed fetch simply yields `null`.
     */
    async downloadAttachment(att) {
        const url = att.url_w_query ?? att.url;
        if (!url)
            return null;
        try {
            const headers = {};
            if (isClickUpHost(urlHost(url)))
                headers.Authorization = this.apiToken;
            const res = await this.safeFetchImpl(url, {
                method: 'GET',
                headers,
                timeoutMs: this.downloadTimeoutMs,
                maxBytes: this.downloadMaxBytes,
            });
            if (res.status < 200 || res.status >= 300)
                return null;
            const buffer = res.body;
            const contentType = att.mimetype || res.headers['content-type'] || 'application/octet-stream';
            return { buffer, contentType };
        }
        catch {
            return null;
        }
    }
    /** JSON GET with bounded 429 retry/backoff. */
    async request(url) {
        let attempt = 0;
        for (;;) {
            const res = await this.fetchImpl(url, {
                headers: { Authorization: this.apiToken, Accept: 'application/json' },
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (res.status === 429 && attempt < this.maxRetries) {
                attempt++;
                const reset = res.headers.get('x-ratelimit-reset') ?? res.headers.get('retry-after');
                await this.sleep(this.backoffMs(reset, attempt));
                continue;
            }
            return res;
        }
    }
    /** Backoff from a rate-limit header (epoch-seconds or delta-seconds), capped. */
    backoffMs(header, attempt) {
        const fallback = 200 * 2 ** attempt;
        const parsed = header ? Number(header) : NaN;
        let ms;
        if (Number.isFinite(parsed)) {
            ms = parsed > 1e6 ? parsed * 1000 - Date.now() : parsed * 1000;
        }
        else {
            ms = fallback;
        }
        if (!Number.isFinite(ms) || ms < 0)
            ms = fallback;
        return Math.min(ms, 5_000);
    }
}
exports.ClickUpApiClient = ClickUpApiClient;
//# sourceMappingURL=clickup-api.util.js.map