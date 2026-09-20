import { Fragment, useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, cn, toast } from '@rundesk/ui'
import {
  Sparkles,
  Send,
  X,
  Loader2,
  Bot,
  User,
  Clipboard,
  CheckCircle2,
  Wand2,
  Gem,
  CheckSquare,
  FileOutput,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Star,
  Ban,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { useSpeechRecognition, MicButton } from '../lib/use-speech-recognition'
import { useAiChatActions, useAiChatThread, useAiMessageActions } from '../lib/skills-api'

/**
 * §V2-S18 frame `[17:16]` — what `GET /ai/models` answers with.
 *
 * TWO LISTS WITH DIFFERENT SHAPES, ON PURPOSE. A `ModelTier` carries the tier
 * id the composer sends; an `UnavailableModel` has no such field, so there is
 * nothing for a later refactor to accidentally put in the request body. The
 * frame offers ChatGPT and Gemini; `apps/api` has no OpenAI or Google client,
 * and a pickable row that quietly answers from Claude is the facade this audit
 * exists to catch.
 */
type ModelTier = {
  id: string
  label: string
  hint: string
  provider: string
  group: string
  /** 1–5, the frame's hover-card bars. Relative to each other, not absolute. */
  speed: number
  intelligence: number
}

type UnavailableModel = {
  id: string
  label: string
  provider: string
  /** A translation key, so the reason is readable in all four locales. */
  reasonKey: string
}

type ModelCatalog = { models: ModelTier[]; unavailable: UnavailableModel[] }

/** §V2-S18 `[17:32]` — the preferred AI, stored per person per workspace. */
type ModelPreference = { preferredTier: string; isSet: boolean; updatedAt: string | null }

type Message = {
  role: 'user' | 'assistant'
  content: string
  id: string
  /** §15 — a vote already cast, restored when a thread is reopened. */
  feedback?: 'up' | 'down' | null
  /**
   * G13-10 — what the server said it read to produce this answer.
   *
   * Kept ON THE MESSAGE rather than only in transient state. A first version
   * rendered the trace while `isStreaming` was true and dropped it the moment
   * the answer landed, which meant a fast turn showed nothing at all — and the
   * fast turns are exactly the ones where you would want to check whether it
   * really looked at your workspace or just answered from the question.
   */
  steps?: string[]
  /**
   * G13-9 [18:42] — next steps generated from THIS answer.
   *
   * On the message rather than in panel state, so scrolling back to an earlier
   * answer still offers the path it suggested — which is the point of a guided
   * flow, as opposed to a menu that only exists for the newest reply.
   */
  followUps?: string[]
}

type AiPanelProps = {
  workspaceId: string
  /** Optional hint about where the user is (e.g. "list Backlog", "dashboard"),
   * forwarded so the server grounds answers to the current view (Plan §7.15). */
  currentView?: string
  /** §A6.4 — a question handed in from elsewhere (the palette's Ask AI row, an
   * `/ai?prompt=` link). `id` separates two identical asks so the second one is
   * still sent instead of being read as a re-render of the first. */
  ask?: { text: string; id: number }
  /** Fired once the `ask` has been sent, so the caller can drop it and a later
   * re-mount of the panel does not replay a stale question. */
  onAskHandled?: () => void
  onClose?: () => void
  className?: string
  /** §15 — answer as this skill. The server enforces that the caller can see
   * it and that it is enabled; this only says which one to ask for. */
  skillId?: string
  /** Shown on the composer chip, from frame `296_1817`. Display only. */
  skillName?: string
  /**
   * §15 — the thread this panel is showing. When set the conversation is
   * loaded from it and every turn is written back, so closing the panel no
   * longer discards what was said (frames `296_1817` → `304_1907`).
   */
  threadId?: string | null
  /**
   * §G13-8 — keep what is said here.
   *
   * When no `threadId` is supplied and this is set, the panel mints one on the
   * FIRST message. The dock had neither, so its conversations vanished on close
   * and every per-message action stayed greyed out. Off by default: a caller
   * that wants a scratch conversation should get one.
   */
  persist?: boolean
  /** Fired when a thread names itself, so the sidebar can show the new title. */
  onThreadTitled?: (title: string) => void
}

// Stable catalog-key identifiers; the localized text is both shown and sent
// as the chat message when a suggestion is clicked.
/**
 * G13-10 — the trace, wherever it is shown.
 *
 * One component for the live case and the finished one, so the two cannot
 * drift into showing different things about the same turn.
 */
function AiTrace({ steps, t }: { steps: string[]; t: (k: TranslationKey) => string }) {
  if (steps.length === 0) return null
  return (
    <div className="flex items-start gap-2" data-testid="ai-trace">
      <div className="h-6 w-6 shrink-0" />
      <div className="space-y-0.5">
        {steps.map((s, i) => (
          <div
            key={`${s}-${i}`}
            data-testid={`ai-trace-step-${s}`}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <Check className="h-3 w-3 shrink-0 opacity-60" />
            {t(AI_STEP_LABEL[s] ?? 'aiPanel.stepWorking')}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * G13-10 — the server's step names, mapped to something a person reads.
 *
 * The wire carries short stable keys (`workspace`, `skill`, `writing`) rather
 * than prose, so the API is not a translation table and an unknown step from a
 * newer server still renders as something honest instead of vanishing.
 */
const AI_STEP_LABEL: Record<string, TranslationKey> = {
  workspace: 'aiPanel.stepWorkspace',
  skill: 'aiPanel.stepSkill',
  writing: 'aiPanel.stepWriting',
}

const SUGGESTED_PROMPT_KEYS = [
  'aiPanel.suggestion.dueThisWeek',
  'aiPanel.suggestion.summarizeProjects',
  'aiPanel.suggestion.writeDescription',
  'aiPanel.suggestion.createTasks',
  'aiPanel.suggestion.whatsBlocking',
] as const

export function AiPanel({
  workspaceId,
  currentView,
  ask,
  onAskHandled,
  onClose,
  className,
  skillId,
  skillName,
  threadId = null,
  persist = false,
  onThreadTitled,
}: AiPanelProps) {
  const { t, locale } = useTranslation()
  const qc = useQueryClient()
  const [messages, setMessages] = useState<Message[]>([])
  const chat = useAiChatActions(workspaceId)
  /*
   * §G13-8 — a thread the panel minted for itself.
   *
   * The /ai page owns a thread and hands it down; the DOCK was rendered with
   * none, so every conversation held in it vanished on close and all four
   * per-message actions — create task, save to doc, regenerate, thumbs — were
   * `disabled={!threadId}` permanently. The dock is the surface most people
   * use, so the actions were greyed out for most people all the time.
   *
   * Minted on the first message rather than on open, and that ordering is the
   * whole design: creating on open would file an empty thread in the sidebar
   * every time somebody pressed the assistant icon and thought better of it.
   */
  const [ownThreadId, setOwnThreadId] = useState<string | null>(null)
  const activeThreadId = threadId ?? ownThreadId
  const threadQuery = useAiChatThread(workspaceId, activeThreadId)
  // Which thread the on-screen messages belong to, so switching threads
  // replaces the conversation instead of appending to it.
  const loadedThreadRef = useRef<string | null>(null)
  const [input, setInput] = useState('')
  /*
   * §15 / §V2-S18 — her composer's "Max ▴", frames `296_1817` / `301_1836` and
   * the one this row is about, `[17:16]`.
   *
   * THE DEFECT THIS REPLACES. The tier lived in `localStorage` under
   * `rundesk.aiTier` and nowhere else. `[17:32]` calls it *setting your
   * preferred AI*, and a preference that does not survive a second browser is
   * not a preference, it is a habit this one browser happens to remember. It
   * is a row now (`ai_model_preferences`, migration 0150) and `localStorage` is
   * gone rather than kept as a mirror — two sources of truth for one setting is
   * how they drift.
   *
   * `null` until the server answers, so the picker cannot flash the default and
   * then jump to what you actually chose.
   */
  const [tier, setTier] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** The frame's "Show more" disclosure, closed on arrival as it is there. */
  const [showMoreModels, setShowMoreModels] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  /*
   * G13-10 [18:33–18:36] — what the server says it is reading, as it reads it.
   *
   * Transient by design: this is process, not content. Once the answer is on
   * screen the steps have done their job, and keeping them would turn every
   * past turn into a pile of scaffolding.
   */
  const [steps, setSteps] = useState<string[]>([])
  const [streamBuffer, setStreamBuffer] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  /** The picker's root, so an outside click can be told from an inside one. */
  const pickerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Voice dictation for the chat composer (Plan §15.2) — a final transcript is
  // appended to the input; the user reviews it, then sends as usual.
  const voice = useSpeechRecognition({
    locale,
    onResult: (transcript) =>
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript)),
  })

  /*
   * The tiers come from the server so the labels and the models they resolve
   * to have one home — and, since §V2-S18, so do the providers it CANNOT
   * reach. Two lists, because they are two different things: `models` route,
   * `unavailable` are named in frame `[17:16]` and have no client in this
   * product. Rendering the second as pickable would be the facade.
   */
  const { data: modelCatalog } = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => api<ModelCatalog>('/ai/models'),
    staleTime: Infinity,
    retry: false,
  })
  const modelTiers = modelCatalog?.models ?? []
  const unavailableModels = modelCatalog?.unavailable ?? []

  /** §V2-S18 `[17:32]` — the preferred AI, read from the server, not the browser. */
  const preferenceQuery = useQuery({
    queryKey: ['ai-model-preference', workspaceId],
    queryFn: () => api<ModelPreference>(`/ai/preferences?workspaceId=${workspaceId}`),
    retry: false,
  })
  const preferredTier = preferenceQuery.data?.isSet ? preferenceQuery.data.preferredTier : null

  /*
   * Adopt the stored preference ONCE, and only while nothing has been chosen
   * in this session. Keying the effect on the query data instead would undo
   * somebody's in-session choice on the next refetch — the model silently
   * changing back under them mid-conversation.
   */
  useEffect(() => {
    if (tier !== null) return
    if (preferenceQuery.isPending) return
    setTier(preferenceQuery.data?.preferredTier ?? 'deep')
  }, [tier, preferenceQuery.isPending, preferenceQuery.data?.preferredTier])

  const savePreference = useMutation({
    mutationFn: (preferred: string) =>
      api<ModelPreference>(`/ai/preferences?workspaceId=${workspaceId}`, {
        method: 'PUT',
        body: JSON.stringify({ preferredTier: preferred }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['ai-model-preference', workspaceId] })
      toast.success(t('aiModels.preferredSaved'))
    },
    onError: () => toast.error(t('aiModels.preferredFailed')),
  })

  /*
   * Close the picker on an outside click. Without it the popover sits over the
   * composer and swallows the first click anywhere else on the panel, which
   * reads as the panel being frozen.
   */
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  const statusQuery = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ available: boolean }>('/ai/status'),
    retry: false,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamBuffer])

  /**
   * Load a thread's history when it changes.
   *
   * Keyed on the thread id rather than the query data: the query refetches, and
   * re-seeding on every settle would wipe a turn that is still streaming.
   */
  useEffect(() => {
    if (!threadId) {
      if (loadedThreadRef.current !== null) {
        loadedThreadRef.current = null
        setMessages([])
      }
      return
    }
    if (loadedThreadRef.current === threadId) return
    const loaded = threadQuery.data
    if (!loaded || loaded.id !== threadId) return
    loadedThreadRef.current = threadId
    setMessages(
      loaded.messages.map((m) => ({
        role: m.role,
        content: m.content,
        id: m.id,
        feedback: m.feedback ?? null,
      })),
    )
  }, [threadId, threadQuery.data])

  /**
   * §15 — the loop icon. Drops the last answer and asks the same question
   * again, rather than appending a second answer below the first: the point is
   * to replace one you did not like, and leaving both makes the panel a log of
   * attempts.
   */
  function regenerate() {
    if (isStreaming) return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    setMessages((prev) => {
      const cut = [...prev]
      while (cut.length > 0 && cut[cut.length - 1].role === 'assistant') cut.pop()
      return cut
    })
    void sendMessage(lastUser.content, { skipEcho: true })
  }

  async function sendMessage(content: string, opts: { skipEcho?: boolean } = {}) {
    if (!content.trim() || isStreaming) return
    setInput('')

    const userMsg: Message = { role: 'user', content, id: Date.now().toString() }
    // A regenerate re-uses the question already on screen, so echoing it again
    // would show it twice.
    if (!opts.skipEcho) setMessages((prev) => [...prev, userMsg])
    // Written alongside, not awaited: the message is already on screen, and
    // blocking the answer on a write nobody is waiting for would make the
    // assistant feel slower than it is. A failed write loses one turn of
    // history, never the reply.
    /*
     * Awaited, unlike the append below it: the id it returns is what every
     * later write and every per-message action hangs off, so racing past it
     * would drop the first turn of a conversation on the floor and leave the
     * action row disabled until the second.
     */
    let writeTo = activeThreadId
    if (!writeTo && persist) {
      writeTo = await chat
        .create(skillId)
        .then((thread) => thread.id)
        .catch(() => null)
      if (writeTo) setOwnThreadId(writeTo)
    }
    if (writeTo && !opts.skipEcho) void chat.append(writeTo, 'user', content).catch(() => {})
    setIsStreaming(true)
    setStreamBuffer('')
    setSteps([])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = useAuthStore.getState().accessToken
      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          // Send the real workspaceId so the server builds a grounded context
          // via buildWorkspaceContext (Plan §7.6), plus the current-view hint.
          workspaceId,
          currentView,
          // §15 — omitted entirely when absent, so a normal chat turn is
          // byte-identical to what it was before skills existed.
          ...(skillId ? { skillId } : {}),
          // Omitted rather than sent as null while the stored preference is
          // still in flight: the server falls back to DEFAULT_TIER, which is
          // the same answer, and a null in the body would read as a choice.
          ...(tier ? { tier } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        // A refused skill comes back as JSON with a reason ("This skill is
        // disabled", "Skill not found"). Swallowing it and saying "Stream
        // request failed" would hide the one thing the person can act on.
        const reason = await response
          .clone()
          .json()
          .then((body: { error?: string }) => body?.error)
          .catch(() => undefined)
        throw new Error(reason || 'Stream request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      // A local alongside the state: setSteps is async, and the message is
      // finalized in this same tick, so reading the state here would attach
      // whatever it held one render ago.
      const collectedSteps: string[] = []
      let collectedFollowUps: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              // G13-10 — the retrieval trace, ahead of any text.
              if (parsed.step) {
                collectedSteps.push(String(parsed.step))
                setSteps((prev) => [...prev, String(parsed.step)])
              }
              // G13-9 — one frame, at the end, after the marker was stripped
              // server-side. Nothing here has to know the marker exists.
              if (Array.isArray(parsed.followUps)) {
                collectedFollowUps = parsed.followUps.map((f: unknown) => String(f))
              }
              if (parsed.delta) {
                accumulated += parsed.delta
                setStreamBuffer(accumulated)
              }
            } catch {
              // Ignore malformed stream frames and continue.
            }
          }
        }
      }

      // Finalize
      const assistantMsg: Message = {
        role: 'assistant',
        content: accumulated,
        id: Date.now().toString(),
        steps: collectedSteps.length ? collectedSteps : undefined,
        followUps: collectedFollowUps.length ? collectedFollowUps : undefined,
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamBuffer('')
      if (writeTo && accumulated.trim()) {
        void chat
          .append(writeTo, 'assistant', accumulated)
          // This is the turn that can trigger the rename, per `shouldAutoTitle`.
          .then((r) => { if (r?.title) onThreadTitled?.(r.title) })
          .catch(() => {})
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: t('aiPanel.errorMessage'),
            id: Date.now().toString(),
          },
        ])
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  // §A6.4 — a handed-in question is sent as if the user had typed it. The ref
  // holds the ask already dispatched, so re-renders (or a panel that stays
  // mounted while the user navigates) never replay it.
  const sentAskRef = useRef<number | null>(null)
  useEffect(() => {
    if (!ask || sentAskRef.current === ask.id || !ask.text.trim()) return
    sentAskRef.current = ask.id
    void sendMessage(ask.text)
    onAskHandled?.()
    // sendMessage is re-created every render; the ref above is the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask?.id, ask?.text])

  function stopStreaming() {
    abortRef.current?.abort()
    setIsStreaming(false)
    if (streamBuffer) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: streamBuffer, id: Date.now().toString() },
      ])
      setStreamBuffer('')
    }
  }

  const aiAvailable = statusQuery.data?.available !== false

  return (
    <div className={cn('flex flex-col h-full bg-card', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Rundesk AI</p>
          <p className="text-xs text-muted-foreground">
            {aiAvailable ? t('aiPanel.statusOnline') : t('aiPanel.statusNotConfigured')}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2 text-sm max-w-xs">
                {t('aiPanel.greeting')}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-8">{t('aiPanel.tryAsking')}</p>
              {SUGGESTED_PROMPT_KEYS.map((promptKey) => (
                <button
                  key={promptKey}
                  onClick={() => sendMessage(t(promptKey))}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors ml-8"
                >
                  {t(promptKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <Fragment key={msg.id}>
            {/* G13-10 — above the answer it explains, and it stays there. */}
            {msg.role === 'assistant' && <AiTrace steps={msg.steps ?? []} t={t} />}
          <MessageBubble
            key={msg.id}
            message={msg}
            workspaceId={workspaceId}
            threadId={activeThreadId}
            // Only the LAST answer can be regenerated: re-asking from the
            // middle of a conversation would silently discard everything said
            // after it, which is not what a refresh icon promises.
            onRegenerate={
              !isStreaming && msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id
                ? () => regenerate()
                : undefined
            }
          />
            {/*
              G13-9 [18:42] — "Follow ups", under the answer they came from.

              She drives the entire demo by clicking one of these, which is the
              part our static cold-start menu could never do: it rendered only
              while `messages.length === 0`, so the moment you asked anything
              the guided path disappeared.

              Rendered only when the model offered some. Most turns should have
              none — it is told to omit them rather than invent a next step,
              and three chips of filler under every reply would train people to
              stop reading them.
            */}
            {msg.role === 'assistant' && (msg.followUps?.length ?? 0) > 0 && (
              <div className="ml-8 space-y-1" data-testid={`ai-followups-${msg.id}`}>
                <p className="text-[11px] text-muted-foreground">{t('aiPanel.followUps')}</p>
                <div className="flex flex-col items-start gap-1">
                  {msg.followUps!.map((suggestion, i) => (
                    <button
                      key={`${msg.id}-f${i}`}
                      type="button"
                      data-testid={`ai-followup-${msg.id}-${i}`}
                      disabled={isStreaming}
                      onClick={() => sendMessage(suggestion)}
                      className="rounded-full border border-border/70 px-2.5 py-1 text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Fragment>
        ))}

        {/*
          G13-10 [18:33–18:36] — the trace, above the answer.

          Rendered only while streaming, and only from steps the server
          actually sent. Nothing here is invented client-side: if the server
          skipped a piece of work, its line is absent, which is what makes this
          evidence rather than a loading animation with words on it.
        */}
        {isStreaming && <AiTrace steps={steps} t={t} />}

        {/* Streaming */}
        {isStreaming && streamBuffer && (
          <div className="flex items-start gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2 text-sm max-w-xs whitespace-pre-wrap">
              {streamBuffer}
              <span className="inline-block w-1 h-3.5 bg-brand-700 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}
        {isStreaming && !streamBuffer && (
          <div className="flex items-start gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        {!aiAvailable && (
          <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
            <Wand2 className="h-3.5 w-3.5" />
            {t('aiPanel.configHint')}
          </p>
        )}
        {voice.supported && (voice.listening || voice.interimTranscript) && (
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden />
            <span className="font-medium">{t('ai.voiceListening')}</span>
            {voice.interimTranscript && <span className="italic truncate">{voice.interimTranscript}</span>}
          </p>
        )}
        {voice.error && (
          <p className="mb-2 text-xs text-amber-600" role="alert">
            {voice.error === 'not-allowed' || voice.error === 'service-not-allowed'
              ? t('ai.voicePermissionDenied')
              : t('ai.voiceError')}
          </p>
        )}
        {/* §15 — the composer's context chip, frame `296_1817`. It is not
            decoration: it is the only thing on screen that says this answer is
            coming from a skill rather than the generic assistant, and it must
            stay visible while the reply streams. */}
        <div className="mb-2 flex items-center gap-2">
          {skillId && (
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-foreground"
              data-testid="ai-skill-chip"
            >
              <Gem className="h-3 w-3 text-primary" />
              <span className="truncate max-w-[14rem]">{skillName ?? t('skills.title')}</span>
            </div>
          )}
          {/*
            §V2-S18, frame `[17:16]` — her model picker, built as the frame
            draws it and NOT as the frame promises.

            What it draws: a popover headed "Best models", rows with a provider
            glyph, a tick on the current one, per-model Speed / Intelligence
            bars, and a "Show more" disclosure under a rule.

            What it promises, and this product cannot keep: routing to ChatGPT
            or Gemini. There is no OpenAI or Google client anywhere in the API.
            So they are listed — silence would be read as "not yet, soon" —
            under the disclosure, unselectable, each saying why. The inversion
            of the frame, where Claude was the hidden one, is deliberate: what
            is hidden here is what cannot be done.

            Disabled mid-answer, because changing it then would look like it
            applied to the reply already streaming.
          */}
          <div className="relative ml-auto" ref={pickerRef}>
            <button
              type="button"
              data-testid="ai-model-tier"
              data-tier={tier ?? ''}
              data-open={pickerOpen ? 'true' : 'false'}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              disabled={isStreaming || !tier}
              title={modelTiers.find((m) => m.id === tier)?.hint ?? ''}
              onClick={() => setPickerOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-transparent px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              <span>{modelTiers.find((m) => m.id === tier)?.label ?? t('aiModels.loading')}</span>
              {pickerOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>

            {pickerOpen && (
              <div
                data-testid="ai-model-menu"
                role="listbox"
                aria-label={t('aiModels.bestModels')}
                className="absolute bottom-full right-0 z-[60] mb-2 w-[19rem] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
              >
                <p
                  data-testid="ai-model-group-best"
                  className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted-foreground"
                >
                  {t('aiModels.bestModels')}
                </p>
                {modelTiers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={tier === m.id}
                    data-testid={`ai-model-option-${m.id}`}
                    data-available="true"
                    data-selected={tier === m.id ? 'true' : 'false'}
                    data-preferred={preferredTier === m.id ? 'true' : 'false'}
                    onClick={() => {
                      // Choosing changes THIS conversation. Persisting is the
                      // separate, explicit act below — `[17:28]`–`[17:32]`
                      // describes both, and conflating them means every idle
                      // experiment silently rewrites your default.
                      setTier(m.id)
                      setPickerOpen(false)
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/60"
                  >
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">{m.label}</span>
                        {preferredTier === m.id && (
                          <span
                            data-testid={`ai-model-preferred-badge-${m.id}`}
                            className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[10px] text-primary"
                          >
                            <Star className="h-2.5 w-2.5" />
                            {t('aiModels.preferred')}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{m.hint}</span>
                      {/*
                        The frame's hover card, rendered inline instead. The
                        same two bars, always visible: a measurement you have to
                        hover to see is one nobody compares, and comparing is
                        the entire reason the bars are there.
                      */}
                      <span className="mt-1 block space-y-0.5">
                        {(
                          [
                            ['speed', m.speed, t('aiModels.speed')],
                            ['intelligence', m.intelligence, t('aiModels.intelligence')],
                          ] as const
                        ).map(([key, score, label]) => (
                          <span key={key} className="flex items-center gap-1.5">
                            <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{label}</span>
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                              <span
                                data-testid={`ai-model-bar-${key}-${m.id}`}
                                data-score={score}
                                className="block h-full rounded-full bg-primary"
                                style={{ width: `${Math.min(Math.max(score, 0), 5) * 20}%` }}
                              />
                            </span>
                          </span>
                        ))}
                      </span>
                    </span>
                    {tier === m.id && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                ))}

                <div className="border-t border-border">
                  <button
                    type="button"
                    data-testid="ai-model-show-more"
                    aria-expanded={showMoreModels}
                    onClick={() => setShowMoreModels((s) => !s)}
                    className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/60"
                  >
                    {showMoreModels ? (
                      <ChevronsUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronsDown className="h-3.5 w-3.5" />
                    )}
                    {showMoreModels ? t('aiModels.showLess') : t('aiModels.showMore')}
                  </button>
                  {showMoreModels && (
                    <div data-testid="ai-model-more" className="pb-1">
                      {unavailableModels.map((m) => (
                        <div
                          key={m.id}
                          data-testid={`ai-model-option-${m.id}`}
                          data-available="false"
                          aria-disabled="true"
                          className="flex items-start gap-2 px-3 py-2 opacity-70"
                        >
                          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-medium text-muted-foreground line-through">
                              {m.label}
                            </span>
                            {/*
                              The reason, in the person's language. Without it
                              a greyed-out row says "broken"; with it, it says
                              what would have to change.
                            */}
                            <span
                              data-testid={`ai-model-reason-${m.id}`}
                              className="mt-0.5 block text-[11px] text-muted-foreground"
                            >
                              {t(m.reasonKey as TranslationKey)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/*
                  `[17:32]` "apna [preferred] AI bhi set down karna hai." The
                  separate, explicit act — and the one that goes to the server,
                  so the answer follows the person to another browser.
                */}
                <div className="border-t border-border p-2">
                  <button
                    type="button"
                    data-testid="ai-model-set-preferred"
                    data-preferred-tier={preferredTier ?? ''}
                    disabled={!tier || preferredTier === tier || savePreference.isPending}
                    onClick={() => tier && savePreference.mutate(tier)}
                    className="w-full rounded-md bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    {preferredTier === tier ? t('aiModels.isPreferred') : t('aiModels.setPreferred')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* relative z-50 lifts the composer above the fixed support-widget launcher
            (bottom-6 right-6 z-40), which otherwise intercepts clicks on the Send button. */}
        <div className="relative z-50 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('aiPanel.inputPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            disabled={!aiAvailable || isStreaming}
            className="text-sm"
          />
          <MicButton
            controller={voice}
            disabled={isStreaming}
            labels={{
              start: t('ai.voiceStart'),
              stop: t('ai.voiceStop'),
              unsupported: t('ai.voiceUnsupported'),
            }}
          />
          {isStreaming ? (
            <Button variant="outline" size="icon" onClick={stopStreaming} title={t('aiPanel.stop')}>
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              disabled={!input.trim() || !aiAvailable}
              onClick={() => sendMessage(input)}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  workspaceId,
  threadId,
  onRegenerate,
}: {
  message: Message
  workspaceId: string
  threadId: string | null
  onRegenerate?: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<'task' | 'doc' | null>(null)
  const [vote, setVote] = useState<'up' | 'down' | null>(message.feedback ?? null)
  const isUser = message.role === 'user'
  const actions = useAiMessageActions(workspaceId, threadId)

  function copy() {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('flex items-start gap-2', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
          isUser ? 'bg-brand-200' : 'bg-gradient-to-br from-brand-700 to-brand-500',
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-accent" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-white" />
        )}
      </div>
      <div className="group max-w-xs relative">
        <div
          className={cn(
            'rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
            isUser
              ? 'bg-brand-700 text-white rounded-tr-sm'
              : 'bg-muted rounded-tl-sm',
          )}
        >
          {message.content}
        </div>
        {/* §15 — her six-icon row, frames `302_1842` / `303_1858`: copy, create
            task, save to doc, regenerate, thumbs up, thumbs down.
            Only under an ANSWER: "save this to a doc" under your own question
            would save the question. */}
        <div
          className={cn(
            'flex items-center gap-2 pt-1 text-muted-foreground transition-opacity',
            // A vote is a state, not a hover affordance — hiding it would make
            // it impossible to tell you had already voted.
            vote ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          data-testid={isUser ? undefined : 'ai-message-actions'}
        >
          <IconAction onClick={copy} title={t('aiPanel.copy')} testid="ai-action-copy">
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Clipboard className="h-3.5 w-3.5" />
            )}
          </IconAction>

          {!isUser && (
            <>
              <IconAction
                title={t('aiPanel.createTask')}
                testid="ai-action-task"
                disabled={!threadId || busy !== null}
                onClick={async () => {
                  setBusy('task')
                  try {
                    const { task } = await actions.createTask(message.id)
                    toast.success(t('aiPanel.taskCreated', { title: task.title }))
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t('aiPanel.errorMessage'))
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === 'task' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
              </IconAction>

              <IconAction
                title={t('aiPanel.saveToDoc')}
                testid="ai-action-doc"
                disabled={!threadId || busy !== null}
                onClick={async () => {
                  setBusy('doc')
                  try {
                    await actions.saveToDoc(message.id)
                    toast.success(t('aiPanel.savedToDoc'))
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : t('aiPanel.errorMessage'))
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === 'doc' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileOutput className="h-3.5 w-3.5" />}
              </IconAction>

              {onRegenerate && (
                <IconAction title={t('aiPanel.regenerate')} testid="ai-action-regenerate" onClick={onRegenerate}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconAction>
              )}

              <IconAction
                title={t('aiPanel.thumbsUp')}
                testid="ai-action-up"
                disabled={!threadId}
                onClick={async () => {
                  // Optimistic, and pressing the same one again clears it —
                  // the server applies the identical rule, so a failed write
                  // just leaves the two briefly disagreeing.
                  const next = vote === 'up' ? null : 'up'
                  setVote(next)
                  await actions.setFeedback(message.id, 'up').catch(() => setVote(vote))
                }}
              >
                <ThumbsUp className={cn('h-3.5 w-3.5', vote === 'up' && 'text-emerald-500')} />
              </IconAction>

              <IconAction
                title={t('aiPanel.thumbsDown')}
                testid="ai-action-down"
                disabled={!threadId}
                onClick={async () => {
                  const next = vote === 'down' ? null : 'down'
                  setVote(next)
                  await actions.setFeedback(message.id, 'down').catch(() => setVote(vote))
                }}
              >
                <ThumbsDown className={cn('h-3.5 w-3.5', vote === 'down' && 'text-destructive')} />
              </IconAction>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function IconAction({
  children,
  onClick,
  title,
  testid,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  testid: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      data-testid={testid}
      disabled={disabled}
      className="hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}
