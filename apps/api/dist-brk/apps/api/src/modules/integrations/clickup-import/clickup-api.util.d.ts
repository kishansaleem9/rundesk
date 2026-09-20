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
import { type SafeFetchOptions, type SafeFetchResponse } from '../../../common/http/safe-fetch';
/** ClickUp REST API v2 base. Auth header is `Authorization: <token>` (raw). */
export declare const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
/** ClickUp returns at most 25 comments per page. */
export declare const COMMENT_PAGE_SIZE = 25;
/** Generous cap on a single attachment download (defence-in-depth, not a limit
 * users are expected to hit). Kept high so real imports don't regress. */
export declare const DEFAULT_DOWNLOAD_MAX_BYTES: number;
/** The guarded-fetch shape used for attachment downloads (defaults to `safeFetch`). */
export type SafeFetchLike = (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResponse>;
export type ClickUpUser = {
    id?: number;
    username?: string;
    email?: string;
};
/** Shape of a comment from `GET /task/{id}/comment` (fields we consume). */
export type ClickUpComment = {
    id: string;
    /** Plain concatenated text. */
    comment_text?: string;
    /** Rich-text segments; used as a fallback when `comment_text` is absent. */
    comment?: Array<{
        text?: string;
    }>;
    user?: ClickUpUser;
    /** Epoch milliseconds, as a string. */
    date?: string;
};
/** Shape of an attachment from `attachments[]` on `GET /task/{id}`. */
export type ClickUpAttachment = {
    id: string;
    title?: string;
    date?: string;
    extension?: string;
    mimetype?: string;
    size?: number;
    /** Direct (often pre-signed) download URL. */
    url?: string;
    /** Download URL carrying auth query params; preferred when present. */
    url_w_query?: string;
};
/** The subset the importer depends on — lets tests pass a plain fake. */
export interface ClickUpClientLike {
    getTaskComments(taskId: string): Promise<ClickUpComment[]>;
    getTaskAttachments(taskId: string): Promise<ClickUpAttachment[]>;
    downloadAttachment(att: ClickUpAttachment): Promise<{
        buffer: Buffer;
        contentType: string;
    } | null>;
}
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type ClickUpApiClientOptions = {
    apiToken: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
    /** Safety cap on comment pages so a bad cursor can't loop forever. */
    maxPages?: number;
    /** How many times to retry a 429 before giving up. */
    maxRetries?: number;
    timeoutMs?: number;
    downloadTimeoutMs?: number;
    /** Cap on a single attachment download's bytes (see DEFAULT_DOWNLOAD_MAX_BYTES). */
    downloadMaxBytes?: number;
    /**
     * SSRF-hardened fetch for attachment downloads. Attachment URLs come from
     * ClickUp's API response (semi-trusted) and may redirect to arbitrary hosts,
     * so downloads go through `safeFetch` (private/reserved-IP block + DNS pinning
     * + per-hop redirect re-validation). Injectable so tests stay hermetic.
     */
    safeFetchImpl?: SafeFetchLike;
    /** Injectable so tests don't actually wait during backoff. */
    sleep?: (ms: number) => Promise<void>;
};
/** Join a ClickUp comment's text, preferring the flat field, then segments. */
export declare function extractCommentText(c: ClickUpComment): string;
/** Parse a ClickUp epoch-milliseconds string into a Date (undefined if bad). */
export declare function clickupDate(raw?: string): Date | undefined;
/** Filesystem/URL-safe attachment name (mirrors the email-ingest convention). */
export declare function safeAttachmentName(name: string): string;
export declare class ClickUpApiClient implements ClickUpClientLike {
    private readonly apiToken;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly maxPages;
    private readonly maxRetries;
    private readonly timeoutMs;
    private readonly downloadTimeoutMs;
    private readonly downloadMaxBytes;
    private readonly safeFetchImpl;
    private readonly sleep;
    constructor(opts: ClickUpApiClientOptions);
    /** All comments on a task, oldest-first, following ClickUp's cursor paging. */
    getTaskComments(taskId: string): Promise<ClickUpComment[]>;
    /** A task's attachments come back on the task object itself. */
    getTaskAttachments(taskId: string): Promise<ClickUpAttachment[]>;
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
    downloadAttachment(att: ClickUpAttachment): Promise<{
        buffer: Buffer;
        contentType: string;
    } | null>;
    /** JSON GET with bounded 429 retry/backoff. */
    private request;
    /** Backoff from a rate-limit header (epoch-seconds or delta-seconds), capped. */
    private backoffMs;
}
