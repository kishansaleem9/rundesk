import { useAuthStore } from '../store/auth'

export type WorkspaceRole = 'super_admin' | 'workspace_admin' | 'manager' | 'member' | 'guest'

function resolve(workspaceId: string | undefined, user: { role?: string } | null, workspaces: Array<{ id: string; role: string }>) {
  const ws = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined
  const role = (ws?.role ?? user?.role ?? 'member') as WorkspaceRole
  const isSuperAdmin = user?.role === 'super_admin'
  const isAdmin = isSuperAdmin || role === 'workspace_admin'
  const isManagerOrAbove = isAdmin || role === 'manager'
  /*
   * §7 [09:29] — "WORKSPACE IS A FEATURE jo ke har member kar sakta hai."
   *
   * Keyed on the *account* role, not the workspace one: making a workspace is
   * not an act inside the workspace you happen to be looking at. Mirrors
   * canCreateWorkspace on the API, which is the authority — this only decides
   * whether to offer the button, and offering one that 403s is the state this
   * fixes.
   */
  const accountRole = user?.role ?? role
  const canCreateWorkspace = accountRole !== 'guest' && accountRole !== 'viewer'
  return { role, isSuperAdmin, isAdmin, isManagerOrAbove, canCreateWorkspace }
}

/**
 * How the base roles stand to one another — the API's rank table
 * (`workspace-roles.ts`), stated once in the web. Nobody gives a role above
 * their own: the API refuses it (`assertWithinRank`), so the web offers none.
 */
const RANK: Record<WorkspaceRole, number> = { guest: 0, member: 1, manager: 2, workspace_admin: 3, super_admin: 4 }

/** Whether one whose role is `own` may give `role`. */
export function withinRank(own: WorkspaceRole, role: string): boolean {
  return (RANK[role as WorkspaceRole] ?? Number.POSITIVE_INFINITY) <= RANK[own]
}

/** React hook: the current user's role for a given workspace (admin gating, etc.). */
export function useWorkspaceRole(workspaceId?: string) {
  const user = useAuthStore((s) => s.user)
  const workspaces = useAuthStore((s) => s.workspaces)
  return resolve(workspaceId, user, workspaces)
}

/** Non-hook variant for router beforeLoad guards (reads the store directly). */
export function getWorkspaceRole(workspaceId?: string) {
  const { user, workspaces } = useAuthStore.getState()
  return resolve(workspaceId, user, workspaces)
}
