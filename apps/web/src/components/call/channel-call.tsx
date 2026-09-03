import { useEffect } from 'react'
import { Button, Badge, toast } from '@rundesk/ui'
import { Video, Circle } from 'lucide-react'
import { useTranslation } from '../../lib/i18n'
import { getRealtimeSocket } from '../../lib/realtime'
import { useCallStore } from '../../store/call'
import { presentIn, useLiveCall } from '../../lib/calls-api'

/**
 * §2.8 SyncUp, from a channel — `[19:40]` "Start SyncUp — Jump on a voice call".
 *
 * The header control, and only that. It answers one question — "is there a call
 * in the channel I am LOOKING at?" — which is a question about this page, and
 * dies with it.
 *
 * §G14-8: the live call used to live here too, and that was the bug. The chat
 * page mounts this, so clicking through to a task unmounted the call, stopped
 * every track and hung up — while the picture-in-picture dock rendered and
 * looked exactly right. Minimise existed to let you browse, and browsing was
 * what ended the call. The live half now lives in `CallHost`, mounted by the
 * shell; this raises an intent and lets the shell act on it.
 */
export function ChannelCall({
  workspaceId,
  channelId,
  canRecord,
  action,
  onActionHandled,
}: {
  workspaceId: string
  channelId: string | null
  /**
   * Whether recording may be offered for THIS channel. Passed on to the host
   * with the intent rather than read there: once you have browsed away, the
   * channel on screen is no longer the one you are talking in.
   */
  canRecord: boolean
  /**
   * An intent raised from elsewhere in the page — a call card's Join/Leave, or
   * the empty-channel "Start SyncUp" card (§G11 [14:16]).
   *
   * `start` carries no callId because there is no call yet. It could have been
   * spelled `join` with a placeholder — the id happens to be unread on that
   * path — but a caller passing a fake id and relying on nobody looking at it
   * is one refactor away from a bug nobody can find.
   */
  action?: { kind: 'join' | 'leave'; callId: string } | { kind: 'start' } | null
  onActionHandled?: () => void
}) {
  const { t } = useTranslation()
  const requestJoin = useCallStore((s) => s.requestJoin)
  const activeCallId = useCallStore((s) => s.activeCallId)

  const hereQuery = useLiveCall(workspaceId, channelId)
  const live = hereQuery.data

  // Someone else starting, joining, leaving or recording changes what this
  // button should say.
  useEffect(() => {
    const socket = getRealtimeSocket()
    const onEvent = (event: { type?: string }) => {
      if (!event?.type?.startsWith('call.')) return
      if (event.type === 'call.signal' || event.type === 'call.reaction') return
      void hereQuery.refetch()
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hereQuery.refetch])

  const askToJoin = () => {
    if (!channelId) return
    requestJoin({ channelId, callId: live?.id, canRecord })
  }

  /*
   * §2.8 gap 9 — act on a card's Join/Leave, then clear it so the next press is
   * a fresh intent rather than a flag nobody reset.
   *
   * Leave is raised as an intent too. It used to be handled here because the
   * call state was here; sending it to the host keeps one place that knows
   * which call is in progress, rather than two that can disagree.
   */
  useEffect(() => {
    if (!action) return
    if (action.kind === 'leave') {
      useCallStore.getState().requestLeave(action.callId)
    } else if (activeCallId) {
      toast(t('call.alreadyInAnother'))
    } else if (action.kind === 'start') {
      if (channelId) requestJoin({ channelId, callId: live?.id, canRecord })
    } else {
      if (channelId) requestJoin({ channelId, callId: action.callId, canRecord })
    }
    onActionHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  if (!channelId) return null
  const present = presentIn(live)
  // Already in this very call: the surface is on screen and offering to join it
  // again would be a button that says the wrong thing.
  if (activeCallId && live && activeCallId === live.id) return null

  return (
    <Button
      size="sm"
      variant={live ? 'default' : 'outline'}
      onClick={askToJoin}
      data-testid={live ? 'call-join-button' : 'call-start-button'}
      title={live ? t('call.liveHere') : t('call.startSyncUp')}
    >
      <Video className="h-3.5 w-3.5 mr-1.5" />
      {live ? t('call.joinSyncUp') : t('call.startSyncUp')}
      {live && present.length > 0 && (
        <Badge variant="secondary" className="ml-1.5 text-[10px]">
          {present.length}
        </Badge>
      )}
      {live?.recording && (
        <Circle className="h-2.5 w-2.5 ml-1.5 fill-red-500 text-red-500 animate-pulse" />
      )}
    </Button>
  )
}
