import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import { Zap, Plus, TrendingUp, CheckCircle2 } from 'lucide-react'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/sprints')({
  component: SprintsPage,
})

type Sprint = {
  id: string
  name: string
  goal?: string | null
  startDate: string
  endDate: string
  status: 'planned' | 'active' | 'completed'
  totalPoints?: number
  completedPoints?: number
}

const STATUS_META: Record<Sprint['status'], { label: string; color: string }> = {
  planned: { label: 'Planned', color: 'bg-slate-400' },
  active: { label: 'Active', color: 'bg-brand-700' },
  completed: { label: 'Completed', color: 'bg-emerald-500' },
}

function SprintsPage() {
  const { workspaceId } = Route.useParams()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', goal: '', startDate: '', endDate: '' })

  const sprintsQuery = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: async () => {
      try {
        return await api<Sprint[]>(`/workspaces/${workspaceId}/sprints`)
      } catch {
        return [] as Sprint[]
      }
    },
  })

  const createSprint = useMutation({
    mutationFn: async () =>
      api<Sprint>(`/workspaces/${workspaceId}/sprints`, {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: async () => {
      setForm({ name: '', goal: '', startDate: '', endDate: '' })
      setCreating(false)
      await qc.invalidateQueries({ queryKey: ['sprints', workspaceId] })
    },
  })

  const sprints = sprintsQuery.data ?? []
  const backendMissing = !sprintsQuery.isLoading && sprintsQuery.isError
  const active = sprints.find((s) => s.status === 'active')

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Workspace</div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Sprints</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Time-boxed iterations with velocity and burndown tracking.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> New sprint
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {backendMissing && (
          <Card className="p-4 border-dashed">
            <p className="text-sm text-muted-foreground">
              Sprints backend is not wired yet — <code>/workspaces/:id/sprints</code> needs to be implemented.
              The UI is ready.
            </p>
          </Card>
        )}

        {active && (
          <section>
            <h2 className="font-display text-lg font-semibold text-foreground mb-3">Active sprint</h2>
            <ActiveSprintCard sprint={active} />
          </section>
        )}

        {creating && (
          <Card className="p-4 space-y-3">
            <Input
              placeholder="Sprint name (e.g. Sprint 12)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="Sprint goal (optional)"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                placeholder="Start"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
              <Input
                type="date"
                placeholder="End"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createSprint.mutate()} disabled={!form.name.trim()}>
                Create sprint
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">All sprints</h2>
          {sprints.length === 0 && !backendMissing ? (
            <Card className="p-10 text-center">
              <Zap className="h-10 w-10 text-brand-500 mx-auto mb-2" />
              <h3 className="font-display text-lg font-semibold text-foreground mb-1">No sprints yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Create a sprint to time-box your work. Each sprint tracks velocity, burndown, and completion rate.
              </p>
              <Button onClick={() => setCreating(true)} className="mt-4">Create sprint</Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {sprints.map((sprint) => (
                <SprintRow key={sprint.id} sprint={sprint} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ActiveSprintCard({ sprint }: { sprint: Sprint }) {
  const total = sprint.totalPoints ?? 0
  const done = sprint.completedPoints ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Card className="p-6 bg-gradient-to-br from-brand-200/30 to-transparent border-brand-300">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-brand-700 text-white flex items-center justify-center shrink-0">
          <Zap className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-xl font-semibold text-foreground">{sprint.name}</h3>
          {sprint.goal && <p className="text-sm text-muted-foreground mt-0.5">{sprint.goal}</p>}
          <div className="mt-4 grid grid-cols-3 gap-6">
            <Metric label="Points complete" value={`${done} / ${total}`} />
            <Metric label="Completion" value={`${pct}%`} />
            <Metric
              label="Ends"
              value={new Date(sprint.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            />
          </div>
          <div className="mt-4 h-2 rounded-full bg-surface-100 overflow-hidden">
            <div className="h-full bg-brand-700 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="font-display text-xl font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  )
}

function SprintRow({ sprint }: { sprint: Sprint }) {
  const meta = STATUS_META[sprint.status]
  const total = sprint.totalPoints ?? 0
  const done = sprint.completedPoints ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const { workspaceId } = Route.useParams()

  return (
    <Link
      to="/app/$workspaceId/sprints/$sprintId"
      params={{ workspaceId, sprintId: sprint.id }}
      className="block group"
    >
      <Card className="p-3 hover:border-accent/40 hover:shadow-glow transition-all">
        <div className="flex items-center gap-3">
          <span className={cn('h-2 w-2 rounded-full shrink-0', meta.color)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-medium truncate group-hover:text-accent transition-colors">{sprint.name}</div>
              <span className="text-xs text-muted-foreground shrink-0">{meta.label}</span>
            </div>
            {sprint.goal && <div className="text-xs text-muted-foreground truncate">{sprint.goal}</div>}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums shrink-0">
            {sprint.status === 'completed' ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : (
              <TrendingUp className="h-3 w-3" />
            )}
            {done}/{total}pt · {pct}%
          </div>
        </div>
      </Card>
    </Link>
  )
}
