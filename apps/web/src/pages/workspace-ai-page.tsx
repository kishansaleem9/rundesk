import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Input, cn, toast } from '@rundesk/ui'
import { AiValuePanel } from '../components/ai-value-panel'
import {
  Sparkles,
  Wand2,
  FileText,
  Zap,
  ArrowRight,
  Loader2,
  Copy,
  CheckCircle2,
  Plus,
  MessageSquare,
  X,
  Terminal,
  AlertTriangle,
  Library,
  Search,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  LineChart,
} from 'lucide-react'
import { api } from '../lib/api'
import { AiPanel } from '../components/ai-panel'
import { useSkill, useAiChatActions } from '../lib/skills-api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { localDateTimeValue } from '../lib/local-date'
import { useSpeechRecognition, MicButton } from '../lib/use-speech-recognition'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { fieldsOfList } from '../lib/field-scope'

type GeneratedTask = {
  title: string
  description: string
  subtasks: string[]
  priority: string
  estimatedHours?: number | null
  customFieldValues?: Array<{ fieldName: string; value: string | number | boolean }>
}

// Editable working copy of a generated task (Plan §7.1) — user tweaks before save.
type EditableTask = {
  title: string
  description: string
  priority: TaskPriority
  subtasks: string[]
  estimatedHours: number | null
}

type GenCustomFieldDef = {
  id: string
  name: string
  type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating'
  isRequired: boolean
  options: Array<{ label: string; value: string }> | null
  /** The one list this field is scoped to, or none for the whole project (`fieldsOfList`). */
  listId?: string | null
}

type GenListOption = { value: string; label: string; projectId: string }

/** Coerce an editable string into the shape the custom-field value API expects. */
function coerceCustomFieldValue(
  type: GenCustomFieldDef['type'],
  raw: string,
): string | number | boolean {
  if (type === 'checkbox') return raw === 'true'
  if (type === 'number' || type === 'money' || type === 'rating') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return raw
}

type ExtractedTask = {
  title: string
  description: string
  assigneeName?: string | null
  dueDate?: string | null
  priority: string
}
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'

// `labelKey` references an i18n catalog entry; the raw `value` is the
// locale-independent priority identifier persisted to / compared against the API.
const PRIORITY_OPTIONS = [
  { value: 'urgent', labelKey: 'ai.priorityUrgent' },
  { value: 'high', labelKey: 'ai.priorityHigh' },
  { value: 'normal', labelKey: 'ai.priorityNormal' },
  { value: 'low', labelKey: 'ai.priorityLow' },
] as const

function priorityLabelKey(value: string): TranslationKey {
  switch (value) {
    case 'urgent':
      return 'ai.priorityUrgent'
    case 'high':
      return 'ai.priorityHigh'
    case 'low':
      return 'ai.priorityLow'
    default:
      return 'ai.priorityNormal'
  }
}

// Writing-assistant modes. `id` is the locale-independent value sent to the API;
// `labelKey` is the translated button/label text.
const WRITING_MODES = [
  { id: 'improve', labelKey: 'ai.modeImprove' },
  { id: 'shorten', labelKey: 'ai.modeShorten' },
  { id: 'expand', labelKey: 'ai.modeExpand' },
  { id: 'format', labelKey: 'ai.modeFormat' },
] as const

function writingModeLabelKey(mode: string): TranslationKey {
  return WRITING_MODES.find((m) => m.id === mode)?.labelKey ?? 'ai.modeImprove'
}

export function AiPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/ai' })
  const { prompt, skillId, thread: threadFromUrl } = useSearch({ from: '/app/$workspaceId/ai' })
  const [activeTab, setActiveTab] = useState<'chat' | 'knowledge' | 'commands' | 'generate' | 'notes' | 'writing' | 'analytics'>('chat')

  // §A2.3 — `?prompt=` is a question handed over from another surface; the chat
  // tab asks it on arrival, then the param is dropped so switching tabs or
  // reloading does not spend another model call on the same question.
  const handedOverAsk = useMemo(
    () => (prompt?.trim() ? { text: prompt.trim(), id: 0 } : undefined),
    [prompt],
  )
  const navigate = useNavigate({ from: '/app/$workspaceId/ai' })

  // Only for the composer chip's label — the server resolves the skill itself,
  // and does the access check while it is there.
  const { data: activeSkill } = useSkill(workspaceId, skillId ?? '')

  // §15 — the conversation is a real thread now, so it survives closing the
  // panel (frames `296_1817` → `304_1907`). One is opened lazily: creating a
  // thread for every visit to the AI tab would fill the sidebar with empty
  // "New Chat" rows nobody started.
  // The sidebar fetches the list itself; this page only needs to be able to
  // start one, and a second subscription here would just be another cache to
  // keep in step.
  const chat = useAiChatActions(workspaceId)
  const [threadId, setThreadId] = useState<string | null>(threadFromUrl ?? null)
  const startingRef = useRef(false)

  // A sidebar click names a different thread; follow it rather than staying on
  // whichever one this page opened first.
  useEffect(() => {
    if (threadFromUrl && threadFromUrl !== threadId) setThreadId(threadFromUrl)
  }, [threadFromUrl, threadId])

  useEffect(() => {
    if (threadId || activeTab !== 'chat' || startingRef.current) return
    startingRef.current = true
    void chat
      .create(skillId)
      .then((thread) => setThreadId(thread.id))
      .catch(() => {})
      .finally(() => { startingRef.current = false })
    // Intentionally not depending on `chat`: it is rebuilt each render, and
    // depending on it would start a new thread on every one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, activeTab, skillId])

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow animate-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold leading-tight">{t('ai.title')}</h1>
            <p className="text-xs text-muted-foreground">
              {t('ai.subtitle')}
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border/40 px-6 gap-1 overflow-x-auto scrollbar-none">
        {(
          [
            { id: 'chat', labelKey: 'ai.tabChat', icon: MessageSquare },
            { id: 'knowledge', labelKey: 'ai.tabKnowledge', icon: Library },
            { id: 'commands', labelKey: 'ai.tabCommands', icon: Terminal },
            { id: 'generate', labelKey: 'ai.tabGenerate', icon: Wand2 },
            { id: 'notes', labelKey: 'ai.tabNotes', icon: FileText },
            { id: 'writing', labelKey: 'ai.tabWriting', icon: Zap },
            // §V2-11, frames `19:00`/`19:05` — Analytics sits in the AI section's
            // own nav, which here is this tab strip.
            { id: 'analytics', labelKey: 'ai.tabAnalytics', icon: LineChart },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`ai-tab-${tab.id}`}
            className={cn(
              'flex items-center gap-1.5 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <AiPanel
            workspaceId={workspaceId}
            ask={handedOverAsk}
            // Clearing the prompt must not also clear the skill: dropping the
            // whole search object here would silently end the skill's scope
            // after exactly one answer.
            onAskHandled={() => navigate({ search: (prev) => ({ ...prev, prompt: undefined }), replace: true })}
            skillId={skillId}
            skillName={activeSkill?.name}
            threadId={threadId}
            className="h-full"
          />
        )}
        {activeTab === 'knowledge' && <KnowledgeTab workspaceId={workspaceId} />}
        {activeTab === 'commands' && <CommandsTab workspaceId={workspaceId} />}
        {activeTab === 'generate' && <TaskGeneratorTab workspaceId={workspaceId} />}
        {activeTab === 'notes' && <MeetingNotesTab workspaceId={workspaceId} />}
        {activeTab === 'writing' && <WritingTab />}
        {activeTab === 'analytics' && <AiValuePanel workspaceId={workspaceId} />}
      </div>
    </div>
  )
}

// ─── Knowledge base — "Ask about your workspace" (Plan §15.1) ─────────────────

type KnowledgeSource = { type: string; id: string; title: string; url: string }
// `source` reflects how the answer was produced over the semantic vector store:
// 'ai' (model, grounded on vector hits), 'vector' (deterministic over vector
// hits), or 'fallback' (no accessible vector matches).
type KnowledgeAnswer = { answer: string; sources: KnowledgeSource[]; source: 'ai' | 'vector' | 'fallback' }
type ReindexResult = { total: number; indexed: number; skipped: number }

const KNOWLEDGE_SUGGESTION_KEYS = [
  'ai.knowledgeExampleStatus',
  'ai.knowledgeExampleBlockers',
  'ai.knowledgeExampleDecisions',
] as const

function KnowledgeTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const { isManagerOrAbove } = useWorkspaceRole(workspaceId)
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<KnowledgeAnswer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reindexMsg, setReindexMsg] = useState<string | null>(null)

  const ask = useMutation({
    mutationFn: (q: string) =>
      api<KnowledgeAnswer>('/ai/knowledge', { method: 'POST', body: { workspaceId, question: q } }),
    onSuccess: (data) => {
      setResult(data)
      setError(null)
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('ai.knowledgeError')),
  })

  // Admin backfill: re-embed the workspace into the semantic store (§15.1).
  const reindex = useMutation({
    mutationFn: () =>
      api<ReindexResult>(`/workspaces/${workspaceId}/knowledge/reindex`, { method: 'POST' }),
    onSuccess: (data) =>
      setReindexMsg(t('ai.knowledgeReindexed', { indexed: data.indexed, total: data.total })),
    onError: (err) => setReindexMsg(err instanceof Error ? err.message : t('ai.knowledgeReindexError')),
  })

  function submit() {
    const q = question.trim()
    if (!q || ask.isPending) return
    ask.mutate(q)
  }

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold mb-1">{t('ai.knowledgeTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('ai.knowledgeDesc')}</p>
        </div>
        {isManagerOrAbove && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setReindexMsg(null)
              reindex.mutate()
            }}
            disabled={reindex.isPending}
            className="shrink-0"
            title={t('ai.knowledgeReindexHint')}
          >
            {reindex.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5">{t('ai.knowledgeReindex')}</span>
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('ai.knowledgePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="flex-1"
        />
        <Button onClick={submit} disabled={!question.trim() || ask.isPending}>
          {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      <div className="space-y-1">
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 mt-px shrink-0 text-brand-500" />
          {t('ai.knowledgeSemanticNote')}
        </p>
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 mt-px shrink-0 text-emerald-600 dark:text-emerald-400" />
          {t('ai.knowledgeScopeNote')}
        </p>
      </div>

      {reindexMsg && (
        <p className="text-[11px] text-muted-foreground">{reindexMsg}</p>
      )}

      {!result && !ask.isPending && (
        <div className="flex flex-wrap gap-1.5">
          {KNOWLEDGE_SUGGESTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setQuestion(t(key))
                ask.mutate(t(key))
              }}
              className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              {t(key)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">{error}</Card>
      )}

      {result && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full',
                result.source === 'ai'
                  ? 'bg-brand-200/20 text-brand-700 dark:text-brand-300'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {result.source === 'ai' ? t('ai.knowledgeAiBadge') : t('ai.knowledgeSearchBadge')}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{result.answer}</p>

          {result.sources.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('ai.knowledgeSources')}
              </p>
              <ul className="space-y-1">
                {result.sources.map((src) => (
                  <li key={`${src.type}-${src.id}`}>
                    <a
                      href={src.url}
                      className="group flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                        {src.type}
                      </span>
                      <span className="flex-1 truncate group-hover:underline">{src.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── Natural-language Commands (Plan §7.6 / §7.8) ─────────────────────────────

type CommandPlanAction = {
  tool: string
  humanLabel: string
  affectedTaskIds?: string[]
  args?: Record<string, unknown>
}
type CommandSearchResult = {
  query: string
  tasks: Array<{ id: string; title: string; status: string; dueDate: string | null }>
}
type CommandPlan = {
  summary: string
  actions: CommandPlanAction[]
  readOnlyResults: CommandSearchResult[]
  warnings: string[]
}
type CommandActionResult = {
  tool: string
  humanLabel: string
  status: 'succeeded' | 'skipped' | 'failed'
  reason?: string
}

const COMMAND_SUGGESTION_KEYS = [
  'ai.commandExampleOverdue',
  'ai.commandExampleCreate',
  'ai.commandExampleAssign',
] as const

function CommandsTab({ workspaceId }: { workspaceId: string }) {
  const { t, tCount, locale } = useTranslation()
  const [message, setMessage] = useState('')
  const [plan, setPlan] = useState<CommandPlan | null>(null)
  const [results, setResults] = useState<CommandActionResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Push-to-talk voice input (Plan §15.2). On a final transcript we drop the
  // spoken text into the command box — the typed path is unchanged and the
  // transcript stays editable before the user hits Preview.
  const voice = useSpeechRecognition({
    locale,
    onResult: (transcript) =>
      setMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript)),
  })

  const preview = useMutation({
    mutationFn: () => api<CommandPlan>('/ai/command', { method: 'POST', body: { workspaceId, message } }),
    onSuccess: (data) => {
      setPlan(data)
      setResults(null)
      setError(null)
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('ai.commandError')),
  })

  const execute = useMutation({
    mutationFn: () =>
      api<{ results: CommandActionResult[] }>('/ai/command/execute', {
        method: 'POST',
        body: { workspaceId, actions: plan?.actions ?? [] },
      }),
    onSuccess: (data) => {
      setResults(data.results)
      setPlan(null)
      setError(null)
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('ai.commandError')),
  })

  function cancelPlan() {
    setPlan(null)
    setError(null)
  }

  function resetAll() {
    setPlan(null)
    setResults(null)
    setError(null)
    setMessage('')
  }

  const busy = preview.isPending || execute.isPending

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full space-y-4">
      <div>
        <h2 className="font-semibold mb-1">{t('ai.commandsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('ai.commandsDesc')}</p>
      </div>

      <div className="space-y-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('ai.commandPlaceholder')}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && message.trim() && !busy) preview.mutate()
          }}
        />
        {voice.supported && (voice.listening || voice.interimTranscript) && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden />
            <span className="font-medium">{t('ai.voiceListening')}</span>
            {voice.interimTranscript && <span className="italic truncate">{voice.interimTranscript}</span>}
          </p>
        )}
        {voice.error && (
          <p className="text-xs text-amber-700 dark:text-amber-300" role="alert">
            {voice.error === 'not-allowed' || voice.error === 'service-not-allowed'
              ? t('ai.voicePermissionDenied')
              : t('ai.voiceError')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => preview.mutate()} disabled={!message.trim() || busy}>
            {preview.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t('ai.commandPlanning')}</>
            ) : (
              <><Terminal className="h-4 w-4 mr-1.5" /> {t('ai.commandPreview')}</>
            )}
          </Button>
          <MicButton
            controller={voice}
            disabled={busy}
            labels={{
              start: t('ai.voiceStart'),
              stop: t('ai.voiceStop'),
              unsupported: t('ai.voiceUnsupported'),
            }}
          />
          {(plan || results) && (
            <Button variant="ghost" size="sm" onClick={resetAll} disabled={busy}>
              {t('ai.commandRunAnother')}
            </Button>
          )}
        </div>
        {!plan && !results && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {COMMAND_SUGGESTION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMessage(t(key))}
                className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {t(key)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">{error}</Card>
      )}

      {plan && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('ai.commandPreviewHeading')}
          </div>
          <p className="text-sm">{plan.summary}</p>

          {plan.actions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('ai.commandProposedChanges')}
              </p>
              <ul className="space-y-1.5">
                {plan.actions.map((action, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm rounded-md border border-border px-3 py-2">
                    <ArrowRight className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                    <div className="flex-1">
                      <span>{action.humanLabel}</span>
                      {action.affectedTaskIds && action.affectedTaskIds.length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {tCount('ai.commandAffected', action.affectedTaskIds.length)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('ai.commandNoActions')}</p>
          )}

          {plan.readOnlyResults.some((r) => r.tasks.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('ai.commandFoundTasks')}
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {plan.readOnlyResults.flatMap((r) => r.tasks).slice(0, 20).map((task) => (
                  <li key={task.id} className="flex items-center gap-2">
                    <span className="text-foreground">{task.title}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5">{task.status}</span>
                    {task.dueDate && <span>{t('ai.due', { date: task.dueDate })}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.warnings.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('ai.commandNotesLabel')}
              </p>
              {plan.warnings.map((warning, index) => (
                <p key={index} className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => execute.mutate()}
              disabled={busy || plan.actions.length === 0}
            >
              {execute.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> {t('ai.commandRunning')}</>
              ) : (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> {t('ai.commandConfirm')}</>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelPlan} disabled={busy}>
              {t('ai.commandCancel')}
            </Button>
          </div>
        </Card>
      )}

      {results && (
        <Card className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('ai.commandResults')}</p>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('ai.commandNoActions')}</p>
          ) : (
            <ul className="space-y-1.5">
              {results.map((res, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  {res.status === 'succeeded' ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                  ) : res.status === 'skipped' ? (
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                  ) : (
                    <X className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  )}
                  <div className="flex-1">
                    <span>{res.humanLabel}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {res.status === 'succeeded'
                        ? t('ai.commandDone')
                        : res.status === 'skipped'
                          ? res.reason === 'no_permission'
                            ? t('ai.commandNoPermission')
                            : `${t('ai.commandSkipped')}${res.reason ? ` — ${res.reason}` : ''}`
                          : `${t('ai.commandFailed')}${res.reason ? ` — ${res.reason}` : ''}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── Task Generator ───────────────────────────────────────────────────────────

function TaskGeneratorTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [targetListId, setTargetListId] = useState('')
  const [result, setResult] = useState<EditableTask | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Destination lists across the workspace (space / project / list), each
  // carrying its projectId so we can resolve the project's custom fields.
  const listOptionsQuery = useQuery({
    queryKey: ['ai-generate-lists', workspaceId],
    queryFn: async () => {
      const spaces = await api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`)
      const options: GenListOption[] = []
      for (const space of spaces) {
        const projects = await api<Array<{ id: string; name: string }>>(`/projects/space/${space.id}`)
        for (const project of projects) {
          const lists = await api<Array<{ id: string; name: string }>>(`/lists/project/${project.id}`)
          for (const list of lists) {
            options.push({
              value: list.id,
              label: `${space.name} / ${project.name} / ${list.name}`,
              projectId: project.id,
            })
          }
        }
      }
      return options
    },
  })
  const listOptions = listOptionsQuery.data ?? []
  const selectedProjectId = listOptions.find((o) => o.value === targetListId)?.projectId ?? ''

  // Custom fields defined on the chosen destination project (Plan §7.1) —
  // resolved the same way the task-template instantiate path does.
  const fieldsQuery = useQuery({
    queryKey: ['ai-generate-fields', workspaceId, selectedProjectId],
    queryFn: () =>
      api<GenCustomFieldDef[]>(`/workspaces/${workspaceId}/projects/${selectedProjectId}/custom-fields`),
    enabled: Boolean(selectedProjectId),
  })
  /*
   * THE CHOSEN LIST'S FIELDS, not every field of its project: a field scoped to
   * another list is one the task made here will not have, and the server
   * refuses a value for it (`found-30-sep/field-route-takes-another-projects-field`).
   */
  const fields = fieldsOfList(fieldsQuery.data ?? [], targetListId)

  const generate = useMutation({
    mutationFn: () =>
      api<GeneratedTask>('/ai/task/generate', {
        method: 'POST',
        body: {
          prompt,
          workspaceId,
          customFields: fields.map((f) => ({
            name: f.name,
            type: f.type,
            options: Array.isArray(f.options) ? f.options.map((o) => o.label) : undefined,
          })),
        },
      }),
    onError: (err) => toast.error(err instanceof Error ? err.message : t('ai.actionFailed')),
    onSuccess: (data) => {
      setResult({
        title: data.title ?? '',
        description: data.description ?? '',
        priority: (['urgent', 'high', 'normal', 'low'].includes(data.priority)
          ? data.priority
          : 'normal') as TaskPriority,
        subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
        estimatedHours: data.estimatedHours ?? null,
      })
      // Pre-fill editable custom-field values from the AI's suggestions, matched
      // to the project's definitions by name.
      const prefill: Record<string, string> = {}
      for (const cf of data.customFieldValues ?? []) {
        const def = fields.find((f) => f.name === cf.fieldName)
        if (!def) continue
        let v = ''
        if (def.type === 'checkbox') {
          v = cf.value === true || String(cf.value).toLowerCase() === 'true' ? 'true' : 'false'
        } else if (def.type === 'dropdown') {
          const opt = (def.options ?? []).find(
            (o) => o.value === String(cf.value) || o.label.toLowerCase() === String(cf.value).toLowerCase(),
          )
          v = opt?.value ?? ''
        } else {
          v = String(cf.value)
        }
        if (v !== '') prefill[def.id] = v
      }
      setFieldValues(prefill)
      setSaved(false)
      setSaveError(null)
    },
  })

  function updateSubtask(index: number, value: string) {
    setResult((prev) => (prev ? { ...prev, subtasks: prev.subtasks.map((s, i) => (i === index ? value : s)) } : prev))
  }
  function removeSubtask(index: number) {
    setResult((prev) => (prev ? { ...prev, subtasks: prev.subtasks.filter((_, i) => i !== index) } : prev))
  }
  function addSubtask() {
    setResult((prev) => (prev ? { ...prev, subtasks: [...prev.subtasks, ''] } : prev))
  }

  async function saveTask() {
    if (!result) return
    if (!targetListId) {
      setSaveError(t('ai.errorSelectList'))
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const created = await api<{ id: string }>('/tasks', {
        method: 'POST',
        body: {
          listId: targetListId,
          title: result.title.trim() || t('ai.untitledTask'),
          description: result.description.trim() ? result.description : null,
          priority: result.priority,
        },
      })
      // Create each non-empty subtask as a child task (Plan §7.1).
      for (const st of result.subtasks.map((s) => s.trim()).filter(Boolean)) {
        await api('/tasks', {
          method: 'POST',
          body: { listId: targetListId, parentTaskId: created.id, title: st },
        })
      }
      // Set any custom-field values against the chosen project's definitions.
      for (const def of fields) {
        const raw = fieldValues[def.id]
        if (raw == null || raw === '') continue
        await api(`/workspaces/${workspaceId}/tasks/${created.id}/custom-fields/${def.id}`, {
          method: 'PUT',
          body: { value: coerceCustomFieldValue(def.type, raw) },
        })
      }
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('ai.taskCreationFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full">
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold mb-1">{t('ai.generateTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('ai.generateDesc')}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t('ai.destinationList')}</label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={targetListId}
            data-testid="ai-generate-list"
            onChange={(e) => {
              setTargetListId(e.target.value)
              setFieldValues({})
            }}
          >
            <option value="">{t('ai.selectDestinationList')}</option>
            {listOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">{t('ai.generateListHint')}</p>
        </div>

        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('ai.generatePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && prompt.trim()) generate.mutate()
            }}
            className="flex-1"
            data-testid="ai-generate-prompt"
          />
          <Button onClick={() => generate.mutate()} disabled={!prompt.trim() || generate.isPending} data-testid="ai-generate-submit">
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </Button>
        </div>

        {result && (
          <Card className="p-4 space-y-4" data-testid="ai-generate-result">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('ai.editBeforeSave')}</p>
              {result.estimatedHours ? (
                <span className="text-xs text-muted-foreground">~{result.estimatedHours}h</span>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('ai.fieldTitle')}</label>
              <Input value={result.title} onChange={(e) => setResult({ ...result, title: e.target.value })} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('ai.fieldPriority')}</label>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={result.priority}
                onChange={(e) => setResult({ ...result, priority: e.target.value as TaskPriority })}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('ai.fieldDescription')}</label>
              <textarea
                value={result.description}
                onChange={(e) => setResult({ ...result, description: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">{t('ai.subtasks')}</label>
                <Button variant="ghost" size="sm" onClick={addSubtask}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t('ai.addSubtask')}
                </Button>
              </div>
              {result.subtasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('ai.noSubtasks')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {result.subtasks.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Input value={s} onChange={(e) => updateSubtask(i, e.target.value)} className="flex-1 text-sm" />
                      <button
                        type="button"
                        onClick={() => removeSubtask(i)}
                        className="text-muted-foreground hover:text-destructive"
                        title={t('ai.removeSubtask')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {fields.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t('ai.customFields')}</label>
                {fields.map((def) => (
                  <div key={def.id} className="space-y-1" data-testid={`ai-generate-field-${def.id}`}>
                    <div className="text-[11px] text-muted-foreground">
                      {def.name}
                      {def.isRequired && <span className="text-destructive"> *</span>}
                    </div>
                    <GenFieldInput
                      def={def}
                      value={fieldValues[def.id] ?? ''}
                      onChange={(v) => setFieldValues((prev) => ({ ...prev, [def.id]: v }))}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={saveTask} disabled={saving || saved || !targetListId} data-testid="ai-generate-save">
                {saved ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> {t('ai.saved')}
                  </>
                ) : saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> {t('common.saving')}
                  </>
                ) : (
                  t('ai.saveAsTask')
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
                {t('ai.regenerate')}
              </Button>
              {!targetListId && (
                <span className="text-xs text-amber-700 dark:text-amber-300">{t('ai.selectListToEnable')}</span>
              )}
            </div>
            {saveError && <p className="text-xs text-destructive" data-testid="ai-generate-save-error">{saveError}</p>}
          </Card>
        )}
      </div>
    </div>
  )
}

function GenFieldInput({
  def,
  value,
  onChange,
}: {
  def: GenCustomFieldDef
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  if (def.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} />
        {t('ai.enabled')}
      </label>
    )
  }
  if (def.type === 'dropdown') {
    return (
      <select
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t('ai.chooseValue')}</option>
        {(def.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  const inputType =
    def.type === 'number' || def.type === 'money' || def.type === 'rating'
      ? 'number'
      : def.type === 'date'
        ? 'date'
        : def.type === 'email'
          ? 'email'
          : def.type === 'url'
            ? 'url'
            : 'text'
  return <Input type={inputType} value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
}

// ─── Meeting Notes ────────────────────────────────────────────────────────────

type MeetingAttendee = { id: string; name: string | null; email: string | null; user: { id: string } | null }
type MeetingRecord = {
  id: string
  title: string
  startsAt: string | null
  notes: string | null
  recordingUrl: string | null
  provider: string
  attendees: MeetingAttendee[]
}

/**
 * The meeting the notes belong to (§A6.1).
 *
 * Extraction worked before this, but nothing survived it — no record of the
 * call, no attendee list, nowhere the recording lived. The same notes had to be
 * pasted in again next time anyone asked what was decided. Saving is optional:
 * paste-and-extract still works untouched for a conversation nobody needs to
 * keep.
 */
function MeetingRecordPanel({
  workspaceId,
  notes,
  onLoadNotes,
  members,
  onMeetingChange,
}: {
  workspaceId: string
  notes: string
  onLoadNotes: (notes: string) => void
  members: Array<{ userId: string; displayName: string; email: string }>
  /** Lifted so tasks saved from the extracted list can name where they came from. */
  onMeetingChange: (meeting: { id: string; title: string } | null) => void
}) {
  const { t } = useTranslation()
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [recordingUrl, setRecordingUrl] = useState('')
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const meetingsQuery = useQuery({
    queryKey: ['meetings', workspaceId],
    queryFn: () => api<MeetingRecord[]>(`/workspaces/${workspaceId}/meetings`),
  })
  const saved = meetingsQuery.data ?? []
  const current = saved.find((m) => m.id === meetingId) ?? null

  function loadMeeting(m: MeetingRecord | null) {
    setError(null)
    setMeetingId(m?.id ?? null)
    onMeetingChange(m ? { id: m.id, title: m.title } : null)
    setTitle(m?.title ?? '')
    // datetime-local wants the LOCAL wall clock: this took the UTC one, which
    // the save then read as local, so each open-and-save moved the meeting by
    // the reader's offset.
    setStartsAt(m?.startsAt ? localDateTimeValue(new Date(m.startsAt)) : '')
    setRecordingUrl(m?.recordingUrl ?? '')
    setAttendeeIds((m?.attendees ?? []).map((a) => a.user?.id).filter((x): x is string => Boolean(x)))
    if (m) onLoadNotes(m.notes ?? '')
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: title.trim(),
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        notes,
      }
      if (!meetingId) {
        return api<MeetingRecord>(`/workspaces/${workspaceId}/meetings`, {
          method: 'POST',
          body: { ...body, recordingUrl: recordingUrl.trim() || null, attendeeIds },
        })
      }
      /*
       * THE RECORDING ONLY WHEN IT WAS CHANGED. The field is loaded with the
       * link the GET hands out — for a call's own recording, a URL signed for
       * fifteen minutes — and sending it back on every Update wrote that URL
       * over the durable key, so the recording died a quarter of an hour
       * later. The server now keeps the key on that round trip too; this stops
       * sending what nobody touched.
       */
      const recordingChanged = (recordingUrl.trim() || null) !== (current?.recordingUrl ?? null)
      const updated = await api<MeetingRecord>(`/workspaces/${workspaceId}/meetings/${meetingId}`, {
        method: 'PATCH',
        body: recordingChanged ? { ...body, recordingUrl: recordingUrl.trim() || null } : body,
      })
      // Attendees are their own rows, so an edit is a diff rather than a
      // rewrite — removing someone must not also drop what they said.
      const before = new Map(
        (current?.attendees ?? [])
          .filter((a) => a.user?.id)
          .map((a) => [a.user!.id, a.id] as const),
      )
      for (const uid of attendeeIds) {
        if (!before.has(uid)) {
          await api(`/workspaces/${workspaceId}/meetings/${meetingId}/attendees`, {
            method: 'POST',
            body: { userId: uid },
          })
        }
      }
      for (const [uid, rowId] of before) {
        if (!attendeeIds.includes(uid)) {
          await api(`/workspaces/${workspaceId}/meetings/${meetingId}/attendees/${rowId}`, { method: 'DELETE' })
        }
      }
      return updated
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('ai.actionFailed')),
    onSuccess: async (m) => {
      setError(null)
      setMeetingId(m.id)
      onMeetingChange({ id: m.id, title: m.title })
      await meetingsQuery.refetch()
      toast.success(t('ai.meetingSaved'))
    },
  })

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('ai.meetingRecord')}
        </p>
        {meetingId && (
          <button
            type="button"
            className="text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => loadMeeting(null)}
          >
            {t('ai.meetingNew')}
          </button>
        )}
      </div>

      {saved.length > 0 && (
        <label className="block text-[12px] text-muted-foreground">
          {t('ai.meetingOpenSaved')}
          <select
            value={meetingId ?? ''}
            onChange={(e) => loadMeeting(saved.find((m) => m.id === e.target.value) ?? null)}
            className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">{t('ai.meetingUnsaved')}</option>
            {saved.map((m) => (
              <option key={m.id} value={m.id}>
                {m.startsAt ? `${new Date(m.startsAt).toLocaleDateString()} · ` : ''}
                {m.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[12px] text-muted-foreground">
          {t('ai.meetingTitle')}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('ai.meetingTitlePlaceholder')}
            className="mt-0.5 h-8 text-sm"
          />
        </label>
        <label className="block text-[12px] text-muted-foreground">
          {t('ai.meetingWhen')}
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-sm text-foreground"
          />
        </label>
      </div>

      <label className="block text-[12px] text-muted-foreground">
        {t('ai.meetingRecording')}
        <Input
          value={recordingUrl}
          onChange={(e) => setRecordingUrl(e.target.value)}
          placeholder="https://…"
          className="mt-0.5 h-8 text-sm"
        />
      </label>

      <div>
        <p className="text-[12px] text-muted-foreground mb-1">{t('ai.meetingAttendees')}</p>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = attendeeIds.includes(m.userId)
            return (
              <button
                key={m.userId}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setAttendeeIds((prev) =>
                    prev.includes(m.userId) ? prev.filter((x) => x !== m.userId) : [...prev, m.userId],
                  )
                }
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[12px] transition-colors',
                  on
                    ? 'border-accent bg-accent/15 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {m.displayName || m.email}
              </button>
            )
          })}
          {members.length === 0 && (
            <span className="text-[12px] text-muted-foreground">{t('ai.meetingNoMembers')}</span>
          )}
        </div>
      </div>

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!title.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> {t('common.saving')}</>
          ) : meetingId ? (
            t('ai.meetingUpdate')
          ) : (
            t('ai.meetingSave')
          )}
        </Button>
        {current?.recordingUrl && (
          <a
            href={current.recordingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-accent hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" /> {t('ai.meetingOpenRecording')}
          </a>
        )}
      </div>

      {/* Said plainly, because the alternative is a user waiting for a
          transcript that is never coming. */}
      <p className="text-[11px] text-muted-foreground">{t('ai.meetingNoTranscription')}</p>
    </Card>
  )
}

function MeetingNotesTab({ workspaceId }: { workspaceId: string }) {
  const { t, tCount } = useTranslation()
  const [notes, setNotes] = useState('')
  const [tasks, setTasks] = useState<ExtractedTask[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [targetListId, setTargetListId] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [failedItems, setFailedItems] = useState<Array<{ title: string; reason: string }>>([])
  // Set once the notes belong to a saved meeting, so every task made from them
  // says which call it came out of.
  const [meetingOrigin, setMeetingOrigin] = useState<{ id: string; title: string } | null>(null)
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<number, string>>({})
  const [bulkAssigneeOverride, setBulkAssigneeOverride] = useState('')
  const [dueDateOverrides, setDueDateOverrides] = useState<Record<number, string>>({})
  const [bulkDueDateOverride, setBulkDueDateOverride] = useState('')
  const [priorityOverrides, setPriorityOverrides] = useState<Record<number, TaskPriority>>({})
  const [bulkPriorityOverride, setBulkPriorityOverride] = useState<TaskPriority>('normal')
  const storageKeyBase = `ai-meeting-notes-defaults:${workspaceId}`
  const [defaultsHydrated, setDefaultsHydrated] = useState(false)
  const membersQuery = useQuery({
    queryKey: ['ai-meeting-notes-members', workspaceId],
    queryFn: () =>
      api<Array<{ userId: string; displayName: string; email: string }>>(
        `/workspaces/${workspaceId}/members`,
      ),
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedListId = window.localStorage.getItem(`${storageKeyBase}:target-list-id`) ?? ''
    const savedBulkAssignee = window.localStorage.getItem(`${storageKeyBase}:bulk-assignee-id`) ?? ''
    const savedBulkDueDate = window.localStorage.getItem(`${storageKeyBase}:bulk-due-date`) ?? ''
    const savedBulkPriority = window.localStorage.getItem(`${storageKeyBase}:bulk-priority`) as TaskPriority | null
    if (savedListId) setTargetListId(savedListId)
    if (savedBulkAssignee) setBulkAssigneeOverride(savedBulkAssignee)
    if (savedBulkDueDate) setBulkDueDateOverride(savedBulkDueDate)
    if (savedBulkPriority === 'urgent' || savedBulkPriority === 'high' || savedBulkPriority === 'normal' || savedBulkPriority === 'low') {
      setBulkPriorityOverride(savedBulkPriority)
    }
    setDefaultsHydrated(true)
  }, [storageKeyBase])
  useEffect(() => {
    if (typeof window === 'undefined' || !defaultsHydrated) return
    if (targetListId) window.localStorage.setItem(`${storageKeyBase}:target-list-id`, targetListId)
    else window.localStorage.removeItem(`${storageKeyBase}:target-list-id`)
  }, [storageKeyBase, targetListId, defaultsHydrated])
  useEffect(() => {
    if (typeof window === 'undefined' || !defaultsHydrated) return
    if (bulkAssigneeOverride) window.localStorage.setItem(`${storageKeyBase}:bulk-assignee-id`, bulkAssigneeOverride)
    else window.localStorage.removeItem(`${storageKeyBase}:bulk-assignee-id`)
  }, [storageKeyBase, bulkAssigneeOverride, defaultsHydrated])
  useEffect(() => {
    if (typeof window === 'undefined' || !defaultsHydrated) return
    if (bulkDueDateOverride) window.localStorage.setItem(`${storageKeyBase}:bulk-due-date`, bulkDueDateOverride)
    else window.localStorage.removeItem(`${storageKeyBase}:bulk-due-date`)
  }, [storageKeyBase, bulkDueDateOverride, defaultsHydrated])
  useEffect(() => {
    if (typeof window === 'undefined' || !defaultsHydrated) return
    window.localStorage.setItem(`${storageKeyBase}:bulk-priority`, bulkPriorityOverride)
  }, [storageKeyBase, bulkPriorityOverride, defaultsHydrated])
  const normalizeAssignee = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
  const resolveAssignee = (name?: string | null): { userId: string; displayName: string } | undefined => {
    if (!name?.trim()) return undefined
    const needle = normalizeAssignee(name)
    const members = membersQuery.data ?? []
    const exact = members.find(
      (member) =>
        normalizeAssignee(member.displayName) === needle ||
        normalizeAssignee(member.email.split('@')[0] ?? '') === needle,
    )
    if (exact) return { userId: exact.userId, displayName: exact.displayName || exact.email }
    const partial = members.filter(
      (member) =>
        normalizeAssignee(member.displayName).includes(needle) ||
        needle.includes(normalizeAssignee(member.displayName)),
    )
    if (partial.length === 1) {
      return { userId: partial[0].userId, displayName: partial[0].displayName || partial[0].email }
    }
    return undefined
  }

  const listOptionsQuery = useQuery({
    queryKey: ['ai-meeting-notes-lists', workspaceId],
    queryFn: async () => {
      const spaces = await api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`)
      const projectsPerSpace = await Promise.all(
        spaces.map(async (space) => ({
          space,
          projects: await api<Array<{ id: string; name: string }>>(`/projects/space/${space.id}`),
        })),
      )
      const options: Array<{ value: string; label: string }> = []
      for (const group of projectsPerSpace) {
        const listsPerProject = await Promise.all(
          group.projects.map(async (project) => ({
            project,
            lists: await api<Array<{ id: string; name: string }>>(`/lists/project/${project.id}`),
          })),
        )
        for (const projectGroup of listsPerProject) {
          for (const list of projectGroup.lists) {
            options.push({
              value: list.id,
              label: `${group.space.name} / ${projectGroup.project.name} / ${list.name}`,
            })
          }
        }
      }
      return options
    },
  })

  const extract = useMutation({
    mutationFn: () => api<ExtractedTask[]>('/ai/meeting-notes', { method: 'POST', body: { notes } }),
    onError: (err) => toast.error(err instanceof Error ? err.message : t('ai.actionFailed')),
    onSuccess: (data) => {
      setTasks(data)
      setSelected(new Set(data.map((_, i) => i)))
      setSavedCount(0)
      setFailedItems([])
      setSaveError(null)
      setAssigneeOverrides({})
      setBulkAssigneeOverride('')
      setDueDateOverrides({})
      setBulkDueDateOverride('')
      setPriorityOverrides({})
    },
  })

  async function saveSelectedTasks() {
    if (!tasks || selected.size === 0) return
    if (!targetListId) {
      setSaveError(t('ai.errorSelectList'))
      return
    }
    setSaving(true)
    setSaveError(null)
    setFailedItems([])
    try {
      const selectedIndexes = [...selected]
      let successCount = 0
      const failures: Array<{ title: string; reason: string }> = []
      const failedIndexes = new Set<number>()
      for (const idx of selectedIndexes) {
        const task = tasks[idx]
        if (!task) continue
        try {
          const assigneeId = assigneeOverrides[idx] || resolveAssignee(task.assigneeName)?.userId
          const dueDate = dueDateOverrides[idx] || task.dueDate || null
          const priority = priorityOverrides[idx] ?? (task.priority as TaskPriority)
          // Appended, not substituted: an item the AI described would otherwise
          // lose the only pointer back to the meeting it came out of.
          const origin = meetingOrigin ? t('ai.meetingFrom', { title: meetingOrigin.title }) : ''
          const description = [task.description?.trim() || '', origin].filter(Boolean).join('\n\n') || null
          await api('/tasks', {
            method: 'POST',
            body: {
              listId: targetListId,
              title: task.title,
              description,
              priority,
              dueDate,
              assigneeIds: assigneeId ? [assigneeId] : undefined,
            },
          })
          successCount += 1
        } catch (error) {
          failedIndexes.add(idx)
          failures.push({
            title: task.title,
            reason: error instanceof Error ? error.message : t('ai.taskCreationFailed'),
          })
        }
      }
      if (failures.length > 0) {
        setFailedItems(failures)
        setSaveError(tCount('ai.tasksFailed', failures.length))
      }
      setSavedCount(successCount)
      setSelected(failedIndexes)
    } finally {
      setSaving(false)
    }
  }

  const selectedIndexes = [...selected]
  const selectedTasks = selectedIndexes.map((idx) => (tasks ? tasks[idx] : undefined)).filter(Boolean)
  const previewSummary = selectedTasks.reduce(
    (acc, task, index) => {
      const originalIndex = selectedIndexes[index]
      const hasManualAssignee = Boolean(assigneeOverrides[originalIndex])
      const hasAutoAssignee = !hasManualAssignee && Boolean(resolveAssignee(task?.assigneeName)?.userId)
      if (hasManualAssignee) acc.manualAssignee += 1
      else if (hasAutoAssignee) acc.autoAssignee += 1
      else acc.unassigned += 1

      if (dueDateOverrides[originalIndex]) acc.dueOverride += 1
      if (priorityOverrides[originalIndex]) acc.priorityOverride += 1
      return acc
    },
    {
      manualAssignee: 0,
      autoAssignee: 0,
      unassigned: 0,
      dueOverride: 0,
      priorityOverride: 0,
    },
  )

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full space-y-4">
      <div>
        <h2 className="font-semibold mb-1">{t('ai.notesTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('ai.notesDesc')}
        </p>
      </div>

      <MeetingRecordPanel
        workspaceId={workspaceId}
        notes={notes}
        onLoadNotes={(loaded) => {
          setNotes(loaded)
          // The extracted list belonged to the previous meeting; leaving it on
          // screen under a new title is how the wrong tasks get created.
          setTasks(null)
          setSelected(new Set())
          setSavedCount(0)
        }}
        members={membersQuery.data ?? []}
        onMeetingChange={setMeetingOrigin}
      />

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('ai.notesPlaceholder')}
        rows={8}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <Button
        onClick={() => extract.mutate()}
        disabled={!notes.trim() || extract.isPending}
      >
        {extract.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t('ai.extracting')}</>
        ) : (
          <><Wand2 className="h-4 w-4 mr-1.5" /> {t('ai.extractActionItems')}</>
        )}
      </Button>

      {tasks && tasks.length === 0 && (
        <Card className="p-4 text-center text-muted-foreground text-sm">
          {t('ai.noActionItems')}
        </Card>
      )}

      {tasks && tasks.length > 0 && (
        <div className="space-y-3">
          {selected.size > 0 && (
            <div className="space-y-3">
              <Card className="p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {t('ai.savePreview')}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p>{t('ai.previewSelected')} <span className="font-medium text-foreground">{selected.size}</span></p>
                  <p>{t('ai.previewManualAssignee')} <span className="font-medium text-foreground">{previewSummary.manualAssignee}</span></p>
                  <p>{t('ai.previewAutoAssignee')} <span className="font-medium text-foreground">{previewSummary.autoAssignee}</span></p>
                  <p>{t('ai.previewUnassigned')} <span className="font-medium text-foreground">{previewSummary.unassigned}</span></p>
                  <p>{t('ai.previewDueOverrides')} <span className="font-medium text-foreground">{previewSummary.dueOverride}</span></p>
                  <p>{t('ai.previewPriorityOverrides')} <span className="font-medium text-foreground">{previewSummary.priorityOverride}</span></p>
                </div>
              </Card>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('ai.bulkAssignee')}</p>
                <div className="flex items-center gap-2">
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={bulkAssigneeOverride}
                    onChange={(e) => setBulkAssigneeOverride(e.target.value)}
                  >
                    <option value="">{t('ai.chooseMember')}</option>
                    {(membersQuery.data ?? []).map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName || member.email}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!bulkAssigneeOverride}
                    onClick={() => {
                      if (!bulkAssigneeOverride) return
                      setAssigneeOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) {
                          next[idx] = bulkAssigneeOverride
                        }
                        return next
                      })
                    }}
                  >
                    {t('ai.apply')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAssigneeOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) {
                          delete next[idx]
                        }
                        return next
                      })
                    }}
                  >
                    {t('ai.clear')}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('ai.bulkDueDate')}</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={bulkDueDateOverride}
                    onChange={(e) => setBulkDueDateOverride(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!bulkDueDateOverride}
                    onClick={() => {
                      if (!bulkDueDateOverride) return
                      setDueDateOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) {
                          next[idx] = bulkDueDateOverride
                        }
                        return next
                      })
                    }}
                  >
                    {t('ai.apply')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDueDateOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) {
                          delete next[idx]
                        }
                        return next
                      })
                    }}
                  >
                    {t('ai.clear')}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('ai.bulkPriority')}</p>
                <div className="flex items-center gap-2">
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={bulkPriorityOverride}
                    onChange={(e) => setBulkPriorityOverride(e.target.value as TaskPriority)}
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPriorityOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) next[idx] = bulkPriorityOverride
                        return next
                      })
                    }
                  >
                    {t('ai.apply')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPriorityOverrides((prev) => {
                        const next = { ...prev }
                        for (const idx of selected) delete next[idx]
                        return next
                      })
                    }
                  >
                    {t('ai.clear')}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('ai.destinationList')}</p>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
              >
                <option value="">{t('ai.selectDestinationList')}</option>
                {(listOptionsQuery.data ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {t('ai.destinationRemembered')}
              </p>
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTargetListId('')
                    setBulkAssigneeOverride('')
                    setBulkDueDateOverride('')
                    setBulkPriorityOverride('normal')
                    if (typeof window !== 'undefined') {
                      window.localStorage.removeItem(`${storageKeyBase}:target-list-id`)
                      window.localStorage.removeItem(`${storageKeyBase}:bulk-assignee-id`)
                      window.localStorage.removeItem(`${storageKeyBase}:bulk-due-date`)
                      window.localStorage.removeItem(`${storageKeyBase}:bulk-priority`)
                    }
                  }}
                >
                  {t('ai.resetDefaults')}
                </Button>
              </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{tCount('ai.actionItemsFound', tasks.length)}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                selected.size === tasks.length
                  ? setSelected(new Set())
                  : setSelected(new Set(tasks.map((_, i) => i)))
              }
            >
              {selected.size === tasks.length ? t('ai.deselectAll') : t('ai.selectAll')}
            </Button>
          </div>
          {tasks.map((task, i) => (
            <Card
              key={i}
              className={cn('p-3 cursor-pointer', selected.has(i) && 'border-brand-500 bg-brand-200/10')}
              onClick={() => {
                const next = new Set(selected)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                setSelected(next)
              }}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  readOnly
                  className="mt-0.5 rounded"
                />
                <div className="flex-1">
                  <p className="font-medium text-sm">{task.title}</p>
                  {task.assigneeName && (
                    <p className="text-xs text-muted-foreground">
                      {t('ai.assignedTo')} {task.assigneeName}
                      {resolveAssignee(task.assigneeName) ? (
                        <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                          → {resolveAssignee(task.assigneeName)?.displayName}
                        </span>
                      ) : (
                        <span className="ml-1 text-amber-700 dark:text-amber-300">
                          {t('ai.unmatched')}
                        </span>
                      )}
                    </p>
                  )}
                  <div className="mt-1">
                    <label className="text-[11px] text-muted-foreground block mb-1">{t('ai.assigneeOverride')}</label>
                    <select
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                      value={assigneeOverrides[i] ?? ''}
                      onChange={(e) =>
                        setAssigneeOverrides((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                    >
                      <option value="">{t('ai.autoUseExtracted')}</option>
                      {(membersQuery.data ?? []).map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.displayName || member.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-1">
                    <label className="text-[11px] text-muted-foreground block mb-1">{t('ai.dueDateOverride')}</label>
                    <Input
                      type="date"
                      value={dueDateOverrides[i] ?? ''}
                      onChange={(e) =>
                        setDueDateOverrides((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-[11px] text-muted-foreground block mb-1">{t('ai.priorityOverride')}</label>
                    <select
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                      value={priorityOverrides[i] ?? ''}
                      onChange={(e) =>
                        setPriorityOverrides((prev) => ({
                          ...prev,
                          [i]: e.target.value as TaskPriority,
                        }))
                      }
                    >
                      <option value="">{t('ai.autoPriority', { priority: t(priorityLabelKey(task.priority)) })}</option>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  {task.dueDate && (
                    <p className="text-xs text-muted-foreground">{t('ai.due', { date: task.dueDate })}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full shrink-0',
                    task.priority === 'urgent' && 'bg-red-100 text-red-700',
                    task.priority === 'high' && 'bg-orange-100 text-orange-700',
                    task.priority === 'normal' && 'bg-blue-100 text-blue-700',
                    task.priority === 'low' && 'bg-gray-100 text-gray-700',
                  )}
                >
                  {t(priorityLabelKey(task.priority))}
                </span>
              </div>
            </Card>
          ))}
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button onClick={saveSelectedTasks} disabled={saving || !targetListId}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t('common.saving')}</>
                ) : (
                  tCount('ai.saveTasks', selected.size)
                )}
              </Button>
              {!targetListId && (
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  {t('ai.selectListToEnable')}
                </span>
              )}
              {savedCount > 0 && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  {tCount('ai.savedTasks', savedCount)}
                </span>
              )}
            </div>
          )}
          {saveError && (
            <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
              {saveError}
            </Card>
          )}
          {failedItems.length > 0 && (
            <Card className="p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('ai.failedItems')}</p>
              {failedItems.map((item, idx) => (
                <p key={`${item.title}-${idx}`} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{item.title}</span>: {item.reason}
                </p>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Writing Assistant ────────────────────────────────────────────────────────

function WritingTab() {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'improve' | 'shorten' | 'expand' | 'format'>('improve')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)

  const improve = useMutation({
    mutationFn: () => api<{ improved: string }>('/ai/writing/improve', { method: 'POST', body: { text, mode } }),
    onSuccess: (data) => setResult(data.improved),
    onError: (err) => toast.error(err instanceof Error ? err.message : t('ai.actionFailed')),
  })

  function copy() {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full space-y-4">
      <div>
        <h2 className="font-semibold mb-1">{t('ai.writingTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('ai.writingDesc')}
        </p>
      </div>

      <div className="flex gap-2">
        {WRITING_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium border transition-colors',
              mode === m.id
                ? 'bg-brand-700 text-white border-brand-700'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {t(m.labelKey)}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('ai.writingPlaceholder')}
        rows={6}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <Button
        onClick={() => improve.mutate()}
        disabled={!text.trim() || improve.isPending}
      >
        {improve.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t('ai.processing')}</>
        ) : (
          <><Wand2 className="h-4 w-4 mr-1.5" /> {t(writingModeLabelKey(mode))}</>
        )}
      </Button>

      {result && (
        <Card className="p-4 relative">
          <p className="text-sm whitespace-pre-wrap">{result}</p>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> {t('ai.copied')}</>
              ) : (
                <><Copy className="h-3.5 w-3.5 mr-1" /> {t('ai.copy')}</>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setText(result); setResult('') }}>
              {t('ai.useThisText')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
