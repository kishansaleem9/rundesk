import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { Plug } from 'lucide-react'
import { api } from '../lib/api'

type WorkspaceEntry = {
  workspace: { id: string; name: string; slug: string }
  role: string
}

type AccessRequest = {
  provider: string
  status: 'pending' | 'approved' | 'rejected'
  note?: string | null
  requestedById: string
  requesterName?: string | null
  requesterEmail?: string | null
  createdAt: string
  updatedAt: string
}

export function AdminIntegrationsPage() {
  const qc = useQueryClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AccessRequest['status']>('all')

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceEntry[]>('/workspaces'),
  })
  const resolvedWorkspaceId = workspaceId || workspaces.data?.[0]?.workspace.id || ''
  const requestsQuery = useQuery({
    queryKey: ['integration-access-requests-admin', resolvedWorkspaceId],
    enabled: Boolean(resolvedWorkspaceId),
    queryFn: () =>
      api<AccessRequest[]>(`/workspaces/${resolvedWorkspaceId}/integrations/connections/access-requests`),
  })

  const setStatus = useMutation({
    mutationFn: ({ provider, status }: { provider: string; status: AccessRequest['status'] }) =>
      api(`/workspaces/${resolvedWorkspaceId}/integrations/connections/access-requests/${provider}`, {
        method: 'PATCH',
        body: { status, note: adminNote || undefined },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integration-access-requests-admin', resolvedWorkspaceId] })
    },
  })
  const filteredRequests = (requestsQuery.data ?? []).filter((req) =>
    statusFilter === 'all' ? true : req.status === statusFilter,
  )

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Plug className="h-5 w-5 text-accent" />
          Admin integrations
        </h1>
        <p className="text-sm text-muted-foreground">
          Review provider access requests from workspace members and set approval status.
        </p>
      </header>

      <Card className="p-4 space-y-3">
        <select
          value={resolvedWorkspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm w-full md:w-auto"
        >
          {(workspaces.data ?? []).map((entry) => (
            <option key={entry.workspace.id} value={entry.workspace.id}>
              {entry.workspace.name} ({entry.workspace.slug})
            </option>
          ))}
        </select>
        <Input
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          placeholder="Optional admin note (applies on next status change)"
        />
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={statusFilter === value ? 'secondary' : 'outline'}
              onClick={() => setStatusFilter(value)}
            >
              {value === 'all' ? 'All' : value[0]?.toUpperCase() + value.slice(1)}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          Access requests · {filteredRequests.length}
        </div>
        {requestsQuery.isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading requests...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No access requests yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filteredRequests.map((req) => (
              <li key={req.provider} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{req.provider}</div>
                  <div className="text-xs text-muted-foreground">
                    status: {req.status} · requested by: {req.requesterName || req.requesterEmail || req.requestedById}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    updated: {new Date(req.updatedAt).toLocaleString()}
                  </div>
                  {req.note ? <div className="text-xs text-muted-foreground truncate">note: {req.note}</div> : null}
                </div>
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ provider: req.provider, status: 'pending' })}>
                  Pending
                </Button>
                <Button size="sm" onClick={() => setStatus.mutate({ provider: req.provider, status: 'approved' })}>
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setStatus.mutate({ provider: req.provider, status: 'rejected' })}>
                  Reject
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
