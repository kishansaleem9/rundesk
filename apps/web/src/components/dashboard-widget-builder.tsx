import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import {
  Card,
  Button,
  Badge,
  Input,
  cn,
  toast,
} from '@rundesk/ui'
import {
  CheckCircle2,
  Clock,
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
  Users,
  Target,
  Calendar,
  Gauge,
  ListFilter,
  Plus,
  GripVertical,
  X,
  Sparkles,
  Settings as SettingsIcon,
  Search,
  Loader2,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  Sun,
} from 'lucide-react'
import { InlineSkeleton } from './loading-skeletons'

type WidgetType =
  | 'tasks-due'
  | 'overdue'
  | 'completion'
  | 'activity'
  | 'team-load'
  | 'sprint-burndown'
  | 'goals'
  | 'time'
  | 'pie-status'
  | 'bar-priority'
  | 'project-health'
  | 'task-list'
  | 'ai-briefing'

const WIDGET_CATALOG: Array<{
  type: WidgetType
  labelKey: TranslationKey
  descKey: TranslationKey
  icon: React.ElementType
  category: 'metrics' | 'lists' | 'charts'
}> = [
  { type: 'tasks-due', labelKey: 'dashboardWidget.name.tasksDue', descKey: 'dashboardWidget.desc.tasksDue', icon: CheckCircle2, category: 'metrics' },
  { type: 'overdue', labelKey: 'dashboardWidget.name.overdue', descKey: 'dashboardWidget.desc.overdue', icon: Clock, category: 'metrics' },
  { type: 'completion', labelKey: 'dashboardWidget.name.completion', descKey: 'dashboardWidget.desc.completion', icon: TrendingUp, category: 'metrics' },
  { type: 'activity', labelKey: 'dashboardWidget.name.activity', descKey: 'dashboardWidget.desc.activity', icon: Activity, category: 'lists' },
  { type: 'team-load', labelKey: 'dashboardWidget.name.teamLoad', descKey: 'dashboardWidget.desc.teamLoad', icon: Users, category: 'lists' },
  { type: 'sprint-burndown', labelKey: 'dashboardWidget.name.sprintBurndown', descKey: 'dashboardWidget.desc.sprintBurndown', icon: BarChart3, category: 'charts' },
  { type: 'goals', labelKey: 'dashboardWidget.name.goals', descKey: 'dashboardWidget.desc.goals', icon: Target, category: 'lists' },
  { type: 'time', labelKey: 'dashboardWidget.name.time', descKey: 'dashboardWidget.desc.time', icon: Calendar, category: 'metrics' },
  { type: 'pie-status', labelKey: 'dashboardWidget.name.pieStatus', descKey: 'dashboardWidget.desc.pieStatus', icon: PieChart, category: 'charts' },
  { type: 'bar-priority', labelKey: 'dashboardWidget.name.barPriority', descKey: 'dashboardWidget.desc.barPriority', icon: BarChart3, category: 'charts' },
  { type: 'project-health', labelKey: 'dashboardWidget.name.projectHealth', descKey: 'dashboardWidget.desc.projectHealth', icon: Gauge, category: 'charts' },
  { type: 'task-list', labelKey: 'dashboardWidget.name.taskList', descKey: 'dashboardWidget.desc.taskList', icon: ListFilter, category: 'lists' },
  // §A5.15 / §A6.5 — the briefing already generates on a schedule; on a
  // dashboard it also needs to run on demand.
  { type: 'ai-briefing', labelKey: 'dashboardWidget.name.aiBriefing', descKey: 'dashboardWidget.desc.aiBriefing', icon: Sun, category: 'lists' },
]

type Widget = { id: string; type: WidgetType; w: 1 | 2 | 3; h: 1 | 2 }

const DEFAULT_LAYOUT: Widget[] = [
  { id: '1', type: 'tasks-due', w: 1, h: 1 },
  { id: '2', type: 'overdue', w: 1, h: 1 },
  { id: '3', type: 'completion', w: 1, h: 1 },
  { id: '4', type: 'time', w: 1, h: 1 },
  { id: '5', type: 'sprint-burndown', w: 2, h: 2 },
  { id: '6', type: 'team-load', w: 2, h: 2 },
  { id: '7', type: 'activity', w: 3, h: 1 },
  { id: '8', type: 'pie-status', w: 1, h: 1 },
]

export function DashboardWidgetBuilder({ preset, workspaceId }: { preset?: any; workspaceId: string }) {
  const { t, tCount } = useTranslation()
  const [widgets, setWidgets] = useState<Widget[]>(preset?.layout || DEFAULT_LAYOUT)
  const [editing, setEditing] = useState(false)
  /*
   * WHOSE LAYOUT THIS SAVES TO. `PUT /dashboards/:id` is the owner's, so on a
   * dashboard somebody else made — the workspace default, or one shared with
   * you — Edit then Save answered "Preset not found" and threw the work away
   * (found-28-sep/dashboard-edit-offered-on-others-presets). There the builder
   * offers to make your own copy instead, and saves it as your dashboard.
   */
  const owns = !preset?.id || preset.isOwner !== false
  const [paletteFilter, setPaletteFilter] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    if (preset?.layout) {
      setWidgets(preset.layout)
    }
  }, [preset])

  function addWidget(type: WidgetType) {
    setWidgets((arr) => [...arr, { id: crypto.randomUUID(), type, w: 1, h: 1 }])
  }
  function removeWidget(id: string) {
    setWidgets((arr) => arr.filter((w) => w.id !== id))
  }
  function resizeWidget(id: string, patch: Partial<Pick<Widget, 'w' | 'h'>>) {
    setWidgets((arr) => arr.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  }

  // Native HTML5 drag-and-drop reorder. Moves the dragged widget to the slot
  // of the widget it was dropped on; the new order persists via Save layout.
  function reorder(sourceId: string, targetId: string) {
    if (sourceId === targetId) return
    setWidgets((arr) => {
      const from = arr.findIndex((w) => w.id === sourceId)
      const to = arr.findIndex((w) => w.id === targetId)
      if (from === -1 || to === -1) return arr
      const next = [...arr]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }
  function handleDrop(targetId: string) {
    if (dragId) reorder(dragId, targetId)
    setDragId(null)
    setDropTargetId(null)
  }

  const suggestLayout = useMutation({
    mutationFn: () =>
      api<{ widgets: string[]; reasoning: string }>('/ai/dashboard/suggest-layout', {
        method: 'POST',
        body: {
          availableWidgets: WIDGET_CATALOG.map((c) => ({ type: c.type, label: t(c.labelKey) })),
          context: `Workspace dashboard with ${widgets.length} widgets currently in use: ${widgets
            .map((w) => w.type)
            .join(', ')}`,
        },
      }),
    onSuccess: (res) => {
      const valid = WIDGET_CATALOG.map((c) => c.type)
      const ordered = res.widgets.filter((wt): wt is WidgetType => valid.includes(wt as WidgetType))
      if (ordered.length === 0) {
        toast(t('dashboardWidget.noSuggestion'), { description: res.reasoning || t('dashboardWidget.tryAgainLater') })
        return
      }
      setWidgets((arr) => {
        // Reuse existing widget instances (preserving size) when the type is
        // already present, otherwise create a fresh tile for the new type.
        const pool = [...arr]
        return ordered.map((type) => {
          const idx = pool.findIndex((w) => w.type === type)
          if (idx !== -1) return pool.splice(idx, 1)[0]
          return { id: crypto.randomUUID(), type, w: 1 as const, h: 1 as const }
        })
      })
      setEditing(true)
      toast.success(t('dashboardWidget.suggestedNewLayout'), { description: res.reasoning || undefined })
    },
    onError: (err: unknown) => {
      toast.error(t('dashboardWidget.couldNotSuggest'), {
        description: err instanceof ApiError ? err.message : t('dashboardWidget.somethingWrong'),
      })
    },
  })

  const handleSaveLayout = async () => {
    try {
      if (preset?.id && owns) {
        await api(`/dashboards/${preset.id}`, { method: 'PUT', body: { layout: widgets } })
      } else {
        // No preset yet, or somebody else's — persist the edited layout as a
        // new default dashboard of your own instead of discarding the changes.
        await api('/dashboards', {
          method: 'POST',
          body: { workspaceId, name: t('dashboardWidget.myDashboard'), layout: widgets, isDefault: true },
        })
      }
      await qc.invalidateQueries({ queryKey: ['dashboard-presets', workspaceId] })
      toast.success(t('dashboardWidget.layoutSaved'))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('dashboardWidget.couldNotSaveLayout'))
      return
    }
    setEditing(false)
  }

  const filtered = WIDGET_CATALOG.filter((c) => t(c.labelKey).toLowerCase().includes(paletteFilter.toLowerCase()))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="soft" className="text-[10px] uppercase">{tCount('dashboardWidget.widgetCount', widgets.length)}</Badge>
            {editing && <Badge variant="gradient" className="text-[10px] uppercase">{t('dashboardWidget.editMode')}</Badge>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => suggestLayout.mutate()}
              disabled={suggestLayout.isPending}
            >
              {suggestLayout.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t('dashboardWidget.aiSuggestLayout')}
            </Button>
            {editing ? (
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => { setWidgets(preset?.layout || DEFAULT_LAYOUT); setEditing(false); }}>{t('common.cancel')}</Button>
                <Button variant="gradient" size="sm" onClick={handleSaveLayout}>{t('dashboardWidget.saveLayout')}</Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                data-testid="dashboard-edit"
                title={owns ? undefined : t('dashboardWidget.notYoursHint')}
                onClick={() => setEditing(true)}
              >
                <SettingsIcon className="h-3.5 w-3.5" /> {owns ? t('dashboardWidget.editDashboard') : t('dashboardWidget.makeMyOwn')}
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-[140px] gap-3">
          {widgets.map((w) => (
            <WidgetCell
              key={w.id}
              widget={w}
              workspaceId={workspaceId}
              editing={editing}
              dragging={dragId === w.id}
              dropTarget={dropTargetId === w.id && dragId !== w.id}
              onRemove={() => removeWidget(w.id)}
              onResize={(patch) => resizeWidget(w.id, patch)}
              onDragStart={() => setDragId(w.id)}
              onDragEnter={() => { if (dragId && dragId !== w.id) setDropTargetId(w.id) }}
              onDragEnd={() => { setDragId(null); setDropTargetId(null) }}
              onDrop={() => handleDrop(w.id)}
            />
          ))}
          {editing && (
            <button
              onClick={() => addWidget('tasks-due')}
              className="col-span-1 row-span-1 flex items-center justify-center rounded-xl border-2 border-dashed border-border/60 hover:border-accent hover:bg-card/30 transition-colors text-muted-foreground hover:text-foreground gap-2 text-sm"
            >
              <Plus className="h-4 w-4" /> {t('dashboardWidget.addWidget')}
            </button>
          )}
        </div>
        </div>
      </div>

      {editing && (
        <Card variant="glass" className="p-0 overflow-hidden flex flex-col h-fit max-h-[640px] xl:sticky xl:top-4">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex-1">
              {t('dashboardWidget.widgetCatalog')}
            </span>
          </div>
          <div className="px-3 py-2 border-b border-border/40">
            <Input
              leadingIcon={<Search className="h-3.5 w-3.5" />}
              placeholder={t('dashboardWidget.searchWidgets')}
              value={paletteFilter}
              onChange={(e) => setPaletteFilter(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {filtered.map((c) => (
              <button
                key={c.type}
                onClick={() => addWidget(c.type)}
                className="w-full flex items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-card/60 transition-colors group"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent shrink-0">
                  <c.icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t(c.labelKey)}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1">{t(c.descKey)}</div>
                </div>
                <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1.5" />
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function WidgetCell({
  widget,
  workspaceId,
  editing,
  dragging,
  dropTarget,
  onRemove,
  onResize,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  widget: Widget
  workspaceId: string
  editing: boolean
  dragging: boolean
  dropTarget: boolean
  onRemove: () => void
  onResize: (patch: Partial<Pick<Widget, 'w' | 'h'>>) => void
  onDragStart: () => void
  onDragEnter: () => void
  onDragEnd: () => void
  onDrop: () => void
}) {
  const { t, tCount } = useTranslation()
  const meta = WIDGET_CATALOG.find((c) => c.type === widget.type)
  const Icon = meta?.icon ?? CheckCircle2
  const nextWidth: Widget['w'] = widget.w >= 3 ? 1 : ((widget.w + 1) as Widget['w'])
  return (
    <Card
      variant="glass"
      draggable={editing}
      onDragStart={(e) => {
        if (!editing) return
        e.dataTransfer.effectAllowed = 'move'
        // Firefox requires data to be set for drag to initiate.
        e.dataTransfer.setData('text/plain', widget.id)
        onDragStart()
      }}
      onDragOver={(e) => {
        if (editing) e.preventDefault()
      }}
      onDragEnter={() => editing && onDragEnter()}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        if (!editing) return
        e.preventDefault()
        onDrop()
      }}
      className={cn(
        'group relative p-3 overflow-hidden',
        widget.w === 2 && 'col-span-2',
        widget.w === 3 && 'col-span-3',
        widget.h === 2 && 'row-span-2',
        editing && 'ring-2 ring-accent/30 hover:ring-accent/50',
        dragging && 'opacity-40',
        dropTarget && 'ring-2 ring-accent ring-offset-2 ring-offset-background',
      )}
    >
      {editing && (
        <>
          <div
            className="absolute top-1.5 left-1.5 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-card/70 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={t('dashboardWidget.dragToReorder')}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onResize({ w: nextWidth })}
              title={t('dashboardWidget.widthTooltip', { from: widget.w, cols: tCount('dashboardWidget.widthColumns', nextWidth) })}
              aria-label={t('dashboardWidget.cycleWidth')}
              className="p-1 rounded bg-card/70 hover:bg-card text-muted-foreground hover:text-foreground"
            >
              {widget.w >= 3 ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={() => onResize({ h: widget.h === 2 ? 1 : 2 })}
              title={widget.h === 2 ? t('dashboardWidget.shrinkHeight') : t('dashboardWidget.growHeight')}
              aria-label={t('dashboardWidget.toggleHeight')}
              className="p-1 rounded bg-card/70 hover:bg-card text-muted-foreground hover:text-foreground"
            >
              {widget.h === 2 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
          <button
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      <WidgetPreview widget={widget} icon={Icon} workspaceId={workspaceId} />
    </Card>
  )
}

function WidgetPreview({
  widget,
  icon: Icon,
  workspaceId,
}: {
  widget: Widget
  icon: React.ElementType
  workspaceId: string
}) {
  if (widget.type === 'tasks-due') return <TasksDueTile Icon={Icon} workspaceId={workspaceId} />
  if (widget.type === 'overdue') return <OverdueTile Icon={Icon} workspaceId={workspaceId} />
  if (widget.type === 'completion') return <CompletionTile Icon={Icon} workspaceId={workspaceId} />
  if (widget.type === 'time') return <TimeTile Icon={Icon} workspaceId={workspaceId} />
  if (widget.type === 'pie-status') return <PieStatusWidget workspaceId={workspaceId} />
  if (widget.type === 'sprint-burndown') return <SprintBurndownWidget workspaceId={workspaceId} />
  if (widget.type === 'team-load') return <TeamLoadWidget workspaceId={workspaceId} />
  if (widget.type === 'activity') return <ActivityWidget workspaceId={workspaceId} />
  if (widget.type === 'goals') return <GoalsWidget workspaceId={workspaceId} />
  if (widget.type === 'bar-priority') return <BarPriorityWidget workspaceId={workspaceId} />
  if (widget.type === 'project-health') return <ProjectHealthWidget workspaceId={workspaceId} />
  if (widget.type === 'task-list') return <TaskListWidget workspaceId={workspaceId} />
  if (widget.type === 'ai-briefing') return <AiBriefingWidget />
  return null
}

function BarPriorityWidget({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  type ProjectBreakdown = { byPriority?: Record<string, number> }
  const q = useQuery({
    queryKey: ['reports-priority-breakdown', workspaceId],
    queryFn: () => api<ProjectBreakdown>(`/workspaces/${workspaceId}/reports/overview`),
  })
  const breakdown = (q.data?.byPriority ?? {}) as Record<string, number>
  const entries: Array<{ key: string; labelKey: TranslationKey; v: number; c: string }> = [
    { key: 'urgent', labelKey: 'dashboardWidget.priorityUrgent', v: breakdown.urgent ?? 0, c: 'bg-destructive' },
    { key: 'high', labelKey: 'dashboardWidget.priorityHigh', v: breakdown.high ?? 0, c: 'bg-warning' },
    { key: 'normal', labelKey: 'dashboardWidget.priorityNormal', v: breakdown.normal ?? 0, c: 'bg-accent' },
    { key: 'low', labelKey: 'dashboardWidget.priorityLow', v: breakdown.low ?? 0, c: 'bg-muted-foreground' },
  ]
  const max = Math.max(1, ...entries.map((b) => b.v))
  if (q.isError) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{t('dashboardWidget.byPriority')}</div>
        <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground">
          {t('dashboardWidget.priorityLoadError')}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{t('dashboardWidget.byPriority')}</div>
      <div className="flex items-end gap-2 mt-2 h-16">
        {entries.map((b) => (
          <div key={b.key} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t flex items-end h-full">
              <div
                className={cn('w-full rounded-t', b.c)}
                style={{ height: `${Math.max(4, (b.v / max) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">
              {t(b.labelKey)} · {b.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type DueTask = {
  id: string
  title: string
  priority?: 'urgent' | 'high' | 'normal' | 'low' | null
  listId: string
  projectId: string
  projectName: string
  spaceId: string
}

function priorityDotClass(priority?: string | null): string {
  switch (priority) {
    case 'urgent':
      return 'bg-destructive'
    case 'high':
      return 'bg-warning'
    case 'low':
      return 'bg-muted-foreground'
    default:
      return 'bg-accent'
  }
}

function TasksDueTile({ Icon, workspaceId }: { Icon: React.ElementType; workspaceId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['reports-overview', workspaceId],
    queryFn: () =>
      api<{ dueToday: number; total: number; dueTodayList: DueTask[] }>(
        `/workspaces/${workspaceId}/reports/overview`,
      ),
  })
  const list = q.data?.dueTodayList ?? []
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        {t('dashboardWidget.dueToday')}
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="font-display text-3xl font-semibold tabular-nums">{q.data?.dueToday ?? '—'}</span>
        <span className="text-[10px] text-muted-foreground">
          {q.data ? t('dashboardWidget.ofTotal', { total: q.data.total }) : <InlineSkeleton width="4rem" />}
        </span>
      </div>
      <ul className="mt-2 space-y-1 overflow-hidden flex-1">
        {q.data && list.length === 0 && (
          <li className="text-[11px] text-muted-foreground">{t('dashboardWidget.dueTodayEmpty')}</li>
        )}
        {list.slice(0, 6).map((task) => (
          <li key={task.id}>
            <Link
              to="/app/$workspaceId/$spaceId/$projectId/$listId"
              params={{ workspaceId, spaceId: task.spaceId, projectId: task.projectId, listId: task.listId }}
              className="flex items-center gap-1.5 text-[11px] hover:text-accent transition-colors"
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', priorityDotClass(task.priority))} />
              <span className="truncate">{task.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OverdueTile({ Icon, workspaceId }: { Icon: React.ElementType; workspaceId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['reports-overview', workspaceId],
    queryFn: () =>
      api<{ overdue: number }>(`/workspaces/${workspaceId}/reports/overview`),
  })
  const overdue = q.data?.overdue ?? 0
  return (
    <Tile
      label={t('dashboardWidget.overdue')}
      value={overdue}
      hint={overdue === 0 ? t('dashboardWidget.allCaughtUp') : t('dashboardWidget.rescheduleThem')}
      Icon={Icon}
      tone={overdue > 0 ? 'warning' : undefined}
    />
  )
}

function CompletionTile({ Icon, workspaceId }: { Icon: React.ElementType; workspaceId: string }) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const days = period === 'week' ? 7 : 30
  const q = useQuery({
    queryKey: ['reports-completion', workspaceId, days],
    queryFn: () =>
      api<{ completionRate: number; completed: number; total: number }>(
        `/workspaces/${workspaceId}/reports/completion?days=${days}`,
      ),
  })
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        {t('dashboardWidget.completion')}
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="font-display text-3xl font-semibold tabular-nums mt-2 text-success">
        {q.data ? `${q.data.completionRate}%` : '—'}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {q.data ? t('dashboardWidget.completedOfTotal', { completed: q.data.completed, total: q.data.total }) : <InlineSkeleton width="5rem" />}
      </div>
      <div className="mt-auto flex items-center gap-1 pt-1">
        {(['week', 'month'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded transition-colors',
              period === p ? 'bg-accent/15 text-accent font-medium' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p === 'week' ? t('dashboardWidget.thisWeek') : t('dashboardWidget.thisMonth')}
          </button>
        ))}
      </div>
    </div>
  )
}

function TimeTile({ Icon, workspaceId }: { Icon: React.ElementType; workspaceId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['reports-time', workspaceId, 7],
    queryFn: () =>
      api<Array<{ totalHours: number; billableHours: number }>>(
        `/workspaces/${workspaceId}/reports/time?days=7`,
      ),
  })
  const totals = (q.data ?? []).reduce(
    (acc, r) => ({ totalHours: acc.totalHours + r.totalHours, billableHours: acc.billableHours + r.billableHours }),
    { totalHours: 0, billableHours: 0 },
  )
  return (
    <Tile
      label={t('dashboardWidget.thisWeek')}
      value={`${totals.totalHours.toFixed(0)}h`}
      hint={t('dashboardWidget.hoursBillable', { hours: totals.billableHours.toFixed(0) })}
      Icon={Icon}
    />
  )
}

function TeamLoadWidget({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['workload-report', workspaceId, 7],
    queryFn: () =>
      api<Array<{ userId: string; name: string; capacity: number; dailyLoads: number[] }>>(
        `/workspaces/${workspaceId}/reports/workload?days=7`,
      ),
  })
  const team = (q.data ?? []).slice(0, 6).map((p) => {
    const avgLoad = p.dailyLoads.reduce((s, v) => s + v, 0) / Math.max(1, p.dailyLoads.length)
    const ratio = Math.round((avgLoad / Math.max(1, p.capacity)) * 100)
    // userId comes along so the row can be keyed by identity: two teammates may
    // share a display name, and React drops rows that share a key.
    return { userId: p.userId, name: p.name || t('dashboardWidget.unknown'), load: ratio }
  })
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t('dashboardWidget.name.teamLoad')}</div>
      <ul className="flex-1 space-y-1.5">
        {team.length === 0 && (
          <li className="text-[11px] text-muted-foreground">{t('dashboardWidget.noAssignments')}</li>
        )}
        {team.map((member) => (
          <li key={member.userId} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 truncate">{member.name.split(' ')[0]}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  member.load > 100 ? 'bg-destructive' : member.load > 85 ? 'bg-warning' : 'bg-success',
                )}
                style={{ width: `${Math.min(110, member.load)}%` }}
              />
            </div>
            <span className="tabular-nums w-9 text-right">{member.load}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PieStatusWidget({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['reports-completion', workspaceId, 30],
    queryFn: () =>
      api<{ statusBreakdown: Record<string, number> }>(
        `/workspaces/${workspaceId}/reports/completion?days=30`,
      ),
  })
  const breakdown = q.data?.statusBreakdown ?? {}
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  const COLORS: Record<string, string> = {
    done: 'success',
    in_progress: 'accent-violet',
    in_review: 'accent',
    todo: 'warning',
    backlog: 'muted-foreground',
    cancelled: 'destructive',
  }
  let offset = 0
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{t('dashboardWidget.byStatus30d')}</div>
      <div className="flex items-center gap-3 flex-1">
        <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          {entries.map(([status, count]) => {
            const pct = total > 0 ? (count / total) * 100 : 0
            const dasharray = `${pct} 100`
            const dashoffset = -offset
            offset += pct
            return (
              <circle
                key={status}
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke={`hsl(var(--${COLORS[status] ?? 'muted-foreground'}))`}
                strokeWidth="6"
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
              />
            )
          })}
        </svg>
        <ul className="flex-1 text-[10px] space-y-0.5">
          {entries.slice(0, 4).map(([status, count]) => (
            <li key={status} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: `hsl(var(--${COLORS[status] ?? 'muted-foreground'}))` }}
              />
              <span className="capitalize">{status.replace(/_/g, ' ')}</span>
              <span className="ml-auto tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function GoalsWidget({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['reports-goals', workspaceId],
    queryFn: () =>
      api<{ goals: Array<{ id: string; title: string; progress: number }> }>(
        `/workspaces/${workspaceId}/reports/goals`,
      ),
  })
  const goals = (q.data?.goals ?? []).slice(0, 3)
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t('dashboardWidget.goals')}</div>
      <div className="space-y-2 flex-1">
        {goals.length === 0 && (
          <div className="text-[11px] text-muted-foreground">{t('dashboardWidget.noGoals')}</div>
        )}
        {goals.map((g) => (
          <div key={g.id}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="truncate">{g.title}</span>
              <span className="tabular-nums">{g.progress}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${g.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Tile({ label, value, hint, Icon, tone }: any) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="font-display text-3xl font-semibold tabular-nums mt-2">{value}</div>
      <div
        className={cn(
          'text-[11px] mt-auto',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          !tone && 'text-muted-foreground',
        )}
      >
        {hint}
      </div>
    </div>
  )
}

function SprintBurndownWidget({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const sprintsQ = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; status: string }>>(`/workspaces/${workspaceId}/sprints`),
  })
  const active = sprintsQ.data?.find((s) => s.status === 'active')
  const detailQ = useQuery({
    queryKey: ['sprint', active?.id],
    queryFn: () =>
      api<{
        totalPoints: number
        completedPoints: number
        burndown: Array<{ ideal: number; actual: number | null }>
      }>(`/sprints/${active!.id}`),
    enabled: Boolean(active?.id),
  })

  const burndown = detailQ.data?.burndown ?? []
  const remaining = detailQ.data
    ? Math.max(0, detailQ.data.totalPoints - detailQ.data.completedPoints)
    : null
  const points = burndown
    .map((d) => (d.actual !== null ? d.actual : d.ideal))
    .filter((v) => v !== null) as number[]
  const max = Math.max(1, ...points, 1)

  if (!active) {
    return (
      <div className="flex flex-col h-full justify-center text-[11px] text-muted-foreground">
        {t('dashboardWidget.noActiveSprint')}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* The heading is a link because this widget was, until now, the only
          place in the app that mentioned a sprint at all — it drew the chart
          and offered no way to reach the sprint behind it. */}
      <Link
        to="/app/$workspaceId/sprints/$sprintId"
        params={{ workspaceId, sprintId: active.id }}
        className="text-xs uppercase tracking-wider text-muted-foreground mb-1 hover:text-foreground"
      >
        {t('dashboardWidget.name.sprintBurndown')}
      </Link>
      <div className="flex items-baseline gap-2">
        <div className="font-display text-3xl font-semibold tabular-nums">{remaining ?? '—'}</div>
        <div className="text-[10px] text-muted-foreground">
          {t('dashboardWidget.ptsRemaining', { points: detailQ.data?.totalPoints ?? 0 })}
        </div>
      </div>
      {points.length > 1 ? (
        <svg viewBox="0 0 200 60" className="mt-1 w-full">
          <defs>
            <linearGradient id="bdr" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--accent-violet))" stopOpacity="0.5" />
              <stop offset="100%" stopColor="hsl(var(--accent-violet))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={
              'M ' +
              points
                .map((p, i) => `${(i / (points.length - 1)) * 200},${60 - (p / max) * 50}`)
                .join(' L ') +
              ` L 200,60 L 0,60 Z`
            }
            fill="url(#bdr)"
          />
          <path
            d={
              'M ' +
              points
                .map((p, i) => `${(i / (points.length - 1)) * 200},${60 - (p / max) * 50}`)
                .join(' L ')
            }
            fill="none"
            stroke="hsl(var(--accent-violet))"
            strokeWidth="1.5"
          />
        </svg>
      ) : (
        <p className="text-[10px] text-muted-foreground mt-2">{t('dashboardWidget.addStoryPoints')}</p>
      )}
    </div>
  )
}
type ActivityRow = {
  id: string
  action: string
  createdAt: string
  taskTitle: string
  actorName: string | null
  spaceId: string
  projectId: string
  listId: string
}

// Compact translated verb per activity action; unmapped actions fall back to
// the generic "updated" key so the feed always reads as a sentence.
const ACTIVITY_VERB: Record<string, TranslationKey> = {
  created: 'dashboardWidget.action.created',
  updated: 'dashboardWidget.action.updated',
  archived: 'dashboardWidget.action.archived',
  restored: 'dashboardWidget.action.restored',
  status_changed: 'dashboardWidget.action.statusChanged',
  priority_changed: 'dashboardWidget.action.priorityChanged',
  assigned: 'dashboardWidget.action.assigned',
  unassigned: 'dashboardWidget.action.unassigned',
  commented: 'dashboardWidget.action.commented',
  label_added: 'dashboardWidget.action.labeled',
  label_removed: 'dashboardWidget.action.labeled',
  due_date_changed: 'dashboardWidget.action.dueDateChanged',
  moved: 'dashboardWidget.action.moved',
}

// Workspace-wide team activity (§9.1): recent task_activity across the whole
// workspace, not the viewer's own notifications.
/**
 * §A5.15 / §A6.5 — the daily briefing on the dashboard. The text is generated
 * by the same service the hourly cron uses; nothing is persisted here, so a
 * refresh never eats the user's scheduled delivery for the day.
 */
function AiBriefingWidget() {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['ai-briefing-now'],
    queryFn: () => api<{ body: string }>('/ai/briefing', { method: 'POST' }),
    // A model call per dashboard render would be wasteful — the briefing only
    // changes as the day's work does.
    staleTime: 15 * 60_000,
    retry: false,
  })
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {t('dashboardWidget.name.aiBriefing')}
        </div>
        <button
          type="button"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
          aria-label={t('dashboardWidget.briefingRunNow')}
          title={t('dashboardWidget.briefingRunNow')}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Loader2 className={cn('h-3.5 w-3.5', q.isFetching && 'animate-spin')} />
        </button>
      </div>
      <p className="flex-1 text-[11px] leading-relaxed overflow-hidden whitespace-pre-wrap">
        {q.isError
          ? t('dashboardWidget.briefingUnavailable')
          : q.data?.body || t('dashboardWidget.briefingLoading')}
      </p>
    </div>
  )
}

function ActivityWidget({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['reports-activity', workspaceId],
    queryFn: () => api<ActivityRow[]>(`/workspaces/${workspaceId}/reports/activity?limit=8`),
  })
  const items = q.data ?? []
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t('dashboardWidget.teamActivity')}</div>
      <ul className="flex-1 space-y-1 text-[11px] overflow-hidden">
        {items.length === 0 && (
          <li className="text-muted-foreground">{t('dashboardWidget.noRecentActivity')}</li>
        )}
        {items.map((a) => {
          const minutes = Math.max(1, Math.round((Date.now() - new Date(a.createdAt).getTime()) / 60000))
          const ts = minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`
          const verb = t(ACTIVITY_VERB[a.action] ?? 'dashboardWidget.action.updated')
          return (
            <li key={a.id} className="truncate">
              <Link
                to="/app/$workspaceId/$spaceId/$projectId/$listId"
                params={{ workspaceId, spaceId: a.spaceId, projectId: a.projectId, listId: a.listId }}
                className="hover:text-accent transition-colors"
              >
                <span className="text-foreground font-medium">{a.actorName ?? t('dashboardWidget.someone')}</span>
                <span className="text-muted-foreground"> {verb} </span>
                <span className="text-foreground">{a.taskTitle}</span>
                <span className="text-muted-foreground"> · {ts}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

type HealthRow = {
  projectId: string
  name: string
  score: number
  band: 'green' | 'yellow' | 'red' | 'empty'
  total: number
  open: number
  overdueOpen: number
  blockedOpen: number
}

// Project health scores (§5.7): color-coded bars from a deterministic backend
// formula (see reports.service getProjectHealth).
function ProjectHealthWidget({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['reports-project-health', workspaceId],
    queryFn: () => api<HealthRow[]>(`/workspaces/${workspaceId}/reports/project-health`),
  })
  const projects = (q.data ?? []).filter((p) => p.total > 0).slice(0, 6)
  const barColor = (band: HealthRow['band']) =>
    band === 'green' ? 'bg-success' : band === 'yellow' ? 'bg-warning' : 'bg-destructive'
  const textColor = (band: HealthRow['band']) =>
    band === 'green' ? 'text-success' : band === 'yellow' ? 'text-warning' : 'text-destructive'
  if (q.isError) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{t('dashboardWidget.name.projectHealth')}</div>
        <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground">
          {t('dashboardWidget.healthLoadError')}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t('dashboardWidget.name.projectHealth')}</div>
      <ul className="flex-1 space-y-1.5 overflow-hidden">
        {q.data && projects.length === 0 && (
          <li className="text-[11px] text-muted-foreground">{t('dashboardWidget.noProjects')}</li>
        )}
        {projects.map((p) => (
          <li key={p.projectId} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 truncate" title={p.name}>{p.name}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={cn('h-full rounded-full', barColor(p.band))} style={{ width: `${p.score}%` }} />
            </div>
            <span className={cn('tabular-nums w-7 text-right font-medium', textColor(p.band))}>{p.score}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type WorkspaceTask = {
  id: string
  title: string
  statusCategory: 'open' | 'in_progress' | 'closed'
  priority?: 'urgent' | 'high' | 'normal' | 'low'
  dueDate?: string | null
  listId: string
  projectId: string
  spaceId: string
  assignees: Array<{ userId: string }>
}

// Configurable, filterable task list (§5.7): filter by assignee=me, status,
// priority, and due window over the existing denormalized workspace task query.
function TaskListWidget({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.user?.id)
  const [mineOnly, setMineOnly] = useState(true)
  const [status, setStatus] = useState<'any' | 'open' | 'in_progress' | 'closed'>('any')
  const [priority, setPriority] = useState<'any' | 'urgent' | 'high' | 'normal' | 'low'>('any')
  const [due, setDue] = useState<'any' | 'overdue' | 'today' | 'week'>('any')

  const q = useQuery({
    queryKey: ['dashboard-tasks', workspaceId],
    queryFn: () => api<WorkspaceTask[]>(`/tasks/workspace/${workspaceId}?limit=500`),
  })

  const now = new Date()
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const filtered = (q.data ?? []).filter((task) => {
    if (mineOnly && !(task.assignees ?? []).some((a) => a.userId === userId)) return false
    if (status !== 'any' && task.statusCategory !== status) return false
    if (priority !== 'any' && (task.priority ?? 'normal') !== priority) return false
    if (due !== 'any') {
      if (!task.dueDate) return false
      const d = new Date(task.dueDate)
      if (due === 'overdue' && !(d < now && !isSameDay(d, now))) return false
      if (due === 'today' && !isSameDay(d, now)) return false
      if (due === 'week' && !(d >= now && d <= weekEnd)) return false
    }
    return true
  })
  const rows = filtered.slice(0, 20)

  const selectCls =
    'text-[10px] bg-card/60 border border-border/60 rounded px-1 py-0.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
        {t('dashboardWidget.name.taskList')}
        <ListFilter className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
            mineOnly ? 'bg-accent/15 text-accent border-accent/30' : 'text-muted-foreground border-border/60 hover:text-foreground',
          )}
        >
          {t('dashboardWidget.filterMine')}
        </button>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t('dashboardWidget.filterStatus')}>
          <option value="any">{t('dashboardWidget.filterStatus')}</option>
          <option value="open">{t('dashboardWidget.statusOpen')}</option>
          <option value="in_progress">{t('dashboardWidget.statusInProgress')}</option>
          <option value="closed">{t('dashboardWidget.statusClosed')}</option>
        </select>
        <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} aria-label={t('dashboardWidget.filterPriority')}>
          <option value="any">{t('dashboardWidget.filterPriority')}</option>
          <option value="urgent">{t('dashboardWidget.priorityUrgent')}</option>
          <option value="high">{t('dashboardWidget.priorityHigh')}</option>
          <option value="normal">{t('dashboardWidget.priorityNormal')}</option>
          <option value="low">{t('dashboardWidget.priorityLow')}</option>
        </select>
        <select className={selectCls} value={due} onChange={(e) => setDue(e.target.value as typeof due)} aria-label={t('dashboardWidget.filterDue')}>
          <option value="any">{t('dashboardWidget.filterDue')}</option>
          <option value="overdue">{t('dashboardWidget.dueOverdue')}</option>
          <option value="today">{t('dashboardWidget.dueToday')}</option>
          <option value="week">{t('dashboardWidget.thisWeek')}</option>
        </select>
      </div>
      <ul className="flex-1 space-y-1 overflow-auto">
        {q.data && rows.length === 0 && (
          <li className="text-[11px] text-muted-foreground">{t('dashboardWidget.noMatchingTasks')}</li>
        )}
        {rows.map((task) => (
          <li key={task.id}>
            <Link
              to="/app/$workspaceId/$spaceId/$projectId/$listId"
              params={{ workspaceId, spaceId: task.spaceId, projectId: task.projectId, listId: task.listId }}
              className="flex items-center gap-1.5 text-[11px] hover:text-accent transition-colors"
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', priorityDotClass(task.priority))} />
              <span className="truncate flex-1">{task.title}</span>
              {task.dueDate && (
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className="text-[10px] text-muted-foreground mt-1">{t('dashboardWidget.taskCount', { count: filtered.length })}</div>
    </div>
  )
}

