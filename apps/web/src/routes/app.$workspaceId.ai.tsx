import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Button, Card, Input, cn } from '@rundesk/ui'
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
} from 'lucide-react'
import { api } from '../lib/api'
import { AiPanel } from '../components/ai-panel'

export const Route = createFileRoute('/app/$workspaceId/ai')({
  component: AiPage,
})

type GeneratedTask = {
  title: string
  description: string
  subtasks: string[]
  priority: string
  estimatedHours?: number | null
}

type ExtractedTask = {
  title: string
  description: string
  assigneeName?: string | null
  dueDate?: string | null
  priority: string
}

function AiPage() {
  const { workspaceId } = Route.useParams()
  const [activeTab, setActiveTab] = useState<'chat' | 'generate' | 'notes' | 'writing'>('chat')

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow animate-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold leading-tight">Rundesk AI</h1>
            <p className="text-xs text-muted-foreground">
              Powered by Claude — knows everything in your workspace
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border/40 px-6 gap-1 overflow-x-auto scrollbar-none">
        {(
          [
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'generate', label: 'Generate task', icon: Wand2 },
            { id: 'notes', label: 'Meeting notes', icon: FileText },
            { id: 'writing', label: 'Writing', icon: Zap },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <AiPanel workspaceId={workspaceId} className="h-full" />
        )}
        {activeTab === 'generate' && <TaskGeneratorTab workspaceId={workspaceId} />}
        {activeTab === 'notes' && <MeetingNotesTab workspaceId={workspaceId} />}
        {activeTab === 'writing' && <WritingTab />}
      </div>
    </div>
  )
}

// ─── Task Generator ───────────────────────────────────────────────────────────

function TaskGeneratorTab({ workspaceId }: { workspaceId: string }) {
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<GeneratedTask | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const generate = useMutation({
    mutationFn: () => api<GeneratedTask>('/ai/task/generate', { method: 'POST', body: { prompt } }),
    onSuccess: (data) => { setResult(data); setSaved(false) },
  })

  async function saveTask() {
    if (!result) return
    setSaving(true)
    try {
      // Get first available list in workspace
      const spaces = await api<any[]>(`/workspaces/${workspaceId}/spaces`)
      if (!spaces.length) return
      const projects = await api<any[]>(`/spaces/${spaces[0].id}/projects`)
      if (!projects.length) return
      const lists = await api<any[]>(`/projects/${projects[0].id}/lists`)
      if (!lists.length) return

      await api('/tasks', {
        method: 'POST',
        body: {
          listId: lists[0].id,
          title: result.title,
          description: result.description,
          priority: result.priority,
        },
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full">
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold mb-1">Generate task from prompt</h2>
          <p className="text-sm text-muted-foreground">
            Describe what you want to do in plain language — AI will generate a complete task with subtasks, priority, and description.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Fix the login page timeout bug on mobile"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && prompt.trim()) generate.mutate()
            }}
            className="flex-1"
          />
          <Button
            onClick={() => generate.mutate()}
            disabled={!prompt.trim() || generate.isPending}
          >
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </Button>
        </div>

        {result && (
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{result.title}</p>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    result.priority === 'urgent' && 'bg-red-100 text-red-700',
                    result.priority === 'high' && 'bg-orange-100 text-orange-700',
                    result.priority === 'normal' && 'bg-blue-100 text-blue-700',
                    result.priority === 'low' && 'bg-gray-100 text-gray-700',
                  )}
                >
                  {result.priority}
                </span>
                {result.estimatedHours && (
                  <span className="ml-2 text-xs text-muted-foreground">~{result.estimatedHours}h</span>
                )}
              </div>
            </div>

            {result.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{result.description}</p>
            )}

            {result.subtasks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Subtasks</p>
                <ul className="space-y-1">
                  {result.subtasks.map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <Plus className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={saveTask}
                disabled={saving || saved}
              >
                {saved ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Saved</>
                ) : saving ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</>
                ) : (
                  'Save as task'
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => generate.mutate()}
              >
                Regenerate
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Meeting Notes ────────────────────────────────────────────────────────────

function MeetingNotesTab({ workspaceId }: { workspaceId: string }) {
  const [notes, setNotes] = useState('')
  const [tasks, setTasks] = useState<ExtractedTask[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const extract = useMutation({
    mutationFn: () => api<ExtractedTask[]>('/ai/meeting-notes', { method: 'POST', body: { notes } }),
    onSuccess: (data) => {
      setTasks(data)
      setSelected(new Set(data.map((_, i) => i)))
    },
  })

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Meeting notes → tasks</h2>
        <p className="text-sm text-muted-foreground">
          Paste your meeting notes and AI will extract all action items as tasks.
        </p>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Paste meeting notes here…&#10;&#10;e.g.&#10;- John will fix the login bug by Friday&#10;- Sarah needs to review the design mockups&#10;- Follow up with client about requirements"
        rows={8}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <Button
        onClick={() => extract.mutate()}
        disabled={!notes.trim() || extract.isPending}
      >
        {extract.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Extracting…</>
        ) : (
          <><Wand2 className="h-4 w-4 mr-1.5" /> Extract action items</>
        )}
      </Button>

      {tasks && tasks.length === 0 && (
        <Card className="p-4 text-center text-muted-foreground text-sm">
          No action items found in these notes.
        </Card>
      )}

      {tasks && tasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{tasks.length} action items found</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                selected.size === tasks.length
                  ? setSelected(new Set())
                  : setSelected(new Set(tasks.map((_, i) => i)))
              }
            >
              {selected.size === tasks.length ? 'Deselect all' : 'Select all'}
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
                    <p className="text-xs text-muted-foreground">Assigned to: {task.assigneeName}</p>
                  )}
                  {task.dueDate && (
                    <p className="text-xs text-muted-foreground">Due: {task.dueDate}</p>
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
                  {task.priority}
                </span>
              </div>
            </Card>
          ))}
          {selected.size > 0 && (
            <Button>
              Save {selected.size} task{selected.size !== 1 ? 's' : ''}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Writing Assistant ────────────────────────────────────────────────────────

function WritingTab() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'improve' | 'shorten' | 'expand' | 'format'>('improve')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)

  const improve = useMutation({
    mutationFn: () => api<{ improved: string }>('/ai/writing/improve', { method: 'POST', body: { text, mode } }),
    onSuccess: (data) => setResult(data.improved),
  })

  function copy() {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="p-6 max-w-2xl overflow-auto h-full space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Writing assistant</h2>
        <p className="text-sm text-muted-foreground">
          Paste any text and let AI improve it for you.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            { id: 'improve', label: 'Improve' },
            { id: 'shorten', label: 'Shorten' },
            { id: 'expand', label: 'Expand' },
            { id: 'format', label: 'Format' },
          ] as const
        ).map((m) => (
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
            {m.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your text here…"
        rows={6}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <Button
        onClick={() => improve.mutate()}
        disabled={!text.trim() || improve.isPending}
      >
        {improve.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Processing…</>
        ) : (
          <><Wand2 className="h-4 w-4 mr-1.5" /> {mode.charAt(0).toUpperCase() + mode.slice(1)}</>
        )}
      </Button>

      {result && (
        <Card className="p-4 relative">
          <p className="text-sm whitespace-pre-wrap">{result}</p>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Copied</>
              ) : (
                <><Copy className="h-3.5 w-3.5 mr-1" /> Copy</>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setText(result); setResult('') }}>
              Use this text
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
