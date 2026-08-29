/**
 * The workspace you were last standing in.
 *
 * Some app routes live outside the workspace tree — /app/profile, /app/help —
 * so nothing in the URL says where you came from. The sidebar's whole nav is
 * built from a workspace id, which meant those pages rendered an empty rail:
 * no Home, no Inbox, no My Tasks, and no back link on the page either. The
 * Inbox settings gear linked straight into that, so "why am I getting this
 * notification?" cost you your place in the app.
 *
 * This is deliberately not in the auth store. That store is seeded at sign-in
 * and holds the workspaces the login payload happened to carry — a workspace
 * joined since is missing from it, which is the same staleness that made the
 * sidebar header read "Select workspace" while standing inside a named
 * workspace. What is wanted here is simply the last one actually visited.
 */
const KEY = 'rundesk.lastWorkspaceId'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Remember a workspace as the one to come back to. Ignores anything that is not an id. */
export function rememberWorkspace(id: string | undefined | null) {
  if (!id || !UUID_RE.test(id)) return
  try {
    window.localStorage.setItem(KEY, id)
  } catch {
    // Private mode, or storage disabled. Losing the breadcrumb is survivable —
    // the fallback is the workspace picker, which is never wrong, only slower.
  }
}

/** The workspace to return to, or null when there is nothing remembered. */
export function lastWorkspaceId(): string | null {
  try {
    const v = window.localStorage.getItem(KEY)
    return v && UUID_RE.test(v) ? v : null
  } catch {
    return null
  }
}
