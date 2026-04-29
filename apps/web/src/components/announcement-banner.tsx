import { useState } from 'react'
import { Megaphone, X, Sparkles } from 'lucide-react'
import { Button, cn } from '@rundesk/ui'

type Announcement = {
  id: string
  title: string
  body?: string
  ctaLabel?: string
  ctaUrl?: string
  tone?: 'info' | 'celebrate' | 'warn'
}

const MOCK: Announcement = {
  id: 'a1',
  title: 'New: Workload heat-map + AI Insights are live.',
  body: 'See per-person capacity, project health and contribution analytics — all powered by Claude.',
  ctaLabel: 'Open Insights',
  ctaUrl: '/app/_/insights',
  tone: 'celebrate',
}

export function WorkspaceAnnouncementBanner({
  announcement = MOCK,
  onDismiss,
}: {
  announcement?: Announcement
  onDismiss?: () => void
}) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const toneClass =
    announcement.tone === 'warn'
      ? 'from-orange-500/30 to-pink-500/20'
      : announcement.tone === 'celebrate'
      ? 'from-violet-500/30 to-pink-500/20'
      : 'from-brand-700/30 to-accent-violet/20'

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden border-b border-border/40 bg-gradient-to-r',
        toneClass,
      )}
    >
      <div className="relative flex items-center gap-3 px-6 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow">
          {announcement.tone === 'celebrate' ? (
            <Sparkles className="h-3.5 w-3.5" />
          ) : (
            <Megaphone className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-medium">{announcement.title}</span>
          {announcement.body && (
            <span className="text-muted-foreground"> · {announcement.body}</span>
          )}
        </div>
        {announcement.ctaLabel && (
          <Button variant="glass" size="sm" className="shrink-0">
            {announcement.ctaLabel}
          </Button>
        )}
        <button
          onClick={() => {
            setDismissed(true)
            onDismiss?.()
          }}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Dismiss announcement"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
