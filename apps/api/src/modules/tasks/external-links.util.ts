/**
 * URL parsing / kind-detection for task ↔ external-service links
 * (Plan §12.8 GitHub/GitLab, §12.2 Google Drive).
 *
 * Pure + side-effect free so it is unit-testable in isolation from the DB and
 * from any live provider API. The service persists the result; the (env-gated)
 * provider fetch reads the structured `ref` back out of `metadata` to call the
 * right endpoint.
 */

export type ExternalLinkProvider =
  | 'github'
  | 'gitlab'
  | 'google_drive'
  | 'dropbox'
  | 'zoom'
  | 'google_meet'
  | 'link'
export type ExternalLinkKind = 'commit' | 'pull_request' | 'issue' | 'file' | 'meeting' | 'link'

export const EXTERNAL_LINK_PROVIDERS: readonly ExternalLinkProvider[] = [
  'github',
  'gitlab',
  'google_drive',
  'dropbox',
  'zoom',
  'google_meet',
  'link',
]

/** Structured refs the live provider fetch needs to build API URLs. */
export interface ExternalLinkRef {
  owner?: string
  repo?: string
  number?: string
  sha?: string
  projectPath?: string
  host?: string
  fileId?: string
  /** Full share URL for a Dropbox link — needed for the metadata lookup. */
  sharedUrl?: string
}

export interface ParsedExternalLink {
  provider: ExternalLinkProvider
  kind: ExternalLinkKind
  externalId: string | null
  title: string | null
  ref: ExternalLinkRef
}

/** True for a syntactically valid http(s) URL. */
export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function shortSha(sha: string): string {
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : sha
}

function knownProvider(hint?: string): ExternalLinkProvider | undefined {
  return hint === 'github' ||
    hint === 'gitlab' ||
    hint === 'google_drive' ||
    hint === 'dropbox' ||
    hint === 'link'
    ? hint
    : undefined
}

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com'])
const DRIVE_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  'sheets.google.com',
  'slides.google.com',
])
const DROPBOX_HOSTS = new Set(['dropbox.com', 'www.dropbox.com'])

/**
 * Detect provider/kind/externalId from a pasted URL. `providerHint` (the
 * request's optional `provider`) only disambiguates the generic-`link` case —
 * a recognised URL is always authoritative.
 */
export function parseExternalLinkUrl(rawUrl: string, providerHint?: string): ParsedExternalLink {
  const generic = (): ParsedExternalLink => ({
    provider: knownProvider(providerHint) ?? 'link',
    kind: 'link',
    externalId: null,
    title: null,
    ref: {},
  })

  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return generic()
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return generic()

  const host = url.hostname.toLowerCase()
  const segs = url.pathname.split('/').filter(Boolean)

  // --- GitHub -------------------------------------------------------------
  if (GITHUB_HOSTS.has(host)) {
    const [owner, repo, kw, id] = segs
    if (owner && repo && kw && id) {
      const slug = `${owner}/${repo}`
      if (kw === 'pull' && /^\d+$/.test(id)) {
        return {
          provider: 'github',
          kind: 'pull_request',
          externalId: `${slug}#${id}`,
          title: `${slug} #${id}`,
          ref: { owner, repo, number: id },
        }
      }
      if (kw === 'issues' && /^\d+$/.test(id)) {
        return {
          provider: 'github',
          kind: 'issue',
          externalId: `${slug}#${id}`,
          title: `${slug} #${id}`,
          ref: { owner, repo, number: id },
        }
      }
      if (kw === 'commit' && /^[0-9a-f]{7,40}$/i.test(id)) {
        return {
          provider: 'github',
          kind: 'commit',
          externalId: `${slug}@${id}`,
          title: `${slug}@${shortSha(id)}`,
          ref: { owner, repo, sha: id },
        }
      }
    }
    // A GitHub URL we can't classify (repo root, tree, releases…) — still a
    // GitHub link, just without a specific kind.
    return { provider: 'github', kind: 'link', externalId: null, title: null, ref: {} }
  }

  // --- Google Drive / Google Docs ----------------------------------------
  if (DRIVE_HOSTS.has(host)) {
    // /file/d/<id>, /document/d/<id>, /spreadsheets/d/<id>, /presentation/d/<id>
    const dIdx = segs.indexOf('d')
    let fileId: string | undefined
    if (dIdx >= 0 && segs[dIdx + 1]) {
      fileId = segs[dIdx + 1]
    } else {
      // /open?id=<id>, /uc?id=<id>, ?id=<id>
      fileId = url.searchParams.get('id') ?? undefined
    }
    if (fileId) {
      return {
        provider: 'google_drive',
        kind: 'file',
        externalId: fileId,
        title: null,
        ref: { fileId },
      }
    }
    return { provider: 'google_drive', kind: 'link', externalId: null, title: null, ref: {} }
  }

  // --- Dropbox share links ------------------------------------------------
  // File shares embed the filename as the final path segment:
  //   /s/<key>/<file>        (legacy)
  //   /scl/fi/<id>/<file>    (current)
  // Folder shares (/scl/fo/…) have no filename → treated as a plain dropbox link.
  if (DROPBOX_HOSTS.has(host)) {
    const sharedUrl = url.toString()
    const sIdx = segs.indexOf('s')
    const fiIdx = segs.indexOf('fi')
    const idIdx = fiIdx >= 0 ? fiIdx + 1 : sIdx >= 0 ? sIdx + 1 : -1
    if (idIdx >= 0 && segs[idIdx]) {
      const fileId = segs[idIdx]
      const name = segs[idIdx + 1] ? decodeURIComponent(segs[idIdx + 1]) : null
      return {
        provider: 'dropbox',
        kind: 'file',
        externalId: fileId,
        title: name,
        ref: { fileId, sharedUrl },
      }
    }
    return { provider: 'dropbox', kind: 'link', externalId: null, title: null, ref: { sharedUrl } }
  }

  // --- GitLab (gitlab.com + self-hosted) ---------------------------------
  // GitLab paths use a `/-/` separator: <group>/<sub>/<repo>/-/<kw>/<id>.
  // Legacy URLs omit the `-`. Detect either the host or the keyword shape.
  const kwIdx = segs.findIndex(
    (s) => s === 'merge_requests' || s === 'issues' || s === 'commit',
  )
  const looksLikeGitlab =
    host === 'gitlab.com' || host.startsWith('gitlab.') || host.includes('gitlab') || (kwIdx > 0 && segs.includes('-'))
  if (looksLikeGitlab && kwIdx > 0) {
    const kw = segs[kwIdx]
    const id = segs[kwIdx + 1]
    const projectPath = segs.slice(0, kwIdx).filter((s) => s !== '-').join('/')
    if (projectPath && id) {
      if (kw === 'merge_requests' && /^\d+$/.test(id)) {
        return {
          provider: 'gitlab',
          kind: 'pull_request',
          externalId: `${projectPath}!${id}`,
          title: `${projectPath} !${id}`,
          ref: { projectPath, number: id, host },
        }
      }
      if (kw === 'issues' && /^\d+$/.test(id)) {
        return {
          provider: 'gitlab',
          kind: 'issue',
          externalId: `${projectPath}#${id}`,
          title: `${projectPath} #${id}`,
          ref: { projectPath, number: id, host },
        }
      }
      if (kw === 'commit' && /^[0-9a-f]{7,40}$/i.test(id)) {
        return {
          provider: 'gitlab',
          kind: 'commit',
          externalId: `${projectPath}@${id}`,
          title: `${projectPath}@${shortSha(id)}`,
          ref: { projectPath, sha: id, host },
        }
      }
    }
  }
  if (host === 'gitlab.com' || host.startsWith('gitlab.')) {
    return { provider: 'gitlab', kind: 'link', externalId: null, title: null, ref: {} }
  }

  return generic()
}
