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
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

type Message = {
  role: 'user' | 'assistant'
  content: string
  id: string
}

type AiPanelProps = {
  workspaceId: string
  onClose?: () => void
  className?: string
}

const SUGGESTED_PROMPTS = [
  'What tasks are due this week?',
  'Summarize the status of my projects',
  'Help me write a task description',
  'Create tasks for launching a new feature',
  "What's blocking my team?",
]

export function AiPanel({ workspaceId, onClose, className }: AiPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const statusQuery = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ available: boolean }>('/ai/status'),
    retry: false,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamBuffer])

  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming) return
    setInput('')

    const userMsg: Message = { role: 'user', content, id: Date.now().toString() }
    setMessages((prev) => [...prev, userMsg])
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
          workspaceContext: `Workspace ID: ${workspaceId}`,
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error('Stream request failed')
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
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
            id: Date.now().toString(),
          },
        ])
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

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
            {aiAvailable ? 'Online — Claude' : 'Not configured'}
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
                Hi! I&apos;m Rundesk AI. I can help you manage tasks, summarize projects, draft content, and more.
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-8">Try asking:</p>
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors ml-8"
                >
                  {p}
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
            Add ANTHROPIC_API_KEY to your .env to enable AI features.
          </p>
        )}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Rundesk AI anything…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            disabled={!aiAvailable || isStreaming}
            className="text-sm"
          />
          {isStreaming ? (
            <Button variant="outline" size="icon" onClick={stopStreaming} title="Stop">
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
          title="Copy"
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
