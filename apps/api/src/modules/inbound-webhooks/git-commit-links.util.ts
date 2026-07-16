/**
 * Commit-message → Rundesk-task reference parsing for the inbound GitHub/GitLab
 * push-webhook receiver (Plan §12.8 "link commits via commit-message task ID").
 *
 * Pure + side-effect free so the reference grammar is unit-testable in isolation
 * from the DB and from any live provider. The service resolves the referenced
 * task, gates on the workspace's provider connection, and persists a
 * `task_external_links` row (kind:'commit').
 */

/**
 * A Rundesk task id is a v4 UUID (see `tasks.id` — `uuid().defaultRandom()`),
 * and the canonical deep-link is `…/<list>?task=<uuid>` (TasksService.buildTaskUrl).
 * There is no separate short/numeric id, so a "task reference" in a commit
 * message is the task UUID introduced by one of a small set of **explicit
 * markers**. Requiring a marker (rather than matching any bare UUID) keeps the
 * scan robust against incidental hashes/ids that appear in commit messages.
 *
 * Recognised markers, each immediately followed by the UUID:
 *   • `RD-<uuid>`      — the conventional token (case-insensitive `RD-`), e.g.
 *                        "fix login RD-3f2504e0-4f89-41d3-9a0c-0305e82c3301".
 *   • `#<uuid>`        — the hash token, e.g. "#3f2504e0-4f89-41d3-9a0c-0305e82c3301".
 *   • `task=<uuid>`    — as it appears in a pasted deep-link query string
 *                        (`?task=<uuid>`).
 *   • `/task/<uuid>` or `/tasks/<uuid>` — path forms of a pasted link.
 *
 * `\bRD-` anchors on a word boundary so "wordRD-…" does NOT match, while
 * "… RD-…" / "(RD-…" do. The capture group is the UUID itself.
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const TASK_REF_PATTERN = new RegExp(
  `(?:\\bRD-|#|task=|/tasks?/)(${UUID})`,
  'gi',
)

/**
 * Extract every distinct Rundesk task id referenced in a commit message.
 * Case-insensitive on the marker; the returned ids are lower-cased and
 * de-duplicated in first-seen order.
 */
export function parseTaskRefsFromMessage(message: string | null | undefined): string[] {
  if (!message) return []
  const out: string[] = []
  const seen = new Set<string>()
  // The regex is stateful (global flag); iterate with matchAll on a fresh scan.
  for (const m of message.matchAll(TASK_REF_PATTERN)) {
    const id = m[1]?.toLowerCase()
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

export type GitProvider = 'github' | 'gitlab'

/** A push commit normalised across GitHub / GitLab payload shapes. */
export interface NormalizedCommit {
  sha: string
  message: string
  url: string | null
  /** `owner/repo` (GitHub) or `group/subgroup/project` (GitLab). */
  repoSlug: string | null
  authorName: string | null
}

interface RawCommit {
  id?: string
  sha?: string
  message?: string
  title?: string
  url?: string
  author?: { name?: string; username?: string } | null
}

/**
 * Normalise a GitHub or GitLab **push** webhook payload into a flat list of
 * commits. Unknown / non-push shapes yield an empty list (degrade cleanly).
 *
 *   GitHub: { repository: { full_name }, commits: [{ id, message, url, author }] }
 *   GitLab: { object_kind:'push', project: { path_with_namespace }, commits: [...] }
 */
export function normalizePushCommits(
  provider: GitProvider,
  payload: unknown,
): NormalizedCommit[] {
  if (!payload || typeof payload !== 'object') return []
  const body = payload as {
    commits?: RawCommit[]
    repository?: { full_name?: string }
    project?: { path_with_namespace?: string }
  }
  const commits = Array.isArray(body.commits) ? body.commits : []
  const repoSlug =
    provider === 'github'
      ? body.repository?.full_name ?? null
      : body.project?.path_with_namespace ?? null

  const out: NormalizedCommit[] = []
  for (const c of commits) {
    const sha = c.id ?? c.sha
    if (!sha) continue
    out.push({
      sha,
      message: c.message ?? c.title ?? '',
      url: c.url ?? null,
      repoSlug,
      authorName: c.author?.name ?? c.author?.username ?? null,
    })
  }
  return out
}

/** 7-char short sha for display (mirrors external-links.util's shortSha). */
export function shortSha(sha: string): string {
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : sha
}

export interface CommitLinkFields {
  externalId: string
  title: string
  ref: { owner?: string; repo?: string; projectPath?: string; sha: string; host?: string }
}

/**
 * Build the persisted `task_external_links` fields for a commit, matching the
 * `externalId`/`ref` shapes that external-links.util produces for a pasted
 * commit URL (`<slug>@<sha>`), so auto-linked and manually-pasted commits are
 * indistinguishable downstream and share the same idempotency key.
 */
export function buildCommitLinkFields(
  provider: GitProvider,
  repoSlug: string | null,
  sha: string,
): CommitLinkFields {
  const slug = repoSlug ?? 'unknown'
  const externalId = `${slug}@${sha}`
  const title = `${slug}@${shortSha(sha)}`
  if (provider === 'github') {
    const [owner, repo] = slug.split('/')
    return { externalId, title, ref: { owner, repo, sha } }
  }
  return { externalId, title, ref: { projectPath: slug, sha } }
}
