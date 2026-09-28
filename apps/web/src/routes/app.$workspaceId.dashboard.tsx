import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, cn, Input, toast } from '@rundesk/ui'
import { useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  Share2,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react'
import { format, formatDistanceToNowStrict, isAfter, isBefore, isToday, startOfWeek } from 'date-fns'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { usePermissions } from '../hooks/use-permissions'
import { DashboardWidgetBuilder } from '../components/dashboard-widget-builder'
import { FreshnessControls, REFRESH_INTERVALS } from '../components/freshness-controls'
import { DashboardTemplateCards } from '../components/dashboard-templates'
import { SharePanel } from '../components/share-panel'
import { useTranslation } from '../lib/i18n'
import { DemoDataEmptyState } from '../components/demo-data-empty-state'

type TaskAssignee = {
  userId: string
  displayName?: string | null
  avatarUrl?: string | null
}

/**
 * Flat task row returned by `GET /tasks/workspace/:id`. The endpoint
 * denormalises space/project/list ids in a single indexed query so the
 * dashboard no longer needs to fan out (previously: spaces → projects
 * → lists → tasks = O(spaces+projects+lists) HTTP requests).
 *
 * `status` is a free-form key into the list's custom statuses;
 * `statusCategory` is the canonical bucket the dashboard uses for
 * "active" / "done" classification.
 */
type Task = {
  id: string
  listId: string
  title: string
  status: string
  statusCategory: 'open' | 'in_progress' | 'closed'
  priority?: 'urgent' | 'high' | 'normal' | 'low'
  spaceId: string
  spaceName: string
  projectId: string
  projectName: string
  listName: string
  startDate?: string | null
  dueDate?: string | null
  completedAt?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  assignees: TaskAssignee[]
}

type Workspace = { id: string; name: string }

/** A5.11 — a preset as the hub renders it: owner and sharing state included. */
type Preset = {
  id: string
  userId: string
  name: string
  layout: unknown
  isDefault: boolean
  isWorkspaceDefault: boolean
  ownerName?: string | null
  ownerEmail?: string | null
  shareCount: number
  isOwner: boolean
  isSharedWithMe: boolean
}

/**
 * A5.13 — how often the dashboard's own reads refetch. Dashboards are left open
 * on a second monitor, so a static snapshot is misleading rather than merely
 * stale; the shortest interval that isn't wasteful wins.
 */

export const Route = createFileRoute('/app/$workspaceId/dashboard')({
  /*
   * A preset is explicitly a shared object — it carries `shareCount` and
   * `isSharedWithMe`, and there is a Share dialog on every row — but the route
   * declared no search schema, so which one you were looking at lived in
   * component state. Share "Q3 Exec" with your team, send them the URL, and
   * they land on the Overview tab and have to hunt for it in the index; your
   * own reload does the same to you.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { preset?: string; mode?: 'overview' | 'custom' } => ({
    preset: typeof search.preset === 'string' && search.preset ? search.preset : undefined,
    mode: search.mode === 'custom' ? 'custom' : undefined,
  }),
  component: Dashboard,
})

function greetingKey(): 'dashboard.greetingMorning' | 'dashboard.greetingAfternoon' | 'dashboard.greetingEvening' {
  const h = new Date().getHours()
  if (h < 12) return 'dashboard.greetingMorning'
  if (h < 18) return 'dashboard.greetingAfternoon'
  return 'dashboard.greetingEvening'
}

function Dashboard() {
  const { workspaceId } = Route.useParams()
  const { t, tCount } = useTranslation()
  /*
   * Both the tab and the chosen preset are the address. `mode` is omitted
   * when it is the default, so an ordinary visit stays at /dashboard rather
   * than growing a parameter that says nothing.
   */
  const { preset: presetParam, mode: modeParam } = Route.useSearch()
  const navigate = useNavigate()
  const viewMode: 'overview' | 'custom' = modeParam ?? 'overview'
  const activePresetId = presetParam ?? null
  const goDashboard = (next: { mode?: 'overview' | 'custom'; preset?: string | null }) =>
    navigate({
      to: '/app/$workspaceId/dashboard',
      params: { workspaceId },
      search: (
        prev: { preset?: string; mode?: 'overview' | 'custom' },
      ): { preset?: string; mode?: 'overview' | 'custom' } => ({
        mode: (next.mode ?? prev.mode) === 'custom' ? 'custom' : undefined,
        preset: (next.preset === undefined ? prev.preset : next.preset) ?? undefined,
      }),
      replace: true,
    })
  const setViewMode = (mode: 'overview' | 'custom') => goDashboard({ mode })
  const setActivePresetId = (id: string | null) => goDashboard({ preset: id, mode: 'custom' })
  const [isSaving, setIsSaving] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [refreshMs, setRefreshMs] = useState<number>(REFRESH_INTERVALS[0])
  const [sharing, setSharing] = useState<{ id: string; name: string } | null>(null)
  const user = useAuthStore((s) => s.user)
  const displayName = user?.displayName ?? 'there'
  const userId = user?.id
  const qc = useQueryClient()

  /*
   * §5.7 — setting and clearing the workspace's default dashboard ask
   * `dashboard.workspace_default.manage`, as the API does: an admin's by default,
   * not a manager's, and grantable by a custom role
   * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`). This
   * asked the admin role, so a member granted the key was offered neither.
   * Everybody else sees the "Workspace default" badge and no control.
   */
  const canManageWorkspaceDefault = usePermissions(workspaceId).can('dashboard.workspace_default.manage') === true

  // A refused or failed set or clear says so, rather than doing nothing.
  const workspaceDefaultFailed = (err: unknown) =>
    toast.error(t('dashboard.workspaceDefaultError'), err instanceof ApiError ? { description: err.message } : undefined)
  const setWorkspaceDefault = useMutation({
    mutationFn: (presetId: string) =>
      api(`/dashboards/workspace/${workspaceId}/preset/${presetId}/workspace-default`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-presets', workspaceId] }),
    onError: workspaceDefaultFailed,
  })
  const clearWorkspaceDefault = useMutation({
    mutationFn: () =>
      api(`/dashboards/workspace/${workspaceId}/workspace-default`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard-presets', workspaceId] }),
    onError: workspaceDefaultFailed,
  })

  const { data: workspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api<Workspace>(`/workspaces/${workspaceId}`),
  })

  const { data: presets = [] } = useQuery({
    queryKey: ['dashboard-presets', workspaceId],
    queryFn: () => api<Preset[]>(`/dashboards/workspace/${workspaceId}`),
  })

  /*
   * The one asked for, else your own default, else the workspace's — "Members
   * without their own default dashboard land on the workspace default", as the
   * controls' hint says and `GET /dashboards/workspace/:id/default` answers — and
   * only then the first row. The list has no order, so without the workspace
   * default in between a member landed on whichever preset came back first.
   * `isDefault` is its OWNER's personal default, so it counts only on your own:
   * a colleague's shared preset that is their default is not yours.
   */
  const activePreset =
    presets.find((p) => p.id === activePresetId) ||
    presets.find((p) => p.isDefault && p.isOwner) ||
    presets.find((p) => p.isWorkspaceDefault) ||
    presets[0]

  /*
   * Two reads, because the page asks two different questions.
   *
   * "Recent activity" is genuinely workspace-wide, so it takes the workspace
   * listing. Everything about YOU — due today, overdue, completed this week —
   * used to come out of that same 500-row window by filtering it in the
   * browser, and that is wrong in a way that reads as fact: the 500 are
   * everyone's, ordered by most recently updated, so one person's share of
   * them can be a handful of rows or none. Overdue suffers most, because a
   * task is overdue precisely when nobody has touched it — exactly what sorts
   * it out of a recently-updated window — and the card then said "Overdue: 0".
   *
   * `assigneeId=me` puts the predicate in SQL, before the limit.
   */
  const { data: tasks = [], isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['dashboard-tasks', workspaceId],
    queryFn: () => api<Task[]>(`/tasks/workspace/${workspaceId}?limit=500`),
    refetchInterval: refreshMs === 0 ? false : refreshMs,
  })
  const { data: myTasks = [] } = useQuery({
    queryKey: ['dashboard-my-tasks', workspaceId, userId],
    enabled: Boolean(userId),
    queryFn: () => api<Task[]>(`/tasks/workspace/${workspaceId}?limit=500&assigneeId=me`),
    refetchInterval: refreshMs === 0 ? false : refreshMs,
  })

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })

  const mine = myTasks

  // Custom statuses replaced the old enum — bucket by the canonical
  // `statusCategory` so dashboards work regardless of how a workspace
  // has renamed its statuses.
  const isActive = (t: Task) => t.statusCategory !== 'closed'

  const dueToday = mine
    .filter((t) => t.dueDate && isToday(new Date(t.dueDate)) && isActive(t))
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))

  const overdue = mine.filter(
    (t) =>
      t.dueDate &&
      isBefore(new Date(t.dueDate), now) &&
      !isToday(new Date(t.dueDate)) &&
      isActive(t),
  )

  const completedThisWeek = mine.filter(
    (t) =>
      t.statusCategory === 'closed' &&
      t.completedAt &&
      isAfter(new Date(t.completedAt), weekStart),
  )

  const inProgress = mine.filter((t) => t.statusCategory === 'in_progress')

  const weekTotal = mine.filter((t) => {
    const ref = t.updatedAt ?? t.createdAt
    return ref ? isAfter(new Date(ref), weekStart) : false
  }).length
  const weekDone = completedThisWeek.length
  const completionPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0

  const myAssigned = mine
    .filter(isActive)
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return 0
    })
    .slice(0, 10)

  const recent = [...tasks]
    .filter((t) => t.updatedAt)
    .sort((a, b) => (a.updatedAt! < b.updatedAt! ? 1 : -1))
    .slice(0, 10)

  return (
    <DemoDataEmptyState workspaceId={workspaceId}>
    {/*
      * Named so a test can tell this page from any other. The sweep used to
      * assert /Dashboard|Widget/ against the whole document, which the word
      * "Dashboards" in the sidebar satisfies on every page in the app — so it
      * passed while pointed at the wrong URL entirely.
      */}
    <div className="max-w-7xl mx-auto p-8" data-testid="dashboard-page">
      <header className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-4xl font-semibold text-foreground mb-1">
              {t(greetingKey())}, {displayName}
            </h1>
            <p className="text-muted-foreground">
              {format(now, 'EEEE, MMMM d, yyyy')}
              {workspace ? <> &middot; {workspace.name}</> : null}
            </p>
          </div>
          {viewMode === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* §5.7 — badge marks whichever preset is the workspace default. */}
              {activePreset?.isWorkspaceDefault && (
                <Badge variant="secondary" className="gap-1 whitespace-nowrap">
                  <Star className="h-3 w-3" />
                  {t('dashboard.workspaceDefaultBadge')}
                </Badge>
              )}
              {/* §5.7 — set/clear the workspace-wide default: `dashboard.workspace_default.manage`. */}
              {canManageWorkspaceDefault && activePreset?.id && (
                activePreset.isWorkspaceDefault ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clearWorkspaceDefault.isPending}
                    title={t('dashboard.workspaceDefaultHint')}
                    onClick={() => clearWorkspaceDefault.mutate()}
                  >
                    {t('dashboard.clearWorkspaceDefault')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={setWorkspaceDefault.isPending}
                    title={t('dashboard.workspaceDefaultHint')}
                    onClick={() => setWorkspaceDefault.mutate(activePreset.id)}
                  >
                    <Star className="h-3.5 w-3.5 mr-1.5" />
                    {t('dashboard.setWorkspaceDefault')}
                  </Button>
                )
              )}
              <Button size="sm" onClick={() => setIsSaving(true)}>{t('dashboard.savePreset')}</Button>
            </div>
          )}
          {/* A5.13 — freshness and delivery. The scheduler already exists in
              the report builder; this is the missing way in from a dashboard. */}
          {viewMode === 'overview' && (
            <div className="flex flex-wrap items-center gap-2">
              {/*
                §G01-8 — the shared control. This was the only surface that had
                one; it is the same component the list uses now, so "last
                updated" cannot come to mean two different things in two places.
              */}
              <FreshnessControls
                refreshMs={refreshMs}
                onRefreshMsChange={setRefreshMs}
                dataUpdatedAt={dataUpdatedAt}
                onRefreshNow={() => void refetch()}
                busy={isLoading}
              />
              {/* The scheduler lives in the report builder; this is the way in,
                  not a second scheduler. */}
              <Button size="sm" variant="outline" asChild>
                <a href={`/app/${workspaceId}/reports?tab=custom`}>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {t('dashboard.scheduleDelivery')}
                </a>
              </Button>
            </div>
          )}
        </div>
        <div className="mt-4 inline-flex rounded-lg border border-border/60 bg-card/30 p-1">
          <button
            onClick={() => setViewMode('overview')}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md',
              viewMode === 'overview' ? 'bg-brand-gradient text-white' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('dashboard.overview')}
          </button>
          <button
            onClick={() => setViewMode('custom')}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md',
              viewMode === 'custom' ? 'bg-brand-gradient text-white' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('dashboard.customDashboard')}
          </button>
        </div>
      </header>

      {viewMode === 'custom' ? (
        <div className="space-y-4">
          <Card className="p-4 md:p-5 border-border/70 bg-card/70 backdrop-blur">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  {activePreset ? activePreset.name : t('dashboard.customBuilderTitle')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('dashboard.customBuilderDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewMode('overview')}>
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                  {t('dashboard.backToOverview')}
                </Button>
              </div>
            </div>
          </Card>

          {/* A5.11 — a browsable index in place of the old bare <select>: who
              owns each dashboard, whether it is shared, and a way to share it. */}
          <DashboardsIndex
            presets={presets}
            activePresetId={activePreset?.id ?? null}
            onSelect={setActivePresetId}
            onShare={(preset) => setSharing({ id: preset.id, name: preset.name })}
          />

          {presets.length === 0 && (
            <DashboardTemplateCards workspaceId={workspaceId} onCreated={setActivePresetId} />
          )}

          <DashboardWidgetBuilder preset={activePreset} workspaceId={workspaceId} />

          {isSaving && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
              <Card className="w-full max-w-md p-6">
                <h3 className="font-display text-xl font-semibold mb-4">{t('dashboard.savePresetTitle')}</h3>
                <label className="block text-sm font-medium mb-2 text-foreground">{t('dashboard.presetName')}</label>
                <Input
                  placeholder={t('dashboard.presetPlaceholder')}
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                />
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="ghost" onClick={() => setIsSaving(false)}>{t('common.cancel')}</Button>
                  <Button onClick={async () => {
                    await api('/dashboards', {
                      method: 'POST',
                      body: JSON.stringify({
                        workspaceId,
                        name: newPresetName,
                        layout: activePreset?.layout || [],
                      })
                    })
                    qc.invalidateQueries({ queryKey: ['dashboard-presets', workspaceId] })
                    setIsSaving(false)
                    setNewPresetName('')
                  }}>{t('common.save')}</Button>
                </div>
              </Card>
            </div>
          )}

          {sharing && (
            <SharePanel
              open
              onOpenChange={(next) => { if (!next) setSharing(null) }}
              objectType="dashboard"
              objectId={sharing.id}
              objectName={sharing.name}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <WidgetCard title={t('dashboard.dueToday')} icon={Clock} accent="brand" count={dueToday.length} loading={isLoading}>
            {dueToday.length === 0 ? (
              <EmptyLine>{t('dashboard.dueTodayEmpty')}</EmptyLine>
            ) : (
              <ul className="space-y-1.5">
                {dueToday.slice(0, 5).map((t) => (
                  <TaskRow key={t.id} task={t} workspaceId={workspaceId} />
                ))}
              </ul>
            )}
          </WidgetCard>

          <WidgetCard title={t('dashboard.overdue')} icon={AlertCircle} accent="red" count={overdue.length} loading={isLoading}>
            {overdue.length === 0 ? (
              <EmptyLine>{t('dashboard.overdueEmpty')}</EmptyLine>
            ) : (
              <ul className="space-y-1.5">
                {overdue.slice(0, 5).map((t) => (
                  <TaskRow key={t.id} task={t} workspaceId={workspaceId} tone="red" />
                ))}
              </ul>
            )}
          </WidgetCard>

          <WidgetCard title={t('dashboard.completedThisWeek')} icon={CheckCircle2} accent="green" count={completedThisWeek.length} loading={isLoading}>
            <p className="text-xs text-muted-foreground">{t('dashboard.completedDesc')}</p>
          </WidgetCard>

          <WidgetCard title={t('dashboard.inProgress')} icon={TrendingUp} accent="blue" count={inProgress.length} loading={isLoading}>
            <p className="text-xs text-muted-foreground">{t('dashboard.inProgressDesc')}</p>
          </WidgetCard>

          <Card className="p-5 md:col-span-2 lg:col-span-2">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">{t('dashboard.weekCompletion')}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.weekCompletionDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <CompletionRing pct={completionPct} />
              <div className="space-y-1.5">
                <LegendDot color="hsl(var(--brand-700))" label={t('dashboard.completedCount', { count: weekDone })} />
                <LegendDot color="hsl(var(--muted))" label={t('dashboard.remainingCount', { count: Math.max(weekTotal - weekDone, 0) })} />
                <div className="text-xs text-muted-foreground pt-1">
                  {weekTotal === 0 ? t('dashboard.noActivityWeek') : tCount('dashboard.basedOn', weekTotal)}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5 md:col-span-2 lg:col-span-2 row-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">{t('dashboard.myAssigned')}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.myAssignedDesc')}</p>
              </div>
              <span className="text-xs font-medium rounded-full bg-brand-100 text-accent px-2 py-0.5">{myAssigned.length}</span>
            </div>
            {myAssigned.length === 0 ? (
              <EmptyLine>{t('dashboard.myAssignedEmpty')}</EmptyLine>
            ) : (
              <ul className="divide-y divide-border">
                {myAssigned.map((t) => (
                  <li key={t.id} className="py-2 first:pt-0 last:pb-0">
                    <TaskRow task={t} workspaceId={workspaceId} verbose />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5 md:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent" />
                <h2 className="font-display text-lg font-semibold text-foreground">{t('dashboard.recentActivity')}</h2>
              </div>
            </div>
            {recent.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.recentEmpty')}</div>
            ) : (
              <ul className="space-y-2">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-700 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/app/$workspaceId/$spaceId/$projectId/$listId"
                        params={{
                          workspaceId,
                          spaceId: t.spaceId,
                          projectId: t.projectId,
                          listId: t.listId,
                        }}
                        className="font-medium truncate hover:text-accent transition-colors block"
                      >
                        {t.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {t.assignees[0]?.displayName ?? 'Someone'}
                        {' · '}
                        {t.updatedAt ? formatDistanceToNowStrict(new Date(t.updatedAt), { addSuffix: true }) : 'recently'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
    </DemoDataEmptyState>
  )
}

/**
 * A5.11 — the dashboards hub. "My" is the presets you own, "Shared with me" is
 * a grant in `object_shares`, and the workspace default is the one an admin
 * pinned — all three already existed in the data; only the index did not.
 */
function DashboardsIndex({
  presets,
  activePresetId,
  onSelect,
  onShare,
}: {
  presets: Preset[]
  activePresetId: string | null
  onSelect: (id: string) => void
  onShare: (preset: Preset) => void
}) {
  const { t } = useTranslation()
  if (presets.length === 0) return null

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-start font-semibold px-4 py-2.5">{t('dashboard.colName')}</th>
              <th className="text-start font-semibold px-4 py-2.5">{t('dashboard.colOwner')}</th>
              <th className="text-start font-semibold px-4 py-2.5">{t('dashboard.colSharing')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {presets.map((preset) => (
              <tr
                key={preset.id}
                className={cn(
                  'border-b border-border/50 last:border-0 hover:bg-muted/30 group',
                  preset.id === activePresetId && 'bg-accent/10',
                )}
              >
                <td className="px-4 py-2.5">
                  <button
                    className="font-medium hover:text-accent"
                    data-testid={`dashboard-preset-${preset.id}`}
                    onClick={() => onSelect(preset.id)}
                  >
                    {preset.name}
                  </button>
                  {preset.isWorkspaceDefault && (
                    <Badge variant="secondary" className="ms-2 gap-1">
                      <Star className="h-3 w-3" />
                      {t('dashboard.workspaceDefaultBadge')}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {preset.isOwner
                    ? t('dashboard.ownerYou')
                    : preset.ownerName ?? preset.ownerEmail ?? t('dashboard.ownerUnknown')}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  <span className="inline-flex items-center gap-1 text-xs">
                    {preset.isSharedWithMe ? (
                      <><Users className="h-3 w-3" /> {t('dashboard.sharingWithMe')}</>
                    ) : preset.shareCount > 0 ? (
                      <><Share2 className="h-3 w-3" /> {t('dashboard.sharingCount', { count: preset.shareCount })}</>
                    ) : (
                      t('dashboard.sharingPrivate')
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-end">
                  {preset.isOwner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      onClick={() => onShare(preset)}
                      title={t('dashboard.shareDashboard')}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function WidgetCard({ title, icon: Icon, accent, count, loading, children }: any) {
  const accentClasses = {
    brand: 'bg-brand-100 text-accent',
    red: 'bg-red-100 text-red-700',
    green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
  }[accent as 'brand']

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${accentClasses}`}>{loading ? '…' : count}</span>
      </div>
      <div className="font-display text-3xl font-semibold text-foreground mb-2">{loading ? '—' : count}</div>
      {children}
    </Card>
  )
}

function TaskRow({ task, workspaceId, tone, verbose }: any) {
  const due = task.dueDate ? new Date(task.dueDate) : null
  const content = (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone === 'red' ? 'bg-red-500' : 'bg-brand-700'}`} />
      <span className="truncate text-sm flex-1">{task.title}</span>
      {verbose && due ? <span className="text-xs text-muted-foreground shrink-0">{format(due, 'MMM d')}</span> : null}
    </div>
  )

  return (
    <Link
      to="/app/$workspaceId/$spaceId/$projectId/$listId"
      params={{ workspaceId, spaceId: task.spaceId!, projectId: task.projectId!, listId: task.listId }}
      className="block hover:text-accent transition-colors"
    >
      {content}
    </Link>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

function CompletionRing({ pct }: { pct: number }) {
  const size = 120
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (pct / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--brand-700))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-2xl font-semibold text-foreground">{pct}%</span>
      </div>
    </div>
  )
}
