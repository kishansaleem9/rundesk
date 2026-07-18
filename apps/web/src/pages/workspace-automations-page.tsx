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
import { useTranslation } from '../lib/i18n'

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

type ChatChannel = { id: string; name: string; isDm: boolean }

// §7.7 AI-suggested rules (shape returned by POST /ai/automation-suggestions).
type Suggestion = { name: string; trigger: TriggerDef; actions: ActionDef[]; rationale: string }
type SuggestResponse = { source: 'ai' | 'heuristic'; suggestions: Suggestion[] }

// ─── Constants ────────────────────────────────────────────────────────────────
// `labelKey` / `paramLabelKey` reference i18n catalog entries; the raw `value`
// and `paramKey` are the locale-independent identifiers persisted to the API.

const TRIGGER_OPTIONS = [
  { value: 'task.created', labelKey: 'automations.trigger.created' },
  { value: 'task.status_changed', labelKey: 'automations.trigger.statusChanged' },
  { value: 'task.due_passed', labelKey: 'automations.trigger.duePassed' },
  { value: 'task.comment_added', labelKey: 'automations.trigger.commentAdded' },
  { value: 'task.assignee_changed', labelKey: 'automations.trigger.assigneeChanged' },
  { value: 'task.overdue', labelKey: 'automations.trigger.overdue' },
] as const

const ACTION_OPTIONS = [
  { value: 'change_status', labelKey: 'automations.action.changeStatus', paramLabelKey: 'automations.param.status', paramKey: 'status' },
  { value: 'set_priority', labelKey: 'automations.action.setPriority', paramLabelKey: 'automations.param.priority', paramKey: 'priority' },
  { value: 'send_notification', labelKey: 'automations.action.sendNotification', paramLabelKey: 'automations.param.message', paramKey: 'message' },
  { value: 'create_subtask', labelKey: 'automations.action.createSubtask', paramLabelKey: 'automations.param.title', paramKey: 'title' },
  { value: 'assign_member', labelKey: 'automations.action.assignMember', paramLabelKey: 'automations.param.userId', paramKey: 'userId' },
  // §7.7 post-to-channel: needs a channel picker in addition to the message
  // field, handled specially in the builder (see AutomationBuilder).
  { value: 'post_to_channel', labelKey: 'automations.action.postToChannel', paramLabelKey: 'automations.param.messageWithVars', paramKey: 'message' },
] as const

const RECIPES = [
  {
    labelKey: 'automations.recipe.autoNotify',
    trigger: { type: 'task.overdue', filters: {} },
    actions: [{ type: 'send_notification', params: { message: 'A task is overdue!' } }],
  },
  {
    labelKey: 'automations.recipe.closeCompleted',
    trigger: { type: 'task.status_changed', filters: { toStatus: 'done' } },
    actions: [{ type: 'change_status', params: { status: 'done' } }],
  },
  {
    labelKey: 'automations.recipe.followUp',
    trigger: { type: 'task.comment_added', filters: {} },
    actions: [{ type: 'create_subtask', params: { title: 'Follow-up required' } }],
  },
  {
    labelKey: 'automations.recipe.escalate',
    trigger: { type: 'task.overdue', filters: {} },
    actions: [{ type: 'set_priority', params: { priority: 'urgent' } }],
  },
] as const

type Recipe = (typeof RECIPES)[number]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const { t, tCount } = useTranslation()
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
    mutationFn: (recipe: Recipe) =>
      api<Automation>(`/workspaces/${workspaceId}/automations`, {
        method: 'POST',
        body: { name: t(recipe.labelKey), trigger: recipe.trigger, actions: recipe.actions },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations', workspaceId] }),
  })

  const automations = query.data ?? []

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">{t('common.workspace')}</div>
            <h1 className="font-display text-2xl font-semibold text-foreground">{t('nav.automations')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('automations.subtitle')}
            </p>
          </div>
          <Button onClick={() => setShowBuilder(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t('automations.newAutomation')}
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
            {t('automations.yourAutomations', { count: automations.length })}
          </h2>
          {automations.length === 0 && !query.isLoading ? (
            <Card className="p-6 text-center border-dashed">
              <Zap className="h-8 w-8 text-brand-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t('automations.emptyBody')}
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
                    if (confirm(t('automations.confirmDelete', { name: a.name }))) deleteAuto.mutate(a.id)
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* AI suggestions (§7.7) */}
        <AiSuggestionsSection workspaceId={workspaceId} />

        {/* Recipes */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t('automations.recipes')}</h2>
            <span className="text-xs text-muted-foreground">{t('automations.quickStart')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {RECIPES.map((r, i) => (
              <Card key={i} className="p-4 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{t(r.labelKey)}</h3>
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
                    {t('automations.use')}
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

// ─── AiSuggestionsSection (§7.7) ──────────────────────────────────────────────

function AiSuggestionsSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  // Best-effort: the endpoint returns heuristic suggestions when AI is off, so
  // this never hard-fails. Cached for 10 min; refreshable on demand.
  const query = useQuery({
    queryKey: ['automation-suggestions', workspaceId],
    queryFn: () => api<SuggestResponse>(`/ai/automation-suggestions`, { method: 'POST', body: { workspaceId } }),
    staleTime: 1000 * 60 * 10,
    retry: false,
  })

  const createFromSuggestion = useMutation({
    mutationFn: (s: Suggestion) =>
      api<Automation>(`/workspaces/${workspaceId}/automations`, {
        method: 'POST',
        body: { name: s.name, trigger: s.trigger, actions: s.actions },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations', workspaceId] }),
  })

  const suggestions = query.data?.suggestions ?? []

  return (
    <section>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" /> {t('automations.aiSuggestions')}
        </h2>
        <div className="flex items-center gap-2">
          {query.data && (
            <span className="text-xs text-muted-foreground">
              {t(query.data.source === 'ai' ? 'ai.suggestionSourceAi' : 'ai.suggestionSourceHeuristic')}
            </span>
          )}
          <button
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            {t('automations.aiSuggestRefresh')}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{t('automations.aiSuggestionsDesc')}</p>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('automations.aiSuggestLoading')}</p>
      ) : query.isError ? (
        <p className="text-sm text-muted-foreground">{t('automations.aiSuggestError')}</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('automations.aiSuggestEmpty')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestions.map((s, i) => (
            <Card key={i} className="p-4 hover:shadow-md transition-shadow group">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-violet-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{s.name}</h3>
                    <span className="text-[10px] uppercase tracking-wide rounded bg-violet-100 text-violet-700 px-1.5 py-0.5">
                      {t('automations.suggestedBadge')}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground flex-wrap">
                    <code className="px-1.5 py-0.5 rounded bg-muted">{s.trigger && typeof s.trigger === 'object' ? s.trigger.type : String(s.trigger ?? '')}</code>
                    <ArrowRight className="h-3 w-3" />
                    {(Array.isArray(s.actions) ? s.actions : []).map((a, j) => (
                      <code key={j} className="px-1.5 py-0.5 rounded bg-muted">{a.type}</code>
                    ))}
                  </div>
                  {s.rationale && <p className="mt-2 text-xs text-muted-foreground">{s.rationale}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
                  onClick={() => createFromSuggestion.mutate(s)}
                  disabled={createFromSuggestion.isPending}
                >
                  {t('automations.use')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
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
  const { t, tCount } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const runsQuery = useQuery({
    queryKey: ['automation-runs', automation.id],
    queryFn: () => api<AutomationRun[]>(`/workspaces/${workspaceId}/automations/${automation.id}/runs`),
    enabled: expanded,
  })

  // Defend against malformed rows (e.g. a trigger stored as a bare string or
  // actions stored as a non-array): a single bad automation must not crash the
  // whole page via the route error boundary.
  const triggerType = (automation.trigger && typeof automation.trigger === 'object')
    ? automation.trigger.type
    : typeof automation.trigger === 'string'
      ? (automation.trigger as string)
      : ''
  const triggerOpt = TRIGGER_OPTIONS.find((o) => o.value === triggerType)
  const triggerLabel = triggerOpt ? t(triggerOpt.labelKey) : (triggerType || '—')
  const actionList = Array.isArray(automation.actions) ? automation.actions : []
  const actionLabels = actionList.map((a) => {
    const opt = ACTION_OPTIONS.find((o) => o.value === a.type)
    return opt ? t(opt.labelKey) : a.type
  })

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
          <span className="text-xs text-muted-foreground tabular-nums">{tCount('automations.runsCount', automation.runCount)}</span>
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
          <p className="text-xs font-medium text-muted-foreground mb-2">{t('automations.runHistory')}</p>
          {runsQuery.isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
          {!runsQuery.isLoading && (!runsQuery.data || runsQuery.data.length === 0) && (
            <p className="text-xs text-muted-foreground">{t('automations.noRuns')}</p>
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
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('task.created')
  const [toStatus, setToStatus] = useState('')
  const [actions, setActions] = useState<ActionDef[]>([
    { type: 'send_notification', params: { message: '' } },
  ])

  // Channels for the post_to_channel action picker (DMs excluded).
  const channelsQuery = useQuery({
    queryKey: ['chat-channels', workspaceId],
    queryFn: () => api<ChatChannel[]>(`/workspaces/${workspaceId}/chat/channels`),
  })
  const channels = (channelsQuery.data ?? []).filter((c) => !c.isDm)

  const createMutation = useMutation({
    mutationFn: () =>
      api<Automation>(`/workspaces/${workspaceId}/automations`, {
        method: 'POST',
        body: {
          name: name.trim() || t('automations.newAutomation'),
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
          <h2 className="font-semibold">{t('automations.newAutomation')}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('automations.name')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('automations.namePlaceholder')} />
          </div>

          {/* Trigger */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t('automations.whenTrigger')}
            </label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
            >
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
            {triggerType === 'task.status_changed' && (
              <div className="mt-2">
                <label className="text-xs text-muted-foreground mb-1 block">{t('automations.toStatus')}</label>
                <Input
                  value={toStatus}
                  onChange={(e) => setToStatus(e.target.value)}
                  placeholder={t('automations.toStatusPlaceholder')}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('automations.thenActions')}</label>
            <div className="space-y-2">
              {actions.map((action, i) => {
                const meta = ACTION_OPTIONS.find((o) => o.value === action.type)
                const isPostToChannel = action.type === 'post_to_channel'
                return (
                  <div key={i} className="flex gap-2 items-start flex-wrap">
                    <select
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm flex-1 min-w-[9rem]"
                      value={action.type}
                      onChange={(e) => {
                        const newMeta = ACTION_OPTIONS.find((o) => o.value === e.target.value)
                        // post_to_channel carries both a channelId and a message.
                        const params =
                          e.target.value === 'post_to_channel'
                            ? { channelId: '', message: '' }
                            : newMeta
                              ? { [newMeta.paramKey]: '' }
                              : {}
                        updateAction(i, { type: e.target.value, params })
                      }}
                    >
                      {ACTION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                      ))}
                    </select>
                    {isPostToChannel && (
                      <select
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm flex-1 min-w-[9rem]"
                        value={(action.params.channelId as string) ?? ''}
                        onChange={(e) => updateAction(i, { params: { ...action.params, channelId: e.target.value } })}
                      >
                        <option value="">{t('automations.param.selectChannel')}</option>
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>#{c.name}</option>
                        ))}
                      </select>
                    )}
                    {meta && (
                      <Input
                        className="flex-1 min-w-[9rem]"
                        value={(action.params[meta.paramKey] as string) ?? ''}
                        onChange={(e) =>
                          updateAction(i, { params: { ...action.params, [meta.paramKey]: e.target.value } })
                        }
                        placeholder={t(meta.paramLabelKey)}
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
                <Plus className="h-3.5 w-3.5" /> {t('automations.addAction')}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? t('automations.creating') : t('automations.createAutomation')}
            </Button>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
