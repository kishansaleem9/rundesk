import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Input, cn, toast } from '@rundesk/ui'
import { Shield, Search, Download } from 'lucide-react'
import { api, downloadFile } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'
import { InlineSkeleton } from '../components/loading-skeletons'
import { AdminWorkspacePicker, useAdminWorkspace } from '../components/admin-workspace-picker'

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
  'api_key.deleted': 'bg-red-100 text-red-700',
  '2fa.enabled': 'bg-emerald-100 text-emerald-700',
  '2fa.disabled': 'bg-amber-100 text-amber-700',
  'timesheet.approved': 'bg-emerald-100 text-emerald-700',
  'timesheet.rejected': 'bg-red-100 text-red-700',
  'integration.connected': 'bg-emerald-100 text-emerald-700',
  'integration.disconnected': 'bg-red-100 text-red-700',
  'integration.access_requested': 'bg-blue-100 text-blue-700',
  'integration.access_approved': 'bg-emerald-100 text-emerald-700',
  'integration.access_rejected': 'bg-red-100 text-red-700',
  'integration.access_pending': 'bg-amber-100 text-amber-700',
  'announcement.created': 'bg-purple-100 text-purple-700',
  'announcement.updated': 'bg-purple-100 text-purple-700',
  'announcement.removed': 'bg-red-100 text-red-700',
}

// Human-readable labels for audit actions. The raw `log.action` identifier is
// the persisted/compared value; unmapped actions fall back to the raw string.
const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  'auth.login': 'adminAudit.action.authLogin',
  'member.invited': 'adminAudit.action.memberInvited',
  'member.removed': 'adminAudit.action.memberRemoved',
  'role.changed': 'adminAudit.action.roleChanged',
  'workspace.updated': 'adminAudit.action.workspaceUpdated',
  'feature_flag.changed': 'adminAudit.action.featureFlagChanged',
  'data.exported': 'adminAudit.action.dataExported',
  'api_key.created': 'adminAudit.action.apiKeyCreated',
  'api_key.revoked': 'adminAudit.action.apiKeyRevoked',
  'api_key.deleted': 'adminAudit.action.apiKeyDeleted',
  '2fa.enabled': 'adminAudit.action.twoFaEnabled',
  '2fa.disabled': 'adminAudit.action.twoFaDisabled',
  'timesheet.approved': 'adminAudit.action.timesheetApproved',
  'timesheet.rejected': 'adminAudit.action.timesheetRejected',
  'integration.connected': 'adminAudit.action.integrationConnected',
  'integration.disconnected': 'adminAudit.action.integrationDisconnected',
  'integration.access_requested': 'adminAudit.action.integrationAccessRequested',
  'integration.access_approved': 'adminAudit.action.integrationAccessApproved',
  'integration.access_rejected': 'adminAudit.action.integrationAccessRejected',
  'integration.access_pending': 'adminAudit.action.integrationAccessPending',
  'announcement.created': 'adminAudit.action.announcementCreated',
  'announcement.updated': 'adminAudit.action.announcementUpdated',
  'announcement.removed': 'adminAudit.action.announcementRemoved',
}

type ActionGroup = 'all' | 'members' | 'security' | 'integrations' | 'timesheets' | 'announcements' | 'workspace'

// Action-type groups map to the action prefixes sent to the server so the whole
// trail is filtered server-side (Plan §13.3), not just the loaded page.
const GROUP_PREFIXES: Record<Exclude<ActionGroup, 'all'>, string[]> = {
  members: ['member.', 'role.'],
  security: ['api_key.', '2fa.', 'auth.'],
  integrations: ['integration.'],
  timesheets: ['timesheet.'],
  announcements: ['announcement.'],
  workspace: ['workspace.', 'feature_flag.', 'data.'],
}

const GROUP_LABEL_KEYS: Record<ActionGroup, TranslationKey> = {
  all: 'adminAudit.groupAll',
  members: 'adminAudit.groupMembers',
  security: 'adminAudit.groupSecurity',
  integrations: 'nav.integrations',
  timesheets: 'adminAudit.groupTimesheets',
  announcements: 'adminAudit.groupAnnouncements',
  workspace: 'common.workspace',
}

type Member = { userId: string; email: string; displayName: string }

/** Build the shared filter query string sent to both the list and export endpoints. */
function buildFilterParams(opts: { from: string; to: string; actorId: string; group: ActionGroup }) {
  const p = new URLSearchParams()
  if (opts.from) p.set('from', opts.from)
  // Include the whole "to" day (server compares against createdAt <= to).
  if (opts.to) p.set('to', `${opts.to}T23:59:59.999`)
  if (opts.actorId) p.set('actorId', opts.actorId)
  if (opts.group !== 'all') p.set('actionPrefixes', GROUP_PREFIXES[opts.group].join(','))
  return p
}

export function AuditLogPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [group, setGroupState] = useState<ActionGroup>('all')
  const [from, setFromState] = useState('')
  const [to, setToState] = useState('')
  const [actorId, setActorIdState] = useState('')

  // Any server-side filter change resets to the first page so pagination stays valid.
  const setGroup = (g: ActionGroup) => { setGroupState(g); setPage(1) }
  const setFrom = (v: string) => { setFromState(v); setPage(1) }
  const setTo = (v: string) => { setToState(v); setPage(1) }
  const setActorId = (v: string) => { setActorIdState(v); setPage(1) }

  // The trail is one workspace's: the one picked, else the first the admin
  // joined. A different workspace has different people, so the actor filter
  // starts again with it.
  const { workspaces, workspaceId, setWorkspaceId } = useAdminWorkspace()
  const pickWorkspace = (id: string) => { setWorkspaceId(id); setActorIdState(''); setPage(1) }

  // Actor dropdown is sourced from workspace members so it covers everyone, not
  // just actors present on the current page.
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Member[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  })

  const filterParams = buildFilterParams({ from, to, actorId, group })

  const logsQuery = useQuery({
    queryKey: ['audit-logs', workspaceId, page, from, to, actorId, group],
    queryFn: () => {
      if (!workspaceId) return Promise.resolve([])
      const params = new URLSearchParams(filterParams)
      params.set('page', String(page))
      params.set('limit', '50')
      return api<AuditLog[]>(`/workspaces/${workspaceId}/audit-logs?${params.toString()}`)
    },
    enabled: !!workspaceId,
  })

  const serverLogs = logsQuery.data ?? []
  // Free-text search stays a client-side refinement of the current server page.
  const logs = search
    ? serverLogs.filter((l) => {
        const needle = search.toLowerCase()
        return (
          l.action.toLowerCase().includes(needle) ||
          l.description.toLowerCase().includes(needle) ||
          (l.actorEmail?.toLowerCase().includes(needle) ?? false)
        )
      })
    : serverLogs

  const hasFilters = Boolean(from || to || actorId || group !== 'all')

  function clearFilters() {
    setFromState('')
    setToState('')
    setActorIdState('')
    setGroupState('all')
    setSearch('')
    setPage(1)
  }

  function exportCsv() {
    if (!workspaceId) return
    // Server-side export streams the FULL filtered trail, not just the loaded page.
    const qs = filterParams.toString()
    // Its failure is said: this was `void`, so a failed export did nothing at all.
    downloadFile(
      `/workspaces/${workspaceId}/audit-logs/export${qs ? `?${qs}` : ''}`,
      `audit-log-${new Date().toISOString().split('T')[0]}.csv`,
    ).catch(() => toast.error(t('adminAudit.exportFailed')))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold">{t('adminAudit.title')}</h1>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> {t('adminAudit.exportCsv')}
        </Button>
      </div>

      {/* Server-side filters (Plan §13.3): date range + actor, applied to the whole trail. */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/40 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('common.workspace')}</label>
          <AdminWorkspacePicker
            testId="admin-audit-workspace"
            workspaces={workspaces.data}
            value={workspaceId}
            onChange={pickWorkspace}
            className="h-9 py-0 px-2 min-w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('adminAudit.dateFrom')}</label>
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('adminAudit.dateTo')}</label>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t('adminAudit.actor')}</label>
          <select
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="h-9 min-w-44 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t('adminAudit.allActors')}</option>
            {(membersQuery.data ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName} ({m.email})
              </option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t('adminAudit.clearFilters')}
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('adminAudit.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(GROUP_LABEL_KEYS) as ActionGroup[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
              group === g
                ? 'bg-accent text-accent-foreground border-accent'
                : 'bg-card text-muted-foreground border-border hover:bg-muted/30',
            )}
          >
            {t(GROUP_LABEL_KEYS[g])}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {logsQuery.isLoading && <p className="text-sm text-muted-foreground"><InlineSkeleton /></p>}
        {/* A trail that failed to load is not an empty one. */}
        {logsQuery.isError && (
          <Card className="p-8 text-center text-muted-foreground">
            <p data-testid="admin-audit-load-failed">{t('adminAudit.loadFailed')}</p>
          </Card>
        )}
        {!logsQuery.isLoading && !logsQuery.isError && logs.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>
              {!hasFilters && !search
                ? t('adminAudit.emptyNoEvents')
                : search
                  ? t('adminAudit.emptyNoMatchFilterSearch')
                  : t('adminAudit.emptyNoMatchFilter')}
            </p>
            <p className="text-xs mt-1">
              {!hasFilters && !search
                ? t('adminAudit.emptyHintNoEvents')
                : t('adminAudit.emptyHintFiltered')}
            </p>
          </Card>
        )}
        {logs.map((log) => (
          <AuditRow key={log.id} log={log} />
        ))}
      </div>

      {(page > 1 || serverLogs.length === 50) && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            {t('adminAudit.previous')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={serverLogs.length < 50}>
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  )
}

function AuditRow({ log }: { log: AuditLog }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const hasMetadata = Boolean(log.metadata && Object.keys(log.metadata).length > 0)
  const hasResource = Boolean(log.resourceType || log.resourceId)
  const canExpand = hasMetadata || hasResource
  const actionLabelKey = ACTION_LABEL_KEYS[log.action] as TranslationKey | undefined

  return (
    <div className="border-b border-border/50">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-start gap-3 py-2.5 text-left',
          canExpand ? 'cursor-pointer hover:bg-muted/20' : 'cursor-default',
        )}
      >
        <div className="shrink-0 mt-0.5">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {actionLabelKey ? t(actionLabelKey) : log.action}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm">{log.description}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {log.actorEmail ?? t('adminAudit.system')}
            {log.ipAddress ? ` · ${log.ipAddress}` : ''}
            {hasResource ? ` · ${log.resourceType ?? t('adminAudit.resource')}${log.resourceId ? ` #${String(log.resourceId).slice(0, 8)}` : ''}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
          {new Date(log.createdAt).toLocaleString()}
        </div>
      </button>
      {expanded && canExpand && (
        <div className="px-3 pb-3 -mt-1">
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-1.5">
            {hasResource && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">{t('adminAudit.resourceLabel')}</span>
                <span className="font-mono break-all">
                  {log.resourceType ?? '—'}
                  {log.resourceId ? ` · ${log.resourceId}` : ''}
                </span>
              </div>
            )}
            {hasMetadata && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">{t('adminAudit.metadataLabel')}</span>
                <pre className="font-mono whitespace-pre-wrap break-all flex-1">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
