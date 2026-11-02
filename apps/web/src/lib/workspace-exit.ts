/*
 * WHERE SOMEBODY GOES WHEN A WORKSPACE IS GONE FROM UNDER THEM — they left
 * it, or deleted it (QA WS-015: "removed and switched to another Workspace or
 * create screen"; WS-018: "user moved to another Workspace").
 *
 * The list is read again and given to the session, so the switcher stops
 * offering it at once; then the first workspace still theirs, or `/app`, which
 * offers to make one when there is none. Never the gone one's own pages: they
 * answer 404 now.
 */
import type { QueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { AuthWorkspace } from '../store/auth'

type Listed = { workspace: { id: string; name: string; slug: string; organizationId: string }; role: string }

export async function goToAnotherWorkspace(
  goneId: string,
  deps: {
    qc: QueryClient
    setWorkspaces: (workspaces: AuthWorkspace[]) => void
    navigate: (to: { to: '/app/$workspaceId'; params: { workspaceId: string }; replace: true } | { to: '/app'; replace: true }) => unknown
  },
): Promise<void> {
  const rows = await api<Listed[]>('/workspaces').catch(() => [] as Listed[])
  const left = rows.filter((r) => r.workspace?.id && r.workspace.id !== goneId)
  deps.setWorkspaces(
    left.map((r) => ({ id: r.workspace.id, name: r.workspace.name, slug: r.workspace.slug, organizationId: r.workspace.organizationId, role: r.role })),
  )
  deps.qc.setQueryData(['workspaces'], left)
  deps.qc.removeQueries({ queryKey: ['workspace', goneId] })
  const next = left[0]?.workspace.id
  if (next) deps.navigate({ to: '/app/$workspaceId', params: { workspaceId: next }, replace: true })
  else deps.navigate({ to: '/app', replace: true })
}
