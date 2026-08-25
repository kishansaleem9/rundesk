import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, cn } from '@rundesk/ui'
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
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation } from '../lib/i18n'
import { useSpeechRecognition, MicButton } from '../lib/use-speech-recognition'
import { useAiChatActions, useAiChatThread } from '../lib/skills-api'

type Message = {
  role: 'user' | 'assistant'
  content: string
  id: string
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
  /** Fired when a thread names itself, so the sidebar can show the new title. */
  onThreadTitled?: (title: string) => void
}

// Stable catalog-key identifiers; the localized text is both shown and sent
// as the chat message when a suggestion is clicked.
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
  onThreadTitled,
}: AiPanelProps) {
  const { t, locale } = useTranslation()
  const [messages, setMessages] = useState<Message[]>([])
  const chat = useAiChatActions(workspaceId)
  const threadQuery = useAiChatThread(workspaceId, threadId)
  // Which thread the on-screen messages belong to, so switching threads
  // replaces the conversation instead of appending to it.
  const loadedThreadRef = useRef<string | null>(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Voice dictation for the chat composer (Plan §15.2) — a final transcript is
  // appended to the input; the user reviews it, then sends as usual.
  const voice = useSpeechRecognition({
    locale,
    onResult: (transcript) =>
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript)),
  })

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
      loaded.messages.map((m) => ({ role: m.role, content: m.content, id: m.id })),
    )
  }, [threadId, threadQuery.data])

  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming) return
    setInput('')

    const userMsg: Message = { role: 'user', content, id: Date.now().toString() }
    setMessages((prev) => [...prev, userMsg])
    // Written alongside, not awaited: the message is already on screen, and
    // blocking the answer on a write nobody is waiting for would make the
    // assistant feel slower than it is. A failed write loses one turn of
    // history, never the reply.
    if (threadId) void chat.append(threadId, 'user', content).catch(() => {})
    setIsStreaming(true)
    setStreamBuffer('')

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
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamBuffer('')
      if (threadId && accumulated.trim()) {
        void chat
          .append(threadId, 'assistant', accumulated)
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
          <MessageBubble key={msg.id} message={msg} />
        ))}

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
        {skillId && (
          <div
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-foreground"
            data-testid="ai-skill-chip"
          >
            <Gem className="h-3 w-3 text-primary" />
            <span className="truncate max-w-[14rem]">{skillName ?? t('skills.title')}</span>
          </div>
        )}
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

function MessageBubble({ message }: { message: Message }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

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
        <button
          onClick={copy}
          className="absolute -bottom-4 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          title={t('aiPanel.copy')}
        >
          {copied ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Clipboard className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}
