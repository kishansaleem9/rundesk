import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Card,
  Badge,
  Button,
  Input,
  Textarea,
  Label,
  Switch,
  cn,
} from '@rundesk/ui'
import { Megaphone, Plus, Trash2, Sparkles, AlertTriangle, Pause } from 'lucide-react'

export const Route = createFileRoute('/app/admin/announcements')({
  component: AnnouncementsAdminPage,
})

type Tone = 'info' | 'celebrate' | 'warn'
type Item = {
  id: string
  title: string
  body: string
  tone: Tone
  active: boolean
  expires: string
  views: number
  dismisses: number
}

const MOCK: Item[] = [
  {
    id: 'a1',
    title: 'New: Workload + AI Insights are live',
    body: 'See per-person capacity, project health and contribution analytics.',
    tone: 'celebrate',
    active: true,
    expires: '2026-05-12',
    views: 142,
    dismisses: 38,
  },
  {
    id: 'a2',
    title: 'Scheduled maintenance — Sat May 3, 9pm UTC',
    body: 'API will be unavailable for ~10 minutes during the upgrade.',
    tone: 'warn',
    active: false,
    expires: '2026-05-04',
    views: 0,
    dismisses: 0,
  },
]

function AnnouncementsAdminPage() {
  const [items, setItems] = useState<Item[]>(MOCK)
  const [draft, setDraft] = useState({
    title: '',
    body: '',
    tone: 'celebrate' as Tone,
    expires: '',
  })

  function add() {
    if (!draft.title.trim()) return
    setItems((arr) => [
      {
        id: crypto.randomUUID(),
        title: draft.title,
        body: draft.body,
        tone: draft.tone,
        active: true,
        expires: draft.expires || '2026-12-31',
        views: 0,
        dismisses: 0,
      },
      ...arr,
    ])
    setDraft({ title: '', body: '', tone: 'celebrate', expires: '' })
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <header>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
          Workspace announcements
        </div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Megaphone className="h-4 w-4" />
          </span>
          Announcements
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          Pin a banner across the entire workspace. Members can dismiss it once read.
        </p>
      </header>

      {/* Compose */}
      <Card variant="glass" className="p-5 space-y-4">
        <h2 className="font-display text-lg font-semibold">New announcement</h2>
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Short, punchy headline"
          />
        </div>
        <div className="space-y-2">
          <Label>Body</Label>
          <Textarea
            rows={2}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder="One line of context (optional)"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tone</Label>
            <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-md p-1">
              {(['info', 'celebrate', 'warn'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDraft({ ...draft, tone: t })}
                  className={cn(
                    'flex-1 text-xs px-3 py-1.5 rounded font-medium transition-all capitalize',
                    draft.tone === t
                      ? 'bg-brand-gradient text-white'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Expires</Label>
            <Input
              type="date"
              value={draft.expires}
              onChange={(e) => setDraft({ ...draft, expires: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost">Save draft</Button>
          <Button variant="gradient" onClick={add} disabled={!draft.title.trim()}>
            <Plus className="h-3.5 w-3.5" /> Publish
          </Button>
        </div>
      </Card>

      {/* List */}
      <section>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          All announcements
        </h2>
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} variant="glass" className="p-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md shrink-0 text-white',
                    item.tone === 'celebrate' && 'bg-brand-gradient',
                    item.tone === 'warn' && 'bg-warning',
                    item.tone === 'info' && 'bg-accent',
                  )}
                >
                  {item.tone === 'celebrate' ? <Sparkles className="h-4 w-4" /> : item.tone === 'warn' ? <AlertTriangle className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    {item.active ? (
                      <Badge variant="success" className="text-[9px] uppercase">Live</Badge>
                    ) : (
                      <Badge variant="soft" className="text-[9px] uppercase">
                        <Pause className="h-2.5 w-2.5" /> Paused
                      </Badge>
                    )}
                  </div>
                  {item.body && <p className="text-xs text-muted-foreground mt-0.5">{item.body}</p>}
                  <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-3">
                    <span>Expires {fmt(item.expires)}</span>
                    <span>· {item.views} views</span>
                    <span>· {item.dismisses} dismisses</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={item.active}
                    onCheckedChange={(v) =>
                      setItems((arr) => arr.map((it) => (it.id === item.id ? { ...it, active: v } : it)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setItems((arr) => arr.filter((it) => it.id !== item.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
