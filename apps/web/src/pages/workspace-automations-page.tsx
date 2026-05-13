import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
import {
  Zap,
  ArrowRight,
  Sparkles,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerDef = { type: string; filters?: Record<string, string | undefined> }
type ActionDef = { type: string; params: Record<string, string | undefined> }

type Automation = {
  id: string
  name: string
  isEnabled: boolean
  trigger: TriggerDef
  actions: ActionDef[]
  runCount: number
  lastRunAt?: string | null
}

type AutomationRun = {
  id: string
  triggeredAt: string
  outcome: string
  errorMsg?: string | null
  context?: Record<string, string>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: 'task.created', label: 'Task is created' },
  { value: 'task.status_changed', label: 'Task status changes' },
  { value: 'task.due_passed', label: 'Task due date passes' },
  { value: 'task.comment_added', label: 'Comment is added to task' },
  { value: 'task.assignee_changed', label: 'Task assignee changes' },
  { value: 'task.overdue', label: 'Task becomes overdue' },
]

const ACTION_OPTIONS = [
  { value: 'change_status', label: 'Change task status', paramLabel: 'New status', paramKey: 'status' },
  { value: 'set_priority', label: 'Set task priority', paramLabel: 'Priority', paramKey: 'priority' },
  { value: 'send_notification', label: 'Send notification', paramLabel: 'Message', paramKey: 'message' },
  { value: 'create_subtask', label: 'Create a subtask', paramLabel: 'Subtask title', paramKey: 'title' },
  { value: 'assign_member', label: 'Assign member', paramLabel: 'User ID', paramKey: 'userId' },
]

const RECIPES = [
  {
    name: 'Auto-notify on overdue',
    trigger: { type: 'task.overdue', filters: {} },
    actions: [{ type: 'send_notification', params: { message: 'A task is overdue!' } }],
  },
  {
    name: 'Close completed tasks',
    trigger: { type: 'task.status_changed', filters: { toStatus: 'done' } },
    actions: [{ type: 'change_status', params: { status: 'done' } }],
  },
  {
    name: 'Create follow-up on comment',
    trigger: { type: 'task.comment_added', filters: {} },
    actions: [{ type: 'create_subtask', params: { title: 'Follow-up required' } }],
  },
  {
    name: 'Escalate overdue to urgent',
    trigger: { type: 'task.overdue', filters: {} },
    actions: [{ type: 'set_priority', params: { priority: 'urgent' } }],
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/automations' })
  const qc = useQueryClient()
  const [showBuilder, setShowBuilder] = useState(false)

  const query = useQuery({
    queryKey: ['automations', workspaceId],
    queryFn: () => api<Automation[]>(`/workspaces/${workspaceId}/automations`),
  })

  const deleteAuto = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/automations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations', workspaceId] }),
  })

  const toggleAuto = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api(`/workspaces/${workspaceId}/automations/${id}`, { method: 'PATCH', body: { isEnabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations', workspaceId] }),
  })

  const createFromRecipe = useMutation({
    mutationFn: (recipe: { name: string; trigger: TriggerDef; actions: ActionDef[] }) =>
      api<Automation>(`/workspaces/${workspaceId}/automations`, { method: 'POST', body: recipe }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations', workspaceId] }),
  })

  const automations = query.data ?? []

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Workspace</div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Automations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              When-this-then-that rules that run automatically.
            </p>
          </div>
          <Button onClick={() => setShowBuilder(true)}>
            <Plus className="h-4 w-4 mr-1" /> New automation
          </Button>
        </div>
      </header>

      {showBuilder && (
        <AutomationBuilder
          workspaceId={workspaceId}
          onClose={() => setShowBuilder(false)}
          onCreated={() => {
            setShowBuilder(false)
            qc.invalidateQueries({ queryKey: ['automations', workspaceId] })
          }}
        />
      )}

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* Active automations */}
        <section>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
            Your automations ({automations.length})
          </h2>
          {automations.length === 0 && !query.isLoading ? (
            <Card className="p-6 text-center border-dashed">
              <Zap className="h-8 w-8 text-brand-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                No automations yet. Pick a recipe below or build your own.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {automations.map((a) => (
                <AutomationRow
                  key={a.id}
                  automation={a}
                  workspaceId={workspaceId}
                  onToggle={(en) => toggleAuto.mutate({ id: a.id, isEnabled: en })}
                  onDelete={() => {
                    if (confirm(`Delete "${a.name}"?`)) deleteAuto.mutate(a.id)
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recipes */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Recipes</h2>
            <span className="text-xs text-muted-foreground">Quick-start templates</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {RECIPES.map((r, i) => (
              <Card key={i} className="p-4 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{r.name}</h3>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground flex-wrap">
                      <code className="px-1.5 py-0.5 rounded bg-muted">{r.trigger.type}</code>
                      <ArrowRight className="h-3 w-3" />
                      {r.actions.map((a, j) => (
                        <code key={j} className="px-1.5 py-0.5 rounded bg-muted">{a.type}</code>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
                    onClick={() => createFromRecipe.mutate(r)}
                    disabled={createFromRecipe.isPending}
                  >
                    Use
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── AutomationRow ────────────────────────────────────────────────────────────

function AutomationRow({
  automation,
  workspaceId,
  onToggle,
  onDelete,
}: {
  automation: Automation
  workspaceId: string
  onToggle: (en: boolean) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const runsQuery = useQuery({
    queryKey: ['automation-runs', automation.id],
    queryFn: () => api<AutomationRun[]>(`/workspaces/${workspaceId}/automations/${automation.id}/runs`),
    enabled: expanded,
  })

  const triggerLabel = TRIGGER_OPTIONS.find((t) => t.value === automation.trigger.type)?.label ?? automation.trigger.type
  const actionLabels = automation.actions.map(
    (a) => ACTION_OPTIONS.find((o) => o.value === a.type)?.label ?? a.type,
  )

  return (
    <Card className={cn('overflow-hidden', automation.isEnabled ? '' : 'opacity-60')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
            automation.isEnabled ? 'bg-emerald-100' : 'bg-muted',
          )}
        >
          <Zap className={cn('h-4 w-4', automation.isEnabled ? 'text-emerald-700' : 'text-muted-foreground')} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{automation.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
            <span>{triggerLabel}</span>
            <ArrowRight className="h-3 w-3" />
            <span>{actionLabels.join(', ')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">{automation.runCount} runs</span>
          {automation.lastRunAt && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              <Clock className="h-3 w-3 inline mr-0.5" />
              {new Date(automation.lastRunAt).toLocaleDateString()}
            </span>
          )}
          <button onClick={() => onToggle(!automation.isEnabled)} className="text-muted-foreground hover:text-foreground">
            {automation.isEnabled ? (
              <ToggleRight className="h-5 w-5 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </button>
          <button
            onClick={() => setExpanded((x) => !x)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-2">Run history (last 20)</p>
          {runsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!runsQuery.isLoading && (!runsQuery.data || runsQuery.data.length === 0) && (
            <p className="text-xs text-muted-foreground">No runs yet.</p>
          )}
          {runsQuery.data && runsQuery.data.length > 0 && (
            <div className="space-y-1">
              {runsQuery.data.slice(0, 20).map((run) => (
                <div key={run.id} className="flex items-center gap-2 text-xs">
                  {run.outcome === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                  <span className="text-muted-foreground">
                    {new Date(run.triggeredAt).toLocaleString()}
                  </span>
                  {run.errorMsg && (
                    <span className="text-destructive truncate">{run.errorMsg}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ─── AutomationBuilder ────────────────────────────────────────────────────────

function AutomationBuilder({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('task.created')
  const [toStatus, setToStatus] = useState('')
  const [actions, setActions] = useState<ActionDef[]>([
    { type: 'send_notification', params: { message: '' } },
  ])

  const createMutation = useMutation({
    mutationFn: () =>
      api<Automation>(`/workspaces/${workspaceId}/automations`, {
        method: 'POST',
        body: {
          name: name.trim() || 'New automation',
          trigger: {
            type: triggerType,
            filters: toStatus ? { toStatus } : {},
          },
          actions,
        },
      }),
    onSuccess: onCreated,
  })

  function addAction() {
    setActions((prev) => [...prev, { type: 'send_notification', params: { message: '' } }])
  }

  function removeAction(i: number) {
    setActions((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateAction(i: number, partial: Partial<ActionDef>) {
    setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...partial } : a)))
  }

  return (
    <div className="border-b border-border bg-card shadow-sm">
      <div className="px-6 py-4 max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">New automation</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My automation" />
          </div>

          {/* Trigger */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              When (trigger)
            </label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {triggerType === 'task.status_changed' && (
              <div className="mt-2">
                <label className="text-xs text-muted-foreground mb-1 block">To status (optional)</label>
                <Input
                  value={toStatus}
                  onChange={(e) => setToStatus(e.target.value)}
                  placeholder="e.g. done"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Then (actions)</label>
            <div className="space-y-2">
              {actions.map((action, i) => {
                const meta = ACTION_OPTIONS.find((o) => o.value === action.type)
                return (
                  <div key={i} className="flex gap-2 items-start">
                    <select
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm flex-1"
                      value={action.type}
                      onChange={(e) => {
                        const newMeta = ACTION_OPTIONS.find((o) => o.value === e.target.value)
                        updateAction(i, { type: e.target.value, params: newMeta ? { [newMeta.paramKey]: '' } : {} })
                      }}
                    >
                      {ACTION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {meta && (
                      <Input
                        className="flex-1"
                        value={(action.params[meta.paramKey] as string) ?? ''}
                        onChange={(e) =>
                          updateAction(i, { params: { ...action.params, [meta.paramKey]: e.target.value } })
                        }
                        placeholder={meta.paramLabel}
                      />
                    )}
                    {actions.length > 1 && (
                      <button onClick={() => removeAction(i)} className="text-muted-foreground hover:text-destructive mt-1.5">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })}
              <button
                onClick={addAction}
                className="text-xs text-accent hover:underline flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add another action
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating…' : 'Create automation'}
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
