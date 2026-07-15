import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@rundesk/ui'
import { useTranslation, type TranslationKey } from '../lib/i18n'

// `titleKey` / `descKey` reference i18n catalog entries; the key glyphs
// themselves (⌘, K, Esc, …) stay literal since they are not localizable.
type Shortcut = { keys: string[]; descKey: TranslationKey }

const GROUPS: Array<{ titleKey: TranslationKey; items: Shortcut[] }> = [
  {
    titleKey: 'shortcuts.section.navigation',
    items: [
      { keys: ['⌘', 'K'], descKey: 'shortcuts.openCommandPalette' },
      { keys: ['?'], descKey: 'shortcuts.showOverlay' },
      { keys: ['G', 'D'], descKey: 'shortcuts.goToDashboard' },
      { keys: ['G', 'I'], descKey: 'shortcuts.goToInbox' },
      { keys: ['G', 'C'], descKey: 'shortcuts.goToChat' },
      { keys: ['G', 'T'], descKey: 'shortcuts.goToTimeline' },
      { keys: ['G', 'O'], descKey: 'shortcuts.goToDocs' },
    ],
  },
  {
    titleKey: 'shortcuts.section.tasks',
    items: [
      { keys: ['Shift', 'click'], descKey: 'shortcuts.addTaskMultiSelect' },
      { keys: ['Esc'], descKey: 'shortcuts.clearMultiSelect' },
      { keys: ['⌘', 'A'], descKey: 'shortcuts.selectAllTasks' },
      { keys: ['Del'], descKey: 'shortcuts.archiveSelected' },
    ],
  },
  {
    titleKey: 'shortcuts.section.whiteboards',
    items: [
      { keys: ['Shift', 'click'], descKey: 'shortcuts.addItemMultiSelect' },
      { keys: ['⌘', 'D'], descKey: 'shortcuts.duplicateSelection' },
      { keys: ['Del'], descKey: 'shortcuts.deleteSelectedItems' },
    ],
  },
  {
    titleKey: 'shortcuts.section.mindMaps',
    items: [
      { keys: ['Tab'], descKey: 'shortcuts.addChildBranch' },
      { keys: ['Del'], descKey: 'shortcuts.removeBranch' },
    ],
  },
  {
    titleKey: 'shortcuts.section.docsEditor',
    items: [
      { keys: ['@'], descKey: 'shortcuts.mentionTeammate' },
      { keys: ['⌘', 'B'], descKey: 'shortcuts.bold' },
      { keys: ['⌘', 'I'], descKey: 'shortcuts.italic' },
    ],
  },
]

export function ShortcutsOverlay() {
  const { t } = useTranslation()
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
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>
            {t('shortcuts.toggleHintBefore')} <Kbd>?</Kbd> {t('shortcuts.toggleHintAfter')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 mt-2">
          {GROUPS.map((group) => (
            <section key={group.titleKey}>
              <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                {t(group.titleKey)}
              </h4>
              <ul className="space-y-1.5">
                {group.items.map((shortcut, idx) => (
                  <li
                    key={`${group.titleKey}-${idx}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-foreground/80">{t(shortcut.descKey)}</span>
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
