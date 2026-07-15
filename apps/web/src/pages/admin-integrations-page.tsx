import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { Plug } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

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

// `labelKey` references an i18n catalog entry; the raw `value` is the
// locale-independent identifier used for filtering/persisted status.
const STATUS_FILTERS = [
  { value: 'all', labelKey: 'adminIntegrations.filterAll' },
  { value: 'pending', labelKey: 'adminIntegrations.statusPending' },
  { value: 'approved', labelKey: 'adminIntegrations.statusApproved' },
  { value: 'rejected', labelKey: 'adminIntegrations.statusRejected' },
] as const

const STATUS_LABEL_KEYS: Record<AccessRequest['status'], TranslationKey> = {
  pending: 'adminIntegrations.statusPending',
  approved: 'adminIntegrations.statusApproved',
  rejected: 'adminIntegrations.statusRejected',
}

export function AdminIntegrationsPage() {
  const { t } = useTranslation()
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
          {t('adminIntegrations.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('adminIntegrations.subtitle')}
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
          placeholder={t('adminIntegrations.notePlaceholder')}
        />
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={statusFilter === option.value ? 'secondary' : 'outline'}
              onClick={() => setStatusFilter(option.value)}
            >
              {t(option.labelKey)}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          {t('adminIntegrations.accessRequests')} · {filteredRequests.length}
        </div>
        {requestsQuery.isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t('adminIntegrations.loadingRequests')}</div>
        ) : filteredRequests.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t('adminIntegrations.emptyRequests')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {filteredRequests.map((req) => (
              <li key={req.provider} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{req.provider}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('adminIntegrations.statusPrefix')} {t(STATUS_LABEL_KEYS[req.status])} · {t('adminIntegrations.requestedByPrefix')} {req.requesterName || req.requesterEmail || req.requestedById}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('adminIntegrations.updatedPrefix')} {new Date(req.updatedAt).toLocaleString()}
                  </div>
                  {req.note ? <div className="text-xs text-muted-foreground truncate">{t('adminIntegrations.notePrefix')} {req.note}</div> : null}
                </div>
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ provider: req.provider, status: 'pending' })}>
                  {t('adminIntegrations.statusPending')}
                </Button>
                <Button size="sm" onClick={() => setStatus.mutate({ provider: req.provider, status: 'approved' })}>
                  {t('adminIntegrations.approve')}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setStatus.mutate({ provider: req.provider, status: 'rejected' })}>
                  {t('adminIntegrations.reject')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
