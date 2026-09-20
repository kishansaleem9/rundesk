import type { Db } from '@rundesk/db';
import { type GitProvider } from './git-commit-links.util';
export interface PushIngestSummary {
    ok: boolean;
    provider: GitProvider;
    commitsScanned: number;
    referencesFound: number;
    linked: number;
    skippedExisting: number;
    skippedNoConnection: number;
    skippedUnknownTask: number;
}
/**
 * §12.8 — scan inbound GitHub/GitLab **push** events for commit messages that
 * reference a Rundesk task, and auto-create a `task_external_links` row
 * (kind:'commit') linking each such commit to its task.
 *
 * Env-gated on the *relevant provider connection*: a commit is only linked when
 * the referenced task's workspace has that provider (github/gitlab) connected.
 * Unconnected workspaces are skipped silently — the feature degrades to a no-op
 * rather than erroring. Idempotent: a commit already linked to a task (same
 * `external_id`) is never linked twice.
 */
export declare class GitCommitLinksService {
    private readonly db;
    private readonly logger;
    constructor(db: Db);
    ingestPush(provider: GitProvider, payload: unknown): Promise<PushIngestSummary>;
    /** Resolve a task's owning workspace via list → project → space, or null. */
    private resolveWorkspaceForTask;
    /** True when the workspace has the given VCS provider connected. */
    private isProviderConnected;
    /**
     * Insert a kind:'commit' link if one doesn't already exist for this task+commit.
     * Returns true when a new row was created, false when it already existed
     * (idempotent — a repo pushing the same commit twice never double-links).
     */
    private linkCommit;
    private fallbackCommitUrl;
}
