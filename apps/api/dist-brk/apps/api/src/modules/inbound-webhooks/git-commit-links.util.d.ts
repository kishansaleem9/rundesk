/**
 * Commit-message → Rundesk-task reference parsing for the inbound GitHub/GitLab
 * push-webhook receiver (Plan §12.8 "link commits via commit-message task ID").
 *
 * Pure + side-effect free so the reference grammar is unit-testable in isolation
 * from the DB and from any live provider. The service resolves the referenced
 * task, gates on the workspace's provider connection, and persists a
 * `task_external_links` row (kind:'commit').
 */
export declare const TASK_REF_PATTERN: RegExp;
/**
 * Extract every distinct Rundesk task id referenced in a commit message.
 * Case-insensitive on the marker; the returned ids are lower-cased and
 * de-duplicated in first-seen order.
 */
export declare function parseTaskRefsFromMessage(message: string | null | undefined): string[];
export type GitProvider = 'github' | 'gitlab';
/** A push commit normalised across GitHub / GitLab payload shapes. */
export interface NormalizedCommit {
    sha: string;
    message: string;
    url: string | null;
    /** `owner/repo` (GitHub) or `group/subgroup/project` (GitLab). */
    repoSlug: string | null;
    authorName: string | null;
}
/**
 * Normalise a GitHub or GitLab **push** webhook payload into a flat list of
 * commits. Unknown / non-push shapes yield an empty list (degrade cleanly).
 *
 *   GitHub: { repository: { full_name }, commits: [{ id, message, url, author }] }
 *   GitLab: { object_kind:'push', project: { path_with_namespace }, commits: [...] }
 */
export declare function normalizePushCommits(provider: GitProvider, payload: unknown): NormalizedCommit[];
/** 7-char short sha for display (mirrors external-links.util's shortSha). */
export declare function shortSha(sha: string): string;
export interface CommitLinkFields {
    externalId: string;
    title: string;
    ref: {
        owner?: string;
        repo?: string;
        projectPath?: string;
        sha: string;
        host?: string;
    };
}
/**
 * Build the persisted `task_external_links` fields for a commit, matching the
 * `externalId`/`ref` shapes that external-links.util produces for a pasted
 * commit URL (`<slug>@<sha>`), so auto-linked and manually-pasted commits are
 * indistinguishable downstream and share the same idempotency key.
 */
export declare function buildCommitLinkFields(provider: GitProvider, repoSlug: string | null, sha: string): CommitLinkFields;
