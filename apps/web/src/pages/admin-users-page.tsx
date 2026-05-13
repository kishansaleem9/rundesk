import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { Users, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api'

type WorkspaceEntry = {
  workspace: { id: string; name: string; slug: string }
  role: string
}

type Member = {
  userId: string
  email: string
  displayName: string
  role: string
}

const ROLES = ['workspace_admin', 'manager', 'member', 'guest']

export function AdminUsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceEntry[]>('/workspaces'),
  })

  const resolvedWorkspaceId = workspaceId || workspaces.data?.[0]?.workspace.id || ''
  const members = useQuery({
    queryKey: ['admin-members', resolvedWorkspaceId],
    queryFn: () => api<Member[]>(`/workspaces/${resolvedWorkspaceId}/members`),
    enabled: Boolean(resolvedWorkspaceId),
  })

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api(`/workspaces/${resolvedWorkspaceId}/members/${userId}`, {
        method: 'PATCH',
        body: { role },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-members', resolvedWorkspaceId] })
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/workspaces/${resolvedWorkspaceId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-members', resolvedWorkspaceId] })
    },
  })

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return members.data ?? []
    return (members.data ?? []).filter((m) =>
      `${m.displayName} ${m.email} ${m.role}`.toLowerCase().includes(needle),
    )
  }, [members.data, search])

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          Admin users
        </h1>
        <p className="text-sm text-muted-foreground">Manage members and roles for any workspace you can access.</p>
      </header>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <select
            value={resolvedWorkspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            {(workspaces.data ?? []).map((entry) => (
              <option key={entry.workspace.id} value={entry.workspace.id}>
                {entry.workspace.name} ({entry.workspace.slug})
              </option>
            ))}
          </select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, role..."
            leadingIcon={<Search className="h-4 w-4" />}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          Members · {filtered.length}
        </div>
        {members.isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading members...</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No matching members.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((member) => (
              <li key={member.userId} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{member.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                </div>
                <select
                  value={member.role}
                  onChange={(e) => updateRole.mutate({ userId: member.userId, role: e.target.value })}
                  className="rounded border border-border bg-card px-2 py-1 text-xs"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => removeMember.mutate(member.userId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
