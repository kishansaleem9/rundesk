import { useAuthStore } from '../store/auth'

export type WorkspaceRole = 'super_admin' | 'workspace_admin' | 'manager' | 'member' | 'guest'

function resolve(workspaceId: string | undefined, user: { role?: string } | null, workspaces: Array<{ id: string; role: string }>) {
  const ws = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined
  const role = (ws?.role ?? user?.role ?? 'member') as WorkspaceRole
  const isSuperAdmin = user?.role === 'super_admin'
  const isAdmin = isSuperAdmin || role === 'workspace_admin'
  const isManagerOrAbove = isAdmin || role === 'manager'
  return { role, isSuperAdmin, isAdmin, isManagerOrAbove }
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
