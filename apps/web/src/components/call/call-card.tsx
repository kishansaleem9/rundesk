import { Button, cn } from '@rundesk/ui'
import { Circle, Video } from 'lucide-react'
import { useTranslation } from '../../lib/i18n'
import {
  callCardMode,
  callCardSubtitle,
  callCardTitleKey,
  canJoinFromCard,
  type CallCardState,
} from '../../lib/call-card'

/**
 * §2.8 gap 9 — the call card in the channel, `[19:25-19:57, 21:10]`.
 *
 *   "You're in the SyncUp / Wait for your team to join!" + Leave, then "SyncUp
 *   Ended / Lasted 45s · 1 person joined" with Join disabled, and "Join the
 *   SyncUp / No one is in the call" with Join enabled.
 *
 * One card, three states, chosen by call-card.ts. It reads live: a card
 * rendered while the call was running says something different an hour later
 * without being rewritten, which is why the lifecycle is not baked into the
 * message text.
 */
export function CallCard({
  call,
  onJoin,
  onLeave,
}: {
  call: CallCardState & { recording?: boolean }
  onJoin: () => void
  onLeave: () => void
}) {
  const { t } = useTranslation()
  const mode = callCardMode(call)
  const subtitle = callCardSubtitle(call)
  const joinable = canJoinFromCard(call)

  return (
    <div
      className={cn(
        'my-1 flex items-center gap-3 rounded-xl border px-3 py-2.5',
        mode === 'ended'
          ? 'border-border/60 bg-muted/30'
          : 'border-violet-500/30 bg-violet-500/[0.06]',
      )}
      data-testid="call-card"
      data-call-mode={mode}
    >
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          mode === 'ended' ? 'bg-muted text-muted-foreground' : 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
        )}
      >
        <Video className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium">
          {t(callCardTitleKey(mode))}
          {call.recording && mode !== 'ended' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
              <Circle className="h-2 w-2 fill-current animate-pulse" />
              {t('callCard.recording')}
            </span>
          )}
        </div>
        <p className="truncate text-[12px] text-muted-foreground">
          {t(subtitle.key, subtitle.vars as never)}
        </p>
      </div>

      {/*
        The button stays on an ended call rather than disappearing: a card with
        no control reads as a card that failed to load. Disabled says "this is
        over", which is the true thing.
      */}
      {mode === 'in' ? (
        <Button size="sm" variant="outline" onClick={onLeave} data-testid="call-card-leave">
          {t('callCard.leaveButton')}
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={onJoin}
          disabled={!joinable}
          data-testid="call-card-join"
          className={cn(!joinable && 'opacity-50')}
        >
          {t('callCard.joinButton')}
        </Button>
      )}
    </div>
  )
}
