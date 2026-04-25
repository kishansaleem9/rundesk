import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, cn } from '@rundesk/ui'
import { Zap, ArrowRight, Sparkles, Plus } from 'lucide-react'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/automations')({
  component: AutomationsPage,
})

type Automation = {
  id: string
  name: string
  enabled: boolean
  trigger: { type: string; description?: string }
  actions: Array<{ type: string; description?: string }>
  runCount?: number
  lastRun?: string | null
}

function AutomationsPage() {
  const { workspaceId } = Route.useParams()
  const query = useQuery({
    queryKey: ['automations', workspaceId],
    queryFn: async () => {
      try {
        return await api<Automation[]>(`/workspaces/${workspaceId}/automations`)
      } catch {
        return [] as Automation[]
      }
    },
  })

  const automations = query.data ?? []
  const recipes = [
    {
      id: 'r1',
      name: 'Auto-assign new tasks',
      description: 'When a task is created, assign it to the project lead.',
      trigger: 'task.created',
      actions: ['assign member'],
    },
    {
      id: 'r2',
      name: 'Notify on overdue',
      description: 'When a task becomes overdue, notify the assignee.',
      trigger: 'task.due_passed',
      actions: ['send notification'],
    },
    {
      id: 'r3',
      name: 'Move blockers to In Review',
      description: 'When a subtask is marked done, move parent to In Review.',
      trigger: 'task.status_changed',
      actions: ['change status'],
    },
    {
      id: 'r4',
      name: 'Weekly summary to Slack',
      description: 'Every Friday, post completed tasks summary to a Slack channel.',
      trigger: 'schedule.weekly',
      actions: ['post to channel'],
    },
  ]

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Workspace</div>
            <h1 className="font-display text-2xl font-semibold text-brand-900">Automations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              When-this-then-that rules that run in the background.
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-1" /> New automation
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        <section>
          <h2 className="font-display text-lg font-semibold text-brand-900 mb-3">Your automations</h2>
          {automations.length === 0 ? (
            <Card className="p-6 text-center border-dashed">
              <Zap className="h-8 w-8 text-brand-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                No automations yet. Pick a starter recipe below or build your own with the visual rule editor.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {automations.map((a) => (
                <AutomationRow key={a.id} automation={a} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-brand-900">Recipes</h2>
            <span className="text-xs text-muted-foreground">Quick-start templates</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recipes.map((r) => (
              <Card key={r.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{r.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <code className="px-1.5 py-0.5 rounded bg-muted">{r.trigger}</code>
                      <ArrowRight className="h-3 w-3" />
                      {r.actions.map((a, i) => (
                        <code key={i} className="px-1.5 py-0.5 rounded bg-muted">{a}</code>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function AutomationRow({ automation }: { automation: Automation }) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', automation.enabled ? 'bg-emerald-100' : 'bg-muted')}>
        <Zap className={cn('h-4 w-4', automation.enabled ? 'text-emerald-700' : 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{automation.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {automation.trigger.type} → {automation.actions.map((a) => a.type).join(', ')}
        </div>
      </div>
      <div className="text-xs text-muted-foreground tabular-nums shrink-0">
        {automation.runCount ?? 0} runs
      </div>
    </Card>
  )
}
