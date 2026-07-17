import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  WorkPageShell,
  WorkPageHeader,
  WorkHubBody,
  WorkProgressBar,
  WorkEmptyState,
} from '../components/work/work-ui'
import {
  Card,
  Badge,
  Button,
  Input,
  Progress,
  cn,
} from '@rundesk/ui'
import {
  ArrowLeft,
  Calendar,
  TrendingUp,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Plus,
  ListTodo,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import type { SprintDetail, SprintVelocityRow } from '../lib/sprint-types'
import { isSprintTaskDone, sprintDayProgress } from '../lib/sprint-types'

const STATUS_LABEL: Record<string, TranslationKey> = {
  planned: 'sprintDetail.status.planned',
  active: 'sprintDetail.status.active',
  completed: 'sprintDetail.status.completed',
  cancelled: 'sprintDetail.status.cancelled',
}

export function SprintDetailPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId, sprintId } = useParams({ from: '/app/$workspaceId/sprints/$sprintId' })
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [pointsInput, setPointsInput] = useState('3')

  const sprintQuery = useQuery({
    queryKey: ['sprint', sprintId],
    queryFn: () => api<SprintDetail>(`/sprints/${sprintId}`),
  })

  const velocityQuery = useQuery({
    queryKey: ['sprint-velocity', workspaceId],
    queryFn: () => api<SprintVelocityRow[]>(`/workspaces/${workspaceId}/reports/sprints`),
  })

  const workspaceTasksQuery = useQuery({
    queryKey: ['workspace-tasks-picker', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; title: string; listName: string; projectName: string }>>(
        `/tasks/workspace/${workspaceId}?limit=200`,
      ),
    enabled: addOpen,
  })

  const updateSprint = useMutation({
    mutationFn: (body: { status?: string }) =>
      api(`/sprints/${sprintId}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['sprint', sprintId] })
      await qc.invalidateQueries({ queryKey: ['sprints', workspaceId] })
    },
  })

  const addTask = useMutation({
    mutationFn: ({ taskId, storyPoints }: { taskId: string; storyPoints?: number }) =>
      api(`/sprints/${sprintId}/tasks`, {
        method: 'POST',
        body: { taskId, storyPoints },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['sprint', sprintId] })
      await qc.invalidateQueries({ queryKey: ['sprints', workspaceId] })
    },
  })

  const removeTask = useMutation({
    mutationFn: (taskId: string) =>
      api(`/sprints/${sprintId}/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['sprint', sprintId] })
      await qc.invalidateQueries({ queryKey: ['sprints', workspaceId] })
    },
  })

  const sprint = sprintQuery.data
  const velocity = (velocityQuery.data ?? []).slice(0, 6).reverse()

  if (sprintQuery.isLoading) {
    return (
      <WorkPageShell>
        <div className="p-8 text-center text-[13px] text-muted-foreground">{t('sprintDetail.loading')}</div>
      </WorkPageShell>
    )
  }

  if (!sprint) {
    return (
      <WorkPageShell>
        <WorkEmptyState
          icon={ListTodo}
          title={t('sprintDetail.notFoundTitle')}
          description={t('sprintDetail.notFoundDesc')}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/$workspaceId/sprints" params={{ workspaceId }}>
                {t('sprintDetail.backToSprints')}
              </Link>
            </Button>
          }
        />
      </WorkPageShell>
    )
  }

  const completedPct =
    sprint.totalPoints > 0 ? Math.round((sprint.completedPoints / sprint.totalPoints) * 100) : 0
  const taskPct =
    sprint.taskCount > 0 ? Math.round((sprint.completedTasks / sprint.taskCount) * 100) : 0
  const { currentDay, totalDays } = sprintDayProgress(sprint.startDate, sprint.endDate)
  const idealProgress = sprint.totalPoints * (currentDay / totalDays)
  const onTrack = sprint.completedPoints >= idealProgress * 0.85

  const sprintTaskIds = new Set(sprint.tasks.map((task) => task.id))
  const pickerTasks = (workspaceTasksQuery.data ?? []).filter(
    (task) =>
      !sprintTaskIds.has(task.id) &&
      task.title.toLowerCase().includes(taskSearch.trim().toLowerCase()),
  )

  return (
    <WorkPageShell>
      <WorkPageHeader
        eyebrow={t(STATUS_LABEL[sprint.status] ?? 'sprintDetail.sprintFallback')}
        title={sprint.name}
        description={sprint.goal ?? undefined}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link to="/app/$workspaceId/sprints" params={{ workspaceId }}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> {t('sprintDetail.sprints')}
              </Link>
            </Button>
            {sprint.status === 'planned' && (
              <Button
                size="sm"
                variant="outline"
                disabled={updateSprint.isPending}
                onClick={() => updateSprint.mutate({ status: 'active' })}
              >
                {t('sprintDetail.startSprint')}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setAddOpen((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {t('sprintDetail.addTask')}
            </Button>
            {sprint.status === 'active' && (
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                disabled={updateSprint.isPending}
                onClick={() => updateSprint.mutate({ status: 'completed' })}
              >
                {t('sprintDetail.closeSprint')}
              </Button>
            )}
          </div>
        }
      />

      <WorkHubBody className="max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
          <Badge
            variant={sprint.status === 'active' ? 'success' : 'secondary'}
            className="text-[10px] uppercase"
          >
            {t(STATUS_LABEL[sprint.status] ?? 'sprintDetail.sprintFallback')}
          </Badge>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {fmt(sprint.startDate)} — {fmt(sprint.endDate)}
          </span>
          <span>·</span>
          <span>
            {t('sprintDetail.dayOf', { current: currentDay, total: totalDays })}
          </span>
          <span className="ml-auto w-full sm:w-48">
            <WorkProgressBar value={completedPct} />
          </span>
        </div>

        {addOpen && (
          <Card className="p-4 border-violet-500/25 space-y-3">
            <h3 className="text-[14px] font-semibold">{t('sprintDetail.addTaskToSprint')}</h3>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder={t('sprintDetail.searchTasks')}
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="h-8 flex-1 min-w-[200px]"
              />
              <Input
                type="number"
                min={0}
                step={0.5}
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                className="h-8 w-20"
                title={t('sprintDetail.storyPoints')}
              />
            </div>
            <div className="max-h-48 overflow-auto rounded-md border border-border/80 divide-y">
              {pickerTasks.length === 0 ? (
                <p className="p-3 text-[12px] text-muted-foreground">{t('sprintDetail.noMatchingTasks')}</p>
              ) : (
                pickerTasks.slice(0, 20).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-muted/50 flex justify-between gap-2"
                    onClick={() => {
                      const pts = parseFloat(pointsInput)
                      addTask.mutate({
                        taskId: task.id,
                        storyPoints: Number.isFinite(pts) ? pts : undefined,
                      })
                      setAddOpen(false)
                    }}
                  >
                    <span className="truncate">{task.title}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {task.projectName} / {task.listName}
                    </span>
                  </button>
                ))
              )}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label={t('sprintDetail.storyPoints')}
            value={`${sprint.completedPoints}/${sprint.totalPoints}`}
            percent={completedPct}
          />
          <StatTile
            label={t('sprintDetail.tasks')}
            value={`${sprint.completedTasks}/${sprint.taskCount}`}
            percent={taskPct}
          />
          <StatTile
            label={t('sprintDetail.pace')}
            value={onTrack ? t('sprintDetail.onTrack') : t('sprintDetail.behind')}
            tone={onTrack ? 'success' : 'warning'}
            icon={onTrack ? CheckCircle2 : AlertTriangle}
          />
          <StatTile
            label={t('sprintDetail.avgVelocity')}
            value={
              velocity.length
                ? `${Math.round(
                    velocity.reduce((a, b) => a + b.completedPoints, 0) / velocity.length,
                  )} pts`
                : '—'
            }
            tone="info"
            icon={TrendingUp}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 border-border/80">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[16px] font-semibold">{t('sprintDetail.burndown')}</h3>
                <p className="text-[12px] text-muted-foreground">{t('sprintDetail.burndownDesc')}</p>
              </div>
            </div>
            {sprint.burndown.length > 0 ? (
              <BurndownChart data={sprint.burndown} />
            ) : (
              <p className="text-[13px] text-muted-foreground">{t('sprintDetail.burndownEmpty')}</p>
            )}
          </Card>

          <Card className="p-5 border-border/80">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[16px] font-semibold">{t('sprintDetail.velocity')}</h3>
                <p className="text-[12px] text-muted-foreground">{t('sprintDetail.velocityDesc')}</p>
              </div>
            </div>
            {velocity.length > 0 ? (
              <VelocityChart
                data={velocity.map((v) => ({
                  sprint: v.name,
                  planned: v.plannedPoints,
                  completed: v.completedPoints,
                }))}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">{t('sprintDetail.velocityEmpty')}</p>
            )}
          </Card>
        </div>

        <Card className="p-0 overflow-hidden border-border/80">
          <div className="px-5 py-3 border-b border-border/80 flex items-center justify-between">
            <h3 className="text-[16px] font-semibold">{t('sprintDetail.backlog')}</h3>
            <span className="text-[12px] text-muted-foreground">{tCount('sprintDetail.tasksCount', sprint.tasks.length)}</span>
          </div>
          {sprint.tasks.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-muted-foreground">
              {t('sprintDetail.backlogEmpty')}
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {sprint.tasks.map((task) => {
                const done = isSprintTaskDone(task)
                const inProgress = !done && task.statusCategory === 'in_progress'
                return (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/30 transition-colors group"
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : inProgress ? (
                      <span className="relative flex h-4 w-4 items-center justify-center shrink-0">
                        <span className="absolute h-3 w-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                      </span>
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className={cn('flex-1 truncate text-[13px]', done && 'line-through text-muted-foreground')}>
                      {task.title}
                    </div>
                    {task.storyPoints != null && (
                      <Badge variant="info" className="text-[9px] tabular-nums shrink-0">
                        {task.storyPoints} pt
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => removeTask.mutate(task.id)}
                      disabled={removeTask.isPending}
                    >
                      {t('sprintDetail.remove')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </WorkHubBody>
    </WorkPageShell>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function StatTile({
  label,
  value,
  percent,
  tone = 'default',
  icon: Icon,
}: {
  label: string
  value: string
  percent?: number
  tone?: 'default' | 'success' | 'warning' | 'info'
  icon?: React.ElementType
}) {
  return (
    <Card className="p-4 border-border/80">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
        {label}
        {Icon && (
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              tone === 'success' && 'text-emerald-500',
              tone === 'warning' && 'text-amber-500',
              tone === 'info' && 'text-violet-500',
            )}
          />
        )}
      </div>
      <div className="text-[22px] font-semibold tabular-nums">{value}</div>
      {percent !== undefined && <Progress value={percent} className="mt-3 h-1.5" />}
    </Card>
  )
}

function BurndownChart({
  data,
}: {
  data: Array<{ day: string; ideal: number; actual: number | null }>
}) {
  const W = 540
  const H = 200
  const pad = { top: 12, right: 8, bottom: 24, left: 28 }
  const max = Math.max(1, ...data.map((d) => d.ideal))
  const x = (i: number) => pad.left + (i / Math.max(1, data.length - 1)) * (W - pad.left - pad.right)
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom)

  const idealPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.ideal)}`).join(' ')
  const actualPts = data.filter((d) => d.actual !== null) as Array<{
    day: string
    ideal: number
    actual: number
  }>
  const actualPath = actualPts
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(data.indexOf(d))} ${y(d.actual)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <path d={idealPath} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.7" />
      {actualPts.length > 1 && (
        <path
          d={`${actualPath} L ${x(data.indexOf(actualPts[actualPts.length - 1]))} ${H - pad.bottom} L ${x(0)} ${H - pad.bottom} Z`}
          fill="hsl(var(--accent-violet) / 0.15)"
        />
      )}
      <path d={actualPath} fill="none" stroke="hsl(var(--accent-violet))" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) =>
        i % Math.max(1, Math.floor(data.length / 5)) === 0 || i === data.length - 1 ? (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            fontSize="9.5"
            fill="hsl(var(--muted-foreground))"
            /* Anchor the first/last ticks inward so the end dates aren't clipped at the card edge. */
            textAnchor={i === data.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}
          >
            {d.day}
          </text>
        ) : null,
      )}
    </svg>
  )
}

function VelocityChart({
  data,
}: {
  data: Array<{ sprint: string; planned: number; completed: number }>
}) {
  const W = 540
  const H = 200
  const pad = { top: 12, right: 8, bottom: 24, left: 28 }
  const max = Math.max(1, ...data.flatMap((d) => [d.planned, d.completed])) * 1.1
  const groupW = (W - pad.left - pad.right) / data.length
  const barW = groupW / 3
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {data.map((d, i) => {
        const groupX = pad.left + i * groupW + groupW / 2
        return (
          <g key={d.sprint}>
            <rect
              x={groupX - barW - 1}
              y={y(d.planned)}
              width={barW}
              height={H - pad.bottom - y(d.planned)}
              fill="hsl(var(--muted))"
              rx="2"
            />
            <rect
              x={groupX + 1}
              y={y(d.completed)}
              width={barW}
              height={H - pad.bottom - y(d.completed)}
              fill="hsl(var(--accent-violet))"
              rx="2"
            />
            <text x={groupX} y={H - 6} fontSize="9.5" fill="hsl(var(--muted-foreground))" textAnchor="middle">
              {d.sprint.length > 8 ? d.sprint.slice(0, 7) + '…' : d.sprint}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
