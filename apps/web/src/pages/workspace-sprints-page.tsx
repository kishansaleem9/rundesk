import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, cn } from '@rundesk/ui'
import { Zap, Plus, TrendingUp, CheckCircle2, Play } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import type { SprintSummary, SprintStatus } from '../lib/sprint-types'
import {
  WorkPageShell,
  WorkPageHeader,
  WorkHubBody,
  WorkSectionTitle,
  WorkEmptyState,
  WorkCreateCard,
  WorkProgressBar,
} from '../components/work/work-ui'
import { InlineSkeleton } from '../components/loading-skeletons'

const STATUS_META: Record<
  SprintStatus,
  { labelKey: TranslationKey; dot: string; pill: string }
> = {
  planned: {
    labelKey: 'sprints.status.planned',
    dot: 'bg-slate-400',
    pill: 'bg-slate-500/12 text-slate-700 dark:text-slate-200',
  },
  active: {
    labelKey: 'sprints.status.active',
    dot: 'bg-violet-500',
    pill: 'bg-violet-500/12 text-violet-700 dark:text-violet-200',
  },
  completed: {
    labelKey: 'sprints.status.completed',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
  },
  cancelled: {
    labelKey: 'sprints.status.cancelled',
    dot: 'bg-red-400',
    pill: 'bg-red-500/12 text-red-700 dark:text-red-200',
  },
}

export function SprintsPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/sprints' })
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', goal: '', startDate: '', endDate: '' })

  const sprintsQuery = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () => api<SprintSummary[]>(`/workspaces/${workspaceId}/sprints`),
  })

  const createSprint = useMutation({
    mutationFn: async () =>
      api<SprintSummary>(`/workspaces/${workspaceId}/sprints`, {
        method: 'POST',
        body: {
          name: form.name.trim(),
          goal: form.goal.trim() || undefined,
          startDate: form.startDate,
          endDate: form.endDate,
        },
      }),
    onSuccess: async () => {
      setForm({ name: '', goal: '', startDate: '', endDate: '' })
      setCreating(false)
      await qc.invalidateQueries({ queryKey: ['sprints', workspaceId] })
    },
  })

  const sprints = sprintsQuery.data ?? []
  const active = sprints.find((s) => s.status === 'active')
  const planned = sprints.filter((s) => s.status === 'planned')
  const rest = sprints.filter((s) => s.status !== 'active' && s.status !== 'planned')

  const canCreate =
    form.name.trim() && form.startDate && form.endDate && !createSprint.isPending

  return (
    <WorkPageShell>
      <WorkPageHeader
        eyebrow={t('common.workspace')}
        title={t('sprints.title')}
        description={t('sprints.subtitle')}
        action={
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" /> {t('sprints.newSprint')}
          </Button>
        }
      />

      <WorkHubBody>
        {sprintsQuery.isLoading ? (
          <div className="rounded-lg border border-border/80 p-8 text-center text-[13px] text-muted-foreground">
            <InlineSkeleton />
          </div>
        ) : (
          <>
            {active && (
              <section>
                <WorkSectionTitle>{t('sprints.activeSprint')}</WorkSectionTitle>
                <ActiveSprintCard sprint={active} workspaceId={workspaceId} />
              </section>
            )}

            {creating && (
              <WorkCreateCard onCancel={() => setCreating(false)}>
                <Input
                  autoFocus
                  placeholder={t('sprints.namePlaceholder')}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9"
                />
                <Input
                  placeholder={t('sprints.goalPlaceholder')}
                  value={form.goal}
                  onChange={(e) => setForm({ ...form, goal: e.target.value })}
                  className="h-9"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">{t('sprints.startLabel')}</label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">{t('sprints.endLabel')}</label>
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>
                <Button
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => createSprint.mutate()}
                  disabled={!canCreate}
                >
                  {createSprint.isPending ? t('sprints.creating') : t('sprints.createSprint')}
                </Button>
              </WorkCreateCard>
            )}

            {sprints.length === 0 && !creating ? (
              <WorkEmptyState
                icon={Zap}
                title={t('sprints.emptyTitle')}
                description={t('sprints.emptyDesc')}
                action={
                  <Button
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => setCreating(true)}
                  >
                    {t('sprints.createSprint')}
                  </Button>
                }
              />
            ) : (
              <>
                {planned.length > 0 && (
                  <section>
                    <WorkSectionTitle>{t('sprints.upcoming')}</WorkSectionTitle>
                    <div className="space-y-2">
                      {planned.map((sprint) => (
                        <SprintRow key={sprint.id} sprint={sprint} workspaceId={workspaceId} />
                      ))}
                    </div>
                  </section>
                )}

                {rest.length > 0 && (
                  <section>
                    <WorkSectionTitle>{t('sprints.history')}</WorkSectionTitle>
                    <div className="space-y-2">
                      {rest.map((sprint) => (
                        <SprintRow key={sprint.id} sprint={sprint} workspaceId={workspaceId} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </WorkHubBody>
    </WorkPageShell>
  )
}

function ActiveSprintCard({ sprint, workspaceId }: { sprint: SprintSummary; workspaceId: string }) {
  const { t } = useTranslation()
  const total = sprint.totalPoints ?? 0
  const done = sprint.completedPoints ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Link
      to="/app/$workspaceId/sprints/$sprintId"
      params={{ workspaceId, sprintId: sprint.id }}
      className="block group"
    >
      <div className="rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-transparent to-indigo-500/5 p-5 hover:border-violet-500/40 transition-colors">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Zap className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[18px] font-semibold text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors">
              {sprint.name}
            </h3>
            {sprint.goal && <p className="text-[13px] text-muted-foreground mt-0.5">{sprint.goal}</p>}
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Metric label={t('sprints.points')} value={`${done} / ${total}`} />
              <Metric label={t('sprints.tasks')} value={`${sprint.completedTasks} / ${sprint.taskCount}`} />
              <Metric
                label={t('sprints.ends')}
                value={new Date(sprint.endDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              />
            </div>
            <WorkProgressBar value={pct} className="mt-4" />
          </div>
        </div>
      </div>
    </Link>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</div>
      <div className="text-[16px] font-semibold text-foreground tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

function SprintRow({ sprint, workspaceId }: { sprint: SprintSummary; workspaceId: string }) {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const meta = STATUS_META[sprint.status] ?? STATUS_META.planned
  const total = sprint.totalPoints ?? 0
  const done = sprint.completedPoints ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const activate = useMutation({
    mutationFn: () => api(`/sprints/${sprint.id}`, { method: 'PATCH', body: { status: 'active' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', workspaceId] }),
  })

  return (
    <div className="rounded-lg border border-border/80 bg-background px-4 py-3 hover:border-violet-500/30 hover:shadow-sm transition-all flex items-center gap-3">
      <Link
        to="/app/$workspaceId/sprints/$sprintId"
        params={{ workspaceId, sprintId: sprint.id }}
        className="flex items-center gap-3 flex-1 min-w-0 group"
      >
        <span className={cn('h-2 w-2 rounded-full shrink-0', meta.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-medium truncate group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors">
              {sprint.name}
            </span>
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', meta.pill)}>
              {t(meta.labelKey)}
            </span>
          </div>
          {sprint.goal && (
            <p className="text-[12px] text-muted-foreground truncate mt-0.5">{sprint.goal}</p>
          )}
          {total > 0 && <WorkProgressBar value={pct} className="mt-2 max-w-xs" />}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground tabular-nums shrink-0">
          {sprint.status === 'completed' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <TrendingUp className="h-3.5 w-3.5" />
          )}
          {done}/{total}pt · {tCount('sprints.tasksCount', sprint.taskCount)}
        </div>
      </Link>
      {sprint.status === 'planned' && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={activate.isPending}
          onClick={(e) => {
            e.preventDefault()
            activate.mutate()
          }}
        >
          <Play className="h-3 w-3 mr-1" /> {t('sprints.start')}
        </Button>
      )}
    </div>
  )
}
