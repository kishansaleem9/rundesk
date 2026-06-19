import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@rundesk/ui'
import { Layers } from 'lucide-react'

// ── ProseMirror/TipTap content helpers ──────────────────────────────────────
type Node = Record<string, unknown>
const h = (level: 1 | 2 | 3, text: string): Node => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
})
const p = (text = ''): Node => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})
const bullets = (items: string[]): Node => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [p(t)] })),
})
const todos = (items: string[]): Node => ({
  type: 'taskList',
  content: items.map((t) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(t)] })),
})
const doc = (...content: Node[]): Record<string, unknown> => ({ type: 'doc', content })

export type DocTemplate = {
  id: string
  name: string
  emoji: string
  desc: string
  title: string
  content: Record<string, unknown>
}

// Built-in document templates. Each produces a ready-to-edit TipTap document.
export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: 'meeting',
    name: 'Meeting notes',
    emoji: '🗣',
    desc: 'Attendees, agenda, decisions, action items.',
    title: 'Meeting notes',
    content: doc(
      h(1, 'Meeting notes'),
      p('Date: '),
      h(3, 'Attendees'),
      bullets(['']),
      h(3, 'Agenda'),
      bullets(['', '']),
      h(3, 'Decisions'),
      bullets(['']),
      h(3, 'Action items'),
      todos(['', '']),
    ),
  },
  {
    id: 'project-brief',
    name: 'Project brief',
    emoji: '📦',
    desc: 'Goals, scope, success criteria.',
    title: 'Project brief',
    content: doc(
      h(1, 'Project brief'),
      h(3, 'Problem'),
      p(''),
      h(3, 'Goals'),
      bullets(['']),
      h(3, 'Scope'),
      p('In scope:'),
      bullets(['']),
      p('Out of scope:'),
      bullets(['']),
      h(3, 'Success criteria'),
      bullets(['']),
    ),
  },
  {
    id: 'sop',
    name: 'SOP',
    emoji: '📋',
    desc: 'A repeatable step-by-step process.',
    title: 'Standard operating procedure',
    content: doc(
      h(1, 'Standard operating procedure'),
      h(3, 'Purpose'),
      p(''),
      h(3, 'When to use'),
      p(''),
      h(3, 'Steps'),
      { type: 'orderedList', content: [{ type: 'listItem', content: [p('')] }] },
      h(3, 'Owner'),
      p(''),
    ),
  },
  {
    id: 'retro',
    name: 'Sprint retro',
    emoji: '🔄',
    desc: 'Start / Stop / Continue + actions.',
    title: 'Sprint retro',
    content: doc(
      h(1, 'Sprint retro'),
      h(3, 'What went well'),
      bullets(['']),
      h(3, 'What didn’t'),
      bullets(['']),
      h(3, 'Start / Stop / Continue'),
      bullets(['Start: ', 'Stop: ', 'Continue: ']),
      h(3, 'Action items'),
      todos(['']),
    ),
  },
  {
    id: 'rfc',
    name: 'RFC',
    emoji: '📐',
    desc: 'Decision proposal with alternatives.',
    title: 'RFC',
    content: doc(
      h(1, 'RFC: '),
      h(3, 'Summary'),
      p(''),
      h(3, 'Motivation'),
      p(''),
      h(3, 'Proposal'),
      p(''),
      h(3, 'Alternatives considered'),
      bullets(['']),
      h(3, 'Risks'),
      bullets(['']),
    ),
  },
  {
    id: 'one-on-one',
    name: '1:1 agenda',
    emoji: '💬',
    desc: 'Persistent agenda + parking lot.',
    title: '1:1 agenda',
    content: doc(
      h(1, '1:1 agenda'),
      h(3, 'Topics for today'),
      todos(['', '']),
      h(3, 'Follow-ups'),
      todos(['']),
      h(3, 'Parking lot'),
      bullets(['']),
    ),
  },
]

export function DocTemplatesDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPick: (template: DocTemplate) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" /> Pick a doc template
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {DOC_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="text-left rounded-lg border border-border/50 bg-card/40 p-3 hover:border-accent/40 hover:bg-card/70 transition-all"
              onClick={() => {
                onPick(t)
                onOpenChange(false)
              }}
            >
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-lg">{t.emoji}</span>
                <span className="text-sm font-medium">{t.name}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.desc}</p>
            </button>
          ))}
        </div>
        <div className="border-t border-border/40 pt-3 mt-1 flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
