import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import { Target, TrendingUp, CheckCircle2, AlertTriangle, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type Goal = {
  id: string
  title: string
  description?: string | null
  progress: number
  targetType: 'numeric' | 'percentage' | 'boolean'
  status: 'on_track' | 'at_risk' | 'off_track' | 'completed'
  dueDate?: string | null
  ownerId?: string | null
}

const STATUS_META: Record<Goal['status'], { label: string; color: string; icon: React.ElementType }> = {
  on_track: { label: 'On track', color: 'bg-emerald-500', icon: TrendingUp },
  at_risk: { label: 'At risk', color: 'bg-amber-500', icon: AlertTriangle },
  off_track: { label: 'Off track', color: 'bg-red-500', icon: AlertTriangle },
  completed: { label: 'Completed', color: 'bg-brand-700', icon: CheckCircle2 },
}

export function GoalsPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/goals' })
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const goalsQuery = useQuery({
    queryKey: ['goals', workspaceId],
    queryFn: () => api<Goal[]>(`/workspaces/${workspaceId}/goals`),
  })

  const createGoal = useMutation({
    mutationFn: async () =>
      api<Goal>(`/workspaces/${workspaceId}/goals`, {
        method: 'POST',
        body: {
          title: newTitle.trim(),
          targetType: 'percentage',
          status: 'on_track',
          progress: 0,
        },
      }),
    onSuccess: async () => {
      setNewTitle('')
      setCreating(false)
      await qc.invalidateQueries({ queryKey: ['goals', workspaceId] })
    },
  })

  const goals = goalsQuery.data ?? []
  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">{t('common.workspace')}</div>
            <h1 className="font-display text-2xl font-semibold text-foreground">{t('goals.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('goals.subtitle')}
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t('goals.newGoal')}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {creating && (
          <Card className="p-4">
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder={t('goals.titlePlaceholder')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle.trim()) createGoal.mutate()
                  if (e.key === 'Escape') {
                    setCreating(false)
                    setNewTitle('')
                  }
                }}
              />
              <div className="flex gap-2">
                <Button onClick={() => createGoal.mutate()} disabled={!newTitle.trim() || createGoal.isPending}>
                  {t('common.create')}
                </Button>
                <Button variant="ghost" onClick={() => { setCreating(false); setNewTitle('') }}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-foreground">{t('goals.activeGoals')}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{goals.length} goals</span>
          </div>

          {goals.length === 0 ? (
            <Card className="p-10 text-center">
              <Target className="h-10 w-10 text-brand-500 mx-auto mb-2" />
              <h3 className="font-display text-lg font-semibold text-foreground mb-1">{t('goals.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Goals give your team a north star. Each goal tracks progress toward a measurable outcome —
                a percentage, a number, or simple done/not-done.
              </p>
              <Button onClick={() => setCreating(true)} className="mt-4">
                {t('goals.createFirst')}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function clampPct(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function GoalCard({ goal }: { goal: Goal }) {
  const meta = STATUS_META[goal.status]
  const Icon = meta.icon
  const { workspaceId } = useParams({ from: '/app/$workspaceId/goals' })
  return (
    <Link
      to="/app/$workspaceId/goals/$goalId"
      params={{ workspaceId, goalId: goal.id }}
      className="block group"
    >
      <Card className="p-4 hover:border-accent/40 hover:shadow-glow transition-all">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Target className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate group-hover:text-accent transition-colors">{goal.title}</h3>
            {goal.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{goal.description}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={cn('h-full transition-all', meta.color)}
                  style={{ width: `${clampPct(goal.progress)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                {Math.round(clampPct(goal.progress))}%
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3 w-3" />
              <span>{meta.label}</span>
              {goal.dueDate && <span>· due {new Date(goal.dueDate).toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
