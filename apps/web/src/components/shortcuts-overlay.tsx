import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@rundesk/ui'

type Shortcut = { keys: string[]; description: string }

const GROUPS: Array<{ title: string; items: Shortcut[] }> = [
  {
    title: 'Navigation',
    items: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['?'], description: 'Show this shortcuts overlay' },
      { keys: ['G', 'D'], description: 'Go to dashboard' },
      { keys: ['G', 'I'], description: 'Go to inbox' },
      { keys: ['G', 'C'], description: 'Go to chat' },
      { keys: ['G', 'T'], description: 'Go to timeline' },
      { keys: ['G', 'O'], description: 'Go to docs' },
    ],
  },
  {
    title: 'Tasks (in list view)',
    items: [
      { keys: ['Shift', 'click'], description: 'Add task to multi-select' },
      { keys: ['Esc'], description: 'Clear multi-select' },
      { keys: ['⌘', 'A'], description: 'Select all visible tasks' },
      { keys: ['Del'], description: 'Archive selected tasks' },
    ],
  },
  {
    title: 'Whiteboards',
    items: [
      { keys: ['Shift', 'click'], description: 'Add item to multi-select' },
      { keys: ['⌘', 'D'], description: 'Duplicate selection' },
      { keys: ['Del'], description: 'Delete selected items' },
    ],
  },
  {
    title: 'Mind maps',
    items: [
      { keys: ['Tab'], description: 'Add child branch under selected node' },
      { keys: ['Del'], description: 'Remove selected branch + descendants' },
    ],
  },
  {
    title: 'Docs editor',
    items: [
      { keys: ['@'], description: 'Mention a teammate' },
      { keys: ['⌘', 'B'], description: 'Bold' },
      { keys: ['⌘', 'I'], description: 'Italic' },
    ],
  },
]

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack `?` while the user is typing in inputs/textareas/contentEditable.
      const target = e.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (isEditable) return
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> any time to toggle this overlay.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 mt-2">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                {group.title}
              </h4>
              <ul className="space-y-1.5">
                {group.items.map((shortcut, idx) => (
                  <li
                    key={`${group.title}-${idx}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-foreground/80">{shortcut.description}</span>
                    <span className="flex items-center gap-1">
                      {shortcut.keys.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/60 bg-card/60 px-1.5 text-[10px] font-medium text-foreground/80 shadow-sm">
      {children}
    </kbd>
  )
}
