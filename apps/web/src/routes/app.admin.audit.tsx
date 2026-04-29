import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { Shield, Search, Download } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

export const Route = createFileRoute('/app/admin/audit')({
  component: AuditLogPage,
})

type AuditLog = {
  id: string
  actorEmail?: string | null
  action: string
  resourceType?: string | null
  resourceId?: string | null
  description: string
  metadata?: Record<string, string | number | boolean | null> | null
  ipAddress?: string | null
  createdAt: string
}

const ACTION_COLORS: Record<string, string> = {
  'auth.login': 'bg-blue-100 text-blue-700',
  'member.invited': 'bg-emerald-100 text-emerald-700',
  'member.removed': 'bg-red-100 text-red-700',
  'role.changed': 'bg-amber-100 text-amber-700',
  'workspace.updated': 'bg-purple-100 text-purple-700',
  'feature_flag.changed': 'bg-orange-100 text-orange-700',
  'data.exported': 'bg-cyan-100 text-cyan-700',
  'api_key.created': 'bg-indigo-100 text-indigo-700',
  'api_key.revoked': 'bg-red-100 text-red-700',
}

function AuditLogPage() {
  const user = useAuthStore((s) => s.user)
  // Get the user's current workspace — we use the first workspace for the audit log
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // For audit log we need a workspace — get from user's workspaces
  const wsQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<Array<{ workspace: { id: string } }>>('/workspaces'),
  })

  const workspaceId = wsQuery.data?.[0]?.workspace.id

  const logsQuery = useQuery({
    queryKey: ['audit-logs', workspaceId, page],
    queryFn: () =>
      workspaceId
        ? api<AuditLog[]>(`/workspaces/${workspaceId}/audit-logs?page=${page}&limit=50`)
        : Promise.resolve([]),
    enabled: !!workspaceId,
  })

  const logs = (logsQuery.data ?? []).filter((l) =>
    !search ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.description.toLowerCase().includes(search.toLowerCase()) ||
    l.actorEmail?.toLowerCase().includes(search.toLowerCase()),
  )

  function exportCsv() {
    const rows = [
      ['Timestamp', 'Actor', 'Action', 'Resource', 'Description', 'IP'],
      ...logs.map((l) => [
        l.createdAt,
        l.actorEmail ?? '',
        l.action,
        `${l.resourceType ?? ''} ${l.resourceId ?? ''}`.trim(),
        l.description,
        l.ipAddress ?? '',
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold">Audit log</h1>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by action, actor, or description…"
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {logsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!logsQuery.isLoading && logs.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No audit events yet.</p>
            <p className="text-xs mt-1">Events appear here as admins make changes.</p>
          </Card>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-border/50">
            <div className="shrink-0 mt-0.5">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {log.action}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{log.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {log.actorEmail ?? 'System'}{log.ipAddress ? ` · ${log.ipAddress}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
              {new Date(log.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {logs.length === 50 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
