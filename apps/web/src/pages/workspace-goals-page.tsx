import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn, toast } from '@rundesk/ui'
import { Target, TrendingUp, CheckCircle2, AlertTriangle, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { goalProgress } from '../lib/goal-progress'
import { useWorkspaceRole } from '../hooks/use-workspace-role'

/** A goal as `GET /workspaces/:id/goals` sends it. */
type Goal = {
  id: string
  title: string
  description?: string | null
  currentValue: number
  targetValue: number
  kind: 'numeric' | 'percentage' | 'boolean'
  status: 'on_track' | 'at_risk' | 'off_track' | 'completed'
  dueDate?: string | null
  ownerId?: string | null
}

const STATUS_META: Record<Goal['status'], { labelKey: TranslationKey; color: string; icon: React.ElementType }> = {
  on_track: { labelKey: 'goals.statusOnTrack', color: 'bg-emerald-500', icon: TrendingUp },
  at_risk: { labelKey: 'goals.statusAtRisk', color: 'bg-amber-500', icon: AlertTriangle },
  off_track: { labelKey: 'goals.statusOffTrack', color: 'bg-red-500', icon: AlertTriangle },
  completed: { labelKey: 'goals.statusCompleted', color: 'bg-brand-700', icon: CheckCircle2 },
}

export function GoalsPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/goals' })
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // A guest has no goal shared with them and may make none (the API answers
  // an empty list and 403), so they are offered no "New goal" to fail.
  const { role } = useWorkspaceRole(workspaceId)
  const isGuest = role === 'guest'

  const goalsQuery = useQuery({
    queryKey: ['goals', workspaceId],
    queryFn: () => api<Goal[]>(`/workspaces/${workspaceId}/goals`),
  })

  const createGoal = useMutation({
    mutationFn: async () =>
      api<Goal>(`/workspaces/${workspaceId}/goals`, {
        method: 'POST',
        body: { title: newTitle.trim() },
      }),
    onSuccess: async () => {
      setNewTitle('')
      setCreating(false)
      await qc.invalidateQueries({ queryKey: ['goals', workspaceId] })
    },
    onError: () => toast.error(t('goals.createFailed')),
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
          {!isGuest && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1" /> {t('goals.newGoal')}
            </Button>
          )}
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
            <span className="text-xs text-muted-foreground tabular-nums">{tCount('goals.count', goals.length)}</span>
          </div>

          {goals.length === 0 ? (
            <Card className="p-10 text-center">
              <Target className="h-10 w-10 text-brand-500 mx-auto mb-2" />
              <h3 className="font-display text-lg font-semibold text-foreground mb-1">{t('goals.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t(isGuest ? 'goals.emptyGuest' : 'goals.emptyDesc')}
              </p>
              {!isGuest && (
                <Button onClick={() => setCreating(true)} className="mt-4">
                  {t('goals.createFirst')}
                </Button>
              )}
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

function GoalCard({ goal }: { goal: Goal }) {
  const { t } = useTranslation()
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
                  style={{ width: `${goalProgress(goal.currentValue, goal.targetValue)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right" data-testid={`goal-progress-${goal.id}`}>
                {goalProgress(goal.currentValue, goal.targetValue)}%
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3 w-3" />
              <span>{t(meta.labelKey)}</span>
              {goal.dueDate && <span>· {t('goals.due', { date: new Date(goal.dueDate).toLocaleDateString() })}</span>}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
