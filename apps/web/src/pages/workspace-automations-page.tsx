import { useState } from 'react'
import { usePermissions } from '../hooks/use-permissions'
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
  MinusCircle,
  FlaskConical,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton } from '../components/loading-skeletons'
import { useSuperAgents } from '../components/super-agents/super-agents-hub'

// ─── Types ────────────────────────────────────────────────────────────────────

/*
 * An automation's conditions (`found-14-oct/automation-conditions-and-actions-unbuilt`): a field of the task,
 * an operator and a value, all of them holding or any one. The fields and the operators each takes are the API's
 * (`automation-conditions.ts`); a set or unset test takes no value.
 */
type Condition = { field: string; operator: string; value?: string }
type TriggerDef = { type: string; filters?: Record<string, string | undefined>; conditions?: Condition[]; match?: 'all' | 'any' }
const CONDITION_FIELDS: Array<{ value: string; operators: string[] }> = [
  { value: 'status', operators: ['is', 'is_not', 'any_of', 'none_of'] },
  { value: 'priority', operators: ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set'] },
  { value: 'assignee', operators: ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set'] },
  { value: 'list', operators: ['is', 'is_not', 'any_of', 'none_of'] },
  { value: 'tag', operators: ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set'] },
  { value: 'due_date', operators: ['is_set', 'is_not_set', 'before', 'after'] },
  { value: 'title', operators: ['is', 'is_not', 'contains'] },
]
const MAX_CONDITIONS = 15
const takesValue = (operator: string) => operator !== 'is_set' && operator !== 'is_not_set'
type ConditionVerdict = { field: string; operator: string; value: string | string[] | null; passed: boolean }
type TestResult = { trigger: string; match: 'all' | 'any'; wouldAct: boolean; conditions: ConditionVerdict[]; actions: ActionDef[] }
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
  // ClickUp's Button field (`ledger-rows/row-719`): the rule runs when that button is pressed on a task.
  { value: 'button.clicked', labelKey: 'automations.trigger.buttonClicked' },
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
  // ClickUp's "Run a Super Agent" action (`ledger-rows/row-852`): an agent picker and this run's own instructions.
  { value: 'run_super_agent', labelKey: 'automations.action.runSuperAgent', paramLabelKey: 'automations.param.agentInstructions', paramKey: 'instructions' },
  // Add a comment, add a watcher, set the due date, fill an AI field (`found-14-oct/automation-conditions-and-actions-unbuilt`).
  { value: 'add_comment', labelKey: 'automations.action.addComment', paramLabelKey: 'automations.param.commentText', paramKey: 'text' },
  { value: 'add_follower', labelKey: 'automations.action.addFollower', paramLabelKey: 'automations.param.userId', paramKey: 'userId' },
  { value: 'set_due_date', labelKey: 'automations.action.setDueDate', paramLabelKey: 'automations.param.days', paramKey: 'days' },
  { value: 'update_ai_field', labelKey: 'automations.action.updateAiField', paramLabelKey: 'automations.param.aiField', paramKey: 'fieldId' },
] as const
/** Actions whose one value is picked, not typed: a member, an AI field. */
const PICKED_PARAMS = new Set(['add_follower', 'update_ai_field'])

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
  {
    labelKey: 'automations.recipe.dueInAWeek',
    trigger: { type: 'task.created', filters: {}, conditions: [{ field: 'due_date', operator: 'is_not_set' }], match: 'all' },
    actions: [{ type: 'set_due_date', params: { days: '7' } }],
  },
  {
    labelKey: 'automations.recipe.urgentNote',
    trigger: { type: 'task.created', filters: {}, conditions: [{ field: 'priority', operator: 'is', value: 'urgent' }], match: 'all' },
    actions: [{ type: 'add_comment', params: { text: 'Urgent: {{task.title}} needs an owner today.' } }],
  },
] as const

type Recipe = (typeof RECIPES)[number]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/automations' })
  const qc = useQueryClient()
  const [showBuilder, setShowBuilder] = useState(false)
  // Making, changing and deleting an automation ask `automation.manage`, as the
  // API does; everybody may read them. Offering the rest to all of them was a
  // button the API refused (`role-editor-offers-unenforced-permissions`).
  const mayManage = usePermissions(workspaceId).can('automation.manage') === true

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
          {mayManage && (
            <Button onClick={() => setShowBuilder(true)} data-testid="automations-new">
              <Plus className="h-4 w-4 mr-1" /> {t('automations.newAutomation')}
            </Button>
          )}
        </div>
      </header>

      {showBuilder && mayManage && (
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
                  mayManage={mayManage}
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
        <AiSuggestionsSection workspaceId={workspaceId} mayManage={mayManage} />

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
                  {mayManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
                      onClick={() => createFromRecipe.mutate(r)}
                      disabled={createFromRecipe.isPending}
                      data-testid="automations-recipe-use"
                    >
                      {t('automations.use')}
                    </Button>
                  )}
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

function AiSuggestionsSection({ workspaceId, mayManage }: { workspaceId: string; mayManage: boolean }) {
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
        <p className="text-sm text-muted-foreground"><InlineSkeleton /></p>
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
                {mayManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
                    onClick={() => createFromSuggestion.mutate(s)}
                    disabled={createFromSuggestion.isPending}
                  >
                    {t('automations.use')}
                  </Button>
                )}
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
  mayManage,
  onToggle,
  onDelete,
}: {
  automation: Automation
  workspaceId: string
  mayManage: boolean
  onToggle: (en: boolean) => void
  onDelete: () => void
}) {
  const { t, tCount } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  // Test on a task: what the rule would do to it, done to nothing.
  const [testQuery, setTestQuery] = useState('')
  const hits = useQuery({
    queryKey: ['automation-test-tasks', workspaceId, testQuery],
    // Search names a hit by its kind and id (`task-<id>`); the test takes the task's own id.
    queryFn: () =>
      api<Array<{ id: string; entityType?: string; title: string }>>(`/search/${workspaceId}?q=${encodeURIComponent(testQuery)}&types=task&limit=5`).then((all) =>
        all.filter((h) => !h.entityType || h.entityType === 'task').map((h) => ({ ...h, id: h.id.replace(/^task-/, '') })),
      ),
    enabled: expanded && mayManage && testQuery.trim().length >= 2,
  })
  const test = useMutation({
    mutationFn: (taskId: string) => api<TestResult>(`/workspaces/${workspaceId}/automations/${automation.id}/test`, { method: 'POST', body: { taskId } }),
  })
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
    <Card className={cn('overflow-hidden', automation.isEnabled ? '' : 'opacity-60')} data-testid="automation-card" data-automation-id={automation.id}>
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
          <button onClick={() => onToggle(!automation.isEnabled)} disabled={!mayManage} data-testid="automation-toggle" className="text-muted-foreground hover:text-foreground disabled:opacity-60 disabled:cursor-default">
            {automation.isEnabled ? (
              <ToggleRight className="h-5 w-5 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </button>
          <button
            onClick={() => setExpanded((x) => !x)}
            data-testid="automation-expand"
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {mayManage && (
            <button onClick={onDelete} data-testid="automation-delete" className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/30">
          {(automation.trigger?.conditions?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground mb-2" data-testid="automation-conditions-summary">
              {t(automation.trigger.match === 'any' ? 'automations.conditionsAny' : 'automations.conditionsAll', {
                list: automation.trigger.conditions!.map((c) => `${t(`automations.field.${c.field}` as 'automations.field.status')} ${t(`automations.op.${c.operator}` as 'automations.op.is')}${c.value ? ` ${c.value}` : ''}`).join(' · '),
              })}
            </p>
          )}
          {mayManage && (
            <div className="mb-3 space-y-2" data-testid="automation-test">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{t('automations.testTitle')}</span>
              </div>
              <Input
                data-testid="automation-test-search"
                className="h-8 text-xs"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder={t('automations.testPlaceholder')}
              />
              {(hits.data ?? []).length > 0 && !test.data && (
                <ul className="rounded-md border bg-background text-xs divide-y">
                  {(hits.data ?? []).map((h) => (
                    <li key={h.id}>
                      <button type="button" data-testid="automation-test-task" className="w-full px-2 py-1.5 text-left hover:bg-muted" onClick={() => test.mutate(h.id)}>
                        {h.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {test.isError && <p className="text-xs text-destructive" data-testid="automation-test-error">{(test.error as Error).message}</p>}
              {test.data && (
                <div className="rounded-md border bg-background p-2 text-xs space-y-1" data-testid="automation-test-result" data-would-act={test.data.wouldAct ? 'true' : 'false'}>
                  <p className="font-medium">{t(test.data.wouldAct ? 'automations.testWouldAct' : 'automations.testWouldNotAct')}</p>
                  {test.data.conditions.map((v, i) => (
                    <p key={i} data-testid="automation-test-condition" data-passed={v.passed ? 'true' : 'false'} className={v.passed ? 'text-emerald-600' : 'text-destructive'}>
                      {v.passed ? '✓' : '✗'} {t(`automations.field.${v.field}` as 'automations.field.status')} {t(`automations.op.${v.operator}` as 'automations.op.is')}
                      {v.value ? ` ${Array.isArray(v.value) ? v.value.join(', ') : v.value}` : ''}
                    </p>
                  ))}
                  {test.data.actions.map((a, i) => {
                    const opt = ACTION_OPTIONS.find((o) => o.value === a.type)
                    return (
                      <p key={i} data-testid="automation-test-action">→ {opt ? t(opt.labelKey) : a.type}</p>
                    )
                  })}
                  <button type="button" className="text-accent hover:underline" onClick={() => test.reset()}>
                    {t('automations.testAgain')}
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="text-xs font-medium text-muted-foreground mb-2">{t('automations.runHistory')}</p>
          {runsQuery.isLoading && <p className="text-xs text-muted-foreground"><InlineSkeleton /></p>}
          {!runsQuery.isLoading && (!runsQuery.data || runsQuery.data.length === 0) && (
            <p className="text-xs text-muted-foreground">{t('automations.noRuns')}</p>
          )}
          {runsQuery.data && runsQuery.data.length > 0 && (
            <div className="space-y-1">
              {runsQuery.data.slice(0, 20).map((run) => (
                <div key={run.id} className="flex items-center gap-2 text-xs" data-testid="automation-run" data-outcome={run.outcome}>
                  {run.outcome === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : run.outcome === 'skipped' ? (
                    <MinusCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                  <span className="text-muted-foreground">
                    {new Date(run.triggeredAt).toLocaleString()}
                  </span>
                  {run.outcome === 'skipped' ? (
                    <span className="text-muted-foreground truncate" data-testid="automation-run-skipped">
                      {t('automations.runSkipped', { count: skippedBy(run).length })}
                    </span>
                  ) : run.errorMsg ? (
                    <span className="text-destructive truncate">{run.errorMsg}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/** The conditions that did not hold on a skipped run, as its context keeps them. */
function skippedBy(run: AutomationRun): ConditionVerdict[] {
  try {
    const all = JSON.parse(run.context?.conditions ?? '[]') as ConditionVerdict[]
    return Array.isArray(all) ? all.filter((v) => !v.passed) : []
  } catch {
    return []
  }
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
  /* The Button a "button is pressed" rule waits for (`ledger-rows/row-719`). */
  const [buttonFieldId, setButtonFieldId] = useState('')
  const buttonsQuery = useQuery({
    queryKey: ['custom-field-buttons', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; name: string; projectName: string }>>(`/workspaces/${workspaceId}/custom-fields/buttons`),
    enabled: triggerType === 'button.clicked',
  })
  const [actions, setActions] = useState<ActionDef[]>([
    { type: 'send_notification', params: { message: '' } },
  ])
  const [conditions, setConditions] = useState<Condition[]>([])
  const [match, setMatch] = useState<'all' | 'any'>('all')
  // Who may be made a watcher, and which AI fields a rule may fill.
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Array<{ userId: string; displayName: string; email: string }>>(`/workspaces/${workspaceId}/members`),
    enabled: actions.some((a) => a.type === 'add_follower'),
  })
  const aiFieldsQuery = useQuery({
    queryKey: ['workspace-fields', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string; projectName: string; ai?: boolean }>>(`/search/${workspaceId}/custom-fields`),
    enabled: actions.some((a) => a.type === 'update_ai_field'),
  })
  const aiFields = (aiFieldsQuery.data ?? []).filter((f) => f.ai)

  // Channels for the post_to_channel action picker (DMs excluded).
  const channelsQuery = useQuery({
    queryKey: ['chat-channels', workspaceId],
    queryFn: () => api<ChatChannel[]>(`/workspaces/${workspaceId}/chat/channels`),
  })
  const channels = (channelsQuery.data ?? []).filter((c) => !c.isDm)
  // The Super Agents this person may use, for the run_super_agent action's picker.
  const agentsQuery = useSuperAgents(workspaceId)
  const agents = (agentsQuery.data ?? []).filter((a) => a.isActive)

  const createMutation = useMutation({
    mutationFn: () =>
      api<Automation>(`/workspaces/${workspaceId}/automations`, {
        method: 'POST',
        body: {
          name: name.trim() || t('automations.newAutomation'),
          trigger: {
            type: triggerType,
            filters:
              triggerType === 'button.clicked'
                ? { fieldId: buttonFieldId }
                : toStatus
                  ? { toStatus }
                  : {},
            ...(conditions.length ? { conditions: conditions.map((c) => (takesValue(c.operator) ? c : { field: c.field, operator: c.operator })), match } : {}),
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
            <Input data-testid="automation-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('automations.namePlaceholder')} />
          </div>

          {/* Trigger */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t('automations.whenTrigger')}
            </label>
            <select
              data-testid="automation-trigger-type"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
            >
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
            {triggerType === 'button.clicked' && (
              <div className="mt-2">
                <label className="text-xs text-muted-foreground mb-1 block">{t('automations.trigger.buttonField')}</label>
                {buttonsQuery.data && buttonsQuery.data.length === 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="automation-trigger-no-buttons">{t('automations.trigger.noButtons')}</p>
                ) : (
                  <select
                    data-testid="automation-trigger-button-field"
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    value={buttonFieldId}
                    onChange={(e) => setButtonFieldId(e.target.value)}
                  >
                    <option value="">—</option>
                    {(buttonsQuery.data ?? []).map((b) => (
                      <option key={b.id} value={b.id}>{b.projectName} · {b.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
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

          {/* Conditions */}
          <div data-testid="automation-conditions">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">{t('automations.conditions')}</label>
              {conditions.length > 1 && (
                <select
                  data-testid="automation-conditions-match"
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  value={match}
                  onChange={(e) => setMatch(e.target.value as 'all' | 'any')}
                >
                  <option value="all">{t('automations.matchAll')}</option>
                  <option value="any">{t('automations.matchAny')}</option>
                </select>
              )}
            </div>
            <div className="space-y-2">
              {conditions.map((c, i) => {
                const field = CONDITION_FIELDS.find((f) => f.value === c.field) ?? CONDITION_FIELDS[0]
                return (
                  <div key={i} className="flex gap-2 items-center flex-wrap" data-testid="automation-condition">
                    <select
                      data-testid="automation-condition-field"
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      value={c.field}
                      onChange={(e) => {
                        const next = CONDITION_FIELDS.find((f) => f.value === e.target.value) ?? CONDITION_FIELDS[0]
                        setConditions((prev) => prev.map((x, idx) => (idx === i ? { field: next.value, operator: next.operators[0], value: '' } : x)))
                      }}
                    >
                      {CONDITION_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>{t(`automations.field.${f.value}` as 'automations.field.status')}</option>
                      ))}
                    </select>
                    <select
                      data-testid="automation-condition-operator"
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      value={c.operator}
                      onChange={(e) => setConditions((prev) => prev.map((x, idx) => (idx === i ? { ...x, operator: e.target.value } : x)))}
                    >
                      {field.operators.map((op) => (
                        <option key={op} value={op}>{t(`automations.op.${op}` as 'automations.op.is')}</option>
                      ))}
                    </select>
                    {takesValue(c.operator) && (
                      <Input
                        data-testid="automation-condition-value"
                        className="flex-1 min-w-[8rem]"
                        type={c.field === 'due_date' ? 'date' : 'text'}
                        value={c.value ?? ''}
                        onChange={(e) => setConditions((prev) => prev.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))}
                        placeholder={t(c.operator === 'any_of' || c.operator === 'none_of' ? 'automations.conditionValues' : 'automations.conditionValue')}
                      />
                    )}
                    <button type="button" onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
              {conditions.length < MAX_CONDITIONS && (
                <button
                  type="button"
                  data-testid="automation-add-condition"
                  onClick={() => setConditions((prev) => [...prev, { field: 'priority', operator: 'is', value: '' }])}
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('automations.addCondition')}
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('automations.thenActions')}</label>
            <div className="space-y-2">
              {actions.map((action, i) => {
                const meta = ACTION_OPTIONS.find((o) => o.value === action.type)
                const isPostToChannel = action.type === 'post_to_channel'
                const isRunAgent = action.type === 'run_super_agent'
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
                            : e.target.value === 'run_super_agent'
                              ? { agentId: '', instructions: '' }
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
                    {isRunAgent && (
                      <select
                        data-testid="automation-agent-picker"
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm flex-1 min-w-[9rem]"
                        value={(action.params.agentId as string) ?? ''}
                        onChange={(e) => updateAction(i, { params: { ...action.params, agentId: e.target.value } })}
                      >
                        <option value="">{t('automations.param.agent')}</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                    {action.type === 'add_follower' && (
                      <select
                        data-testid="automation-follower-picker"
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm flex-1 min-w-[9rem]"
                        value={(action.params.userId as string) ?? ''}
                        onChange={(e) => updateAction(i, { params: { ...action.params, userId: e.target.value } })}
                      >
                        <option value="">{t('automations.param.pickMember')}</option>
                        {(membersQuery.data ?? []).map((m) => (
                          <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
                        ))}
                      </select>
                    )}
                    {action.type === 'update_ai_field' && (
                      <select
                        data-testid="automation-ai-field-picker"
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm flex-1 min-w-[9rem]"
                        value={(action.params.fieldId as string) ?? ''}
                        onChange={(e) => updateAction(i, { params: { ...action.params, fieldId: e.target.value } })}
                      >
                        <option value="">{t('automations.param.aiField')}</option>
                        {aiFields.map((f) => (
                          <option key={f.id} value={f.id}>{f.projectName} · {f.name}</option>
                        ))}
                      </select>
                    )}
                    {meta && !PICKED_PARAMS.has(action.type) && (
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
              data-testid="automation-create-submit"
              disabled={createMutation.isPending || (triggerType === 'button.clicked' && !buttonFieldId)}
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
