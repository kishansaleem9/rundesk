import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card } from '@rundesk/ui'
import { Settings } from 'lucide-react'
import { api } from '../lib/api'
import { FLAGS } from '@rundesk/feature-flags'
import type { FlagKey } from '@rundesk/feature-flags'

export const Route = createFileRoute('/app/admin/settings')({
  component: AdminSettingsPage,
})

type WorkspaceEntry = {
  workspace: { id: string; name: string; slug: string }
  role: string
}

type OverrideRow = {
  flagKey: FlagKey
  scope: string
  scopeId: string | null
  workspaceId: string | null
  enabled: boolean
  updatedAt: string
}

const WORKSPACE_SCOPED_FLAGS: FlagKey[] = [
  FLAGS.INTEGRATIONS,
  FLAGS.TIME_TRACKING,
  FLAGS.REPORTING,
  FLAGS.DOCS,
  FLAGS.GOALS,
  FLAGS.SPRINTS,
  FLAGS.FORMS,
]

export function AdminSettingsPage() {
  const qc = useQueryClient()
  const [workspaceId, setWorkspaceId] = useState('')

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceEntry[]>('/workspaces'),
  })
  const resolvedWorkspaceId = workspaceId || workspaces.data?.[0]?.workspace.id || ''

  const overrides = useQuery({
    queryKey: ['feature-overrides', resolvedWorkspaceId],
    queryFn: () => api<OverrideRow[]>(`/feature-flags/workspace/${resolvedWorkspaceId}`),
    enabled: Boolean(resolvedWorkspaceId),
  })

  const setWorkspaceFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: FlagKey; enabled: boolean }) =>
      api(`/feature-flags/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: {
          enabled,
          scope: 'workspace',
          scopeId: resolvedWorkspaceId,
          workspaceId: resolvedWorkspaceId,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['feature-overrides', resolvedWorkspaceId] })
      await qc.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
    },
  })

  const latestByFlag = new Map<FlagKey, OverrideRow>()
  for (const row of overrides.data ?? []) {
    if (row.scope !== 'workspace') continue
    if (!latestByFlag.has(row.flagKey)) latestByFlag.set(row.flagKey, row)
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5 text-accent" />
          Admin settings
        </h1>
        <p className="text-sm text-muted-foreground">Workspace-level controls for feature availability.</p>
      </header>

      <Card className="p-4">
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
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          Workspace feature switches
        </div>
        <ul className="divide-y divide-border">
          {WORKSPACE_SCOPED_FLAGS.map((flagKey) => {
            const row = latestByFlag.get(flagKey)
            const enabled = row?.enabled ?? false
            return (
              <li key={flagKey} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{flagKey}</div>
                  <div className="text-xs text-muted-foreground">
                    {row?.updatedAt ? `Updated ${new Date(row.updatedAt).toLocaleString()}` : 'No workspace override yet'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={enabled ? 'default' : 'outline'}
                  onClick={() => setWorkspaceFlag.mutate({ key: flagKey, enabled: !enabled })}
                  disabled={setWorkspaceFlag.isPending || !resolvedWorkspaceId}
                >
                  {enabled ? 'Enabled' : 'Disabled'}
                </Button>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
