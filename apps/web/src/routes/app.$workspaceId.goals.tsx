import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import { Target, TrendingUp, CheckCircle2, AlertTriangle, Plus } from 'lucide-react'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/goals')({
  component: GoalsPage,
})

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

function GoalsPage() {
  const { workspaceId } = Route.useParams()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const goalsQuery = useQuery({
    queryKey: ['goals', workspaceId],
    queryFn: async () => {
      try {
        return await api<Goal[]>(`/workspaces/${workspaceId}/goals`)
      } catch {
        return [] as Goal[]
      }
    },
  })

  const createGoal = useMutation({
    mutationFn: async () =>
      api<Goal>(`/workspaces/${workspaceId}/goals`, {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          targetType: 'percentage',
          status: 'on_track',
          progress: 0,
        }),
      }),
    onSuccess: async () => {
      setNewTitle('')
      setCreating(false)
      await qc.invalidateQueries({ queryKey: ['goals', workspaceId] })
    },
  })

  const goals = goalsQuery.data ?? []
  const backendMissing = !goalsQuery.isLoading && goalsQuery.isError

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Workspace</div>
            <h1 className="font-display text-2xl font-semibold text-brand-900">Goals &amp; OKRs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Align the team around measurable outcomes.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> New goal
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {backendMissing && (
          <Card className="p-4 border-dashed">
            <div className="text-sm text-muted-foreground">
              Goals backend is not wired yet — saving this page will fail silently until <code>/workspaces/:id/goals</code> is implemented. The UI is ready.
            </div>
          </Card>
        )}

        {creating && (
          <Card className="p-4">
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Goal title (e.g. Ship v1.0 by end of Q2)"
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
                  Create
                </Button>
                <Button variant="ghost" onClick={() => { setCreating(false); setNewTitle('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-brand-900">Active goals</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{goals.length} goals</span>
          </div>

          {goals.length === 0 && !backendMissing ? (
            <Card className="p-10 text-center">
              <Target className="h-10 w-10 text-brand-500 mx-auto mb-2" />
              <h3 className="font-display text-lg font-semibold text-brand-900 mb-1">No goals yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Goals give your team a north star. Each goal tracks progress toward a measurable outcome —
                a percentage, a number, or simple done/not-done.
              </p>
              <Button onClick={() => setCreating(true)} className="mt-4">
                Create your first goal
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

function GoalCard({ goal }: { goal: Goal }) {
  const meta = STATUS_META[goal.status]
  const Icon = meta.icon
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-brand-200/50 flex items-center justify-center shrink-0">
          <Target className="h-5 w-5 text-brand-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{goal.title}</h3>
          {goal.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{goal.description}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-100 overflow-hidden">
              <div
                className={cn('h-full transition-all', meta.color)}
                style={{ width: `${Math.max(0, Math.min(100, goal.progress))}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
              {Math.round(goal.progress)}%
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
  )
}
