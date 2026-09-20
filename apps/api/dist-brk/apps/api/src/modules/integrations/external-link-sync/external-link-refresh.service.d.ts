import type { Db } from '@rundesk/db';
/**
 * §12.2 (+ §12.8) — periodic background sync that keeps existing task↔external
 * links current WITHOUT a manual refresh click: it re-fetches metadata/state
 * for links whose provider is connected — Google Drive / Dropbox file names,
 * GitHub / GitLab PR & issue open/merged/closed state.
 *
 * Design notes:
 *   • Only refreshable kinds are considered (PR/issue have live state; files
 *     have a live name). Commits, meetings, recordings and generic links are
 *     immutable / have nothing to poll, so they're excluded.
 *   • Env-gated on the *provider connection*: a link is only refreshed when its
 *     workspace has that provider connected (grouped so each connection is
 *     looked up once per run). Unconnected links are left untouched.
 *   • Rate-limit friendly: at most BATCH_SIZE links per run, processed
 *     sequentially, and each link is only revisited once it's older than
 *     MAX_AGE_HOURS (tracked via `metadata.lastRefreshedAt`, since the table
 *     has no updated_at column and we must not add a migration).
 */
/** Link kinds that have something live to re-fetch. */
export declare const REFRESHABLE_KINDS: readonly ["pull_request", "issue", "file"];
/** Providers with a live metadata/state endpoint. */
export declare const REFRESHABLE_PROVIDERS: readonly ["github", "gitlab", "google_drive", "dropbox"];
export interface RefreshableLink {
    id: string;
    workspaceId: string;
    provider: string;
    kind: string;
    title: string | null;
    status: string | null;
    createdAt: Date;
    metadata: Record<string, unknown> | null;
}
export interface RefreshRunSummary {
    scanned: number;
    selected: number;
    refreshed: number;
    skippedNoConnection: number;
    failed: number;
}
/**
 * Pure selection: from a candidate pool, pick the links that are "stale enough"
 * to re-fetch, oldest-refreshed first, capped at `batchSize`. A link's age is
 * measured from `metadata.lastRefreshedAt` when present, else its `createdAt`.
 * Exported + side-effect free so the cadence/selection is unit-testable without
 * a DB or provider.
 */
export declare function selectStaleLinks(links: RefreshableLink[], now: Date, maxAgeHours?: number, batchSize?: number): RefreshableLink[];
export declare class ExternalLinkRefreshService {
    private readonly db;
    private readonly logger;
    constructor(db: Db);
    runHourly(): Promise<RefreshRunSummary>;
    /**
     * One sync pass: load a candidate pool, pick the stale batch, group by
     * workspace+provider, and re-fetch each group whose connection is configured.
     */
    refreshStale(now?: Date): Promise<RefreshRunSummary>;
    /** Write back the refreshed state, always bumping `metadata.lastRefreshedAt`. */
    private persist;
    /** Stored access token for a connected provider in a workspace, else null. */
    private loadConnectionToken;
    /**
     * Env-gated live fetch, mirroring TasksService's per-link enrichment so the
     * cron and the manual "refresh" button produce identical status/title/metadata.
     * Returns null when the kind isn't fetchable or the remote call fails.
     */
    private fetchState;
    private fetchGithubState;
    /**
     * Hosts the GitLab refresh may send the workspace OAuth token to: gitlab.com
     * plus any operator-approved self-hosted hosts from GITLAB_ALLOWED_HOSTS
     * (comma-separated, default none). Read per-call so operators can change the
     * allowlist without a code change; lowercased for case-insensitive matching.
     * Kept identical to TasksService.gitlabAllowedHosts so the cron and the manual
     * "refresh" button honour the same allowlist.
     */
    private gitlabAllowedHosts;
    private fetchGitlabState;
    private fetchDriveFile;
    private fetchDropboxFile;
}
