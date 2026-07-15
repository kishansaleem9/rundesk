import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, cn, Input } from '@rundesk/ui'
import { useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { format, formatDistanceToNowStrict, isAfter, isBefore, isToday, startOfWeek } from 'date-fns'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { DashboardWidgetBuilder } from '../components/dashboard-widget-builder'
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

export const Route = createFileRoute('/app/$workspaceId/dashboard')({
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
  const [viewMode, setViewMode] = useState<'overview' | 'custom'>('overview')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const user = useAuthStore((s) => s.user)
  const displayName = user?.displayName ?? 'there'
  const userId = user?.id
  const qc = useQueryClient()

  const { data: workspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api<Workspace>(`/workspaces/${workspaceId}`),
  })

  const { data: presets = [] } = useQuery({
    queryKey: ['dashboard-presets', workspaceId],
    queryFn: () => api<any[]>(`/dashboards/workspace/${workspaceId}`),
  })

  const activePreset = presets.find((p) => p.id === activePresetId) || presets.find((p) => p.isDefault) || presets[0]

  // Single denormalised query — see Task type comment above.
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['dashboard-tasks', workspaceId],
    queryFn: () => api<Task[]>(`/tasks/workspace/${workspaceId}?limit=500`),
  })

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })

  const mine = tasks.filter((t) =>
    (t.assignees ?? []).some((a) => a.userId === userId),
  )

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
    <div className="max-w-7xl mx-auto p-8">
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
            <div className="flex items-center gap-2">
              <select
                className="h-9 px-3 rounded-md border border-border bg-card text-sm"
                value={activePresetId || ''}
                onChange={(e) => setActivePresetId(e.target.value)}
              >
                <option value="">{t('dashboard.defaultLayout')}</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Button size="sm" onClick={() => setIsSaving(true)}>{t('dashboard.savePreset')}</Button>
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
