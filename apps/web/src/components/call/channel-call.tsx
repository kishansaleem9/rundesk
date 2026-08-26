import { useEffect, useRef, useState } from 'react'
import { Button, Badge, cn, toast } from '@rundesk/ui'
import { Video, Circle, AlertTriangle } from 'lucide-react'
import { useTranslation } from '../../lib/i18n'
import { getRealtimeSocket } from '../../lib/realtime'
import { useAuthStore } from '../../store/auth'
import { FLAGS } from '@rundesk/feature-flags'
import { presentIn, useCallActions, useLiveCall, type Call } from '../../lib/calls-api'
import { callHasEnded } from '../../lib/call-lifecycle'
import { useFeatureGate } from '../feature-gate'
import { CallPreJoin, type CallBackground } from './call-prejoin'
import { CallSurface } from './call-surface'

/**
 * §2.8 SyncUp, from a channel — `[19:40]` "Start SyncUp — Jump on a voice call".
 *
 * Owns the whole arc: the header button, the pre-join screen, the live call,
 * and the consent gate in front of recording. Mounted by the chat page so a
 * call survives navigating around the workspace — the thing "minimise" is for.
 */
export function ChannelCall({
  workspaceId,
  channelId,
  canRecord,
  onInvite,
}: {
  workspaceId: string
  channelId: string | null
  canRecord: boolean
  onInvite: () => void
}) {
  const { t } = useTranslation()
  const me = useAuthStore((s) => s.user)
  const actions = useCallActions(workspaceId)
  const { requireFeature, gateDialog } = useFeatureGate(workspaceId)

  const [joining, setJoining] = useState(false)
  const [prejoin, setPrejoin] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [background, setBackground] = useState<CallBackground>('none')
  const [inCall, setInCall] = useState<Call | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [recordingBusy, setRecordingBusy] = useState(false)

  /**
   * Two questions, two queries.
   *
   *   - "Is there a call in the channel I am LOOKING at?" — drives the header
   *     button.
   *   - "What is happening in the call I am IN?" — drives the participants
   *     panel, the recording banner, and who we open peer connections to.
   *
   * They used to be one query keyed on the selected channel, so switching
   * channels mid-call froze the second one: anybody who joined after the switch
   * never appeared, and the two of you might or might not connect depending on
   * how your ids happened to sort. When the two channels are the same, these
   * share a cache key and there is only one request.
   */
  const hereQuery = useLiveCall(workspaceId, channelId)
  const joinedQuery = useLiveCall(workspaceId, inCall?.channelId ?? null)
  const live = hereQuery.data

  // Someone else starting, joining, leaving or recording refreshes the call.
  useEffect(() => {
    const socket = getRealtimeSocket()
    const onEvent = (event: { type?: string; callId?: string }) => {
      if (!event?.type?.startsWith('call.')) return
      if (event.type === 'call.signal' || event.type === 'call.reaction') return
      void hereQuery.refetch()
      void joinedQuery.refetch()
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hereQuery.refetch, joinedQuery.refetch])

  // Keep the live copy fresh while in the call, so the participants panel and
  // the recording banner reflect what is actually true, not what was true when
  // we joined.
  useEffect(() => {
    if (!inCall) return
    const joined = joinedQuery.data
    if (joined?.id === inCall.id) {
      setInCall(joined)
      return
    }
    // `undefined` means the query has not answered yet — which is the state one
    // render after joining, and hanging up there would end the call the instant
    // it started. Only a settled answer counts.
    if (
      callHasEnded({
        inCallId: inCall.id,
        liveId: joined?.id ?? null,
        settled: joinedQuery.isSuccess,
      })
    ) {
      hangUpLocally()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedQuery.data, joinedQuery.isSuccess, inCall?.id])

  const hangUpLocally = () => {
    // Stop the tracks BEFORE clearing state. Dropping the reference first
    // leaves the camera light on with nothing left holding the handle.
    stream?.getTracks().forEach((tr) => tr.stop())
    setStream(null)
    setInCall(null)
    setPrejoin(false)
  }

  /**
   * Leaving because the page went away.
   *
   * The chat page is a lazy route, so clicking through to a task unmounts this
   * whole component. Without this the camera light stayed on with no UI left to
   * turn it off, and the server went on listing the person as present — so
   * everybody else kept a frozen tile of them and a peer connection to a page
   * that no longer existed.
   *
   * Kept in a ref because the cleanup must run once, on unmount, and see the
   * latest call rather than whatever was current when it was registered.
   */
  const onUnmount = useRef<{ stream: MediaStream | null; callId: string | null; leave: (id: string) => Promise<unknown> }>({
    stream: null,
    callId: null,
    leave: async () => {},
  })
  onUnmount.current = { stream, callId: inCall?.id ?? null, leave: actions.leave }
  useEffect(
    () => () => {
      const { stream: open, callId, leave } = onUnmount.current
      open?.getTracks().forEach((tr) => tr.stop())
      if (callId) void leave(callId).catch(() => {})
    },
    [],
  )

  const beginJoin = () => setPrejoin(true)

  const confirmJoin = async (media: MediaStream, chosen: CallBackground) => {
    if (!channelId) return
    setJoining(true)
    try {
      // start() joins the call already running here, so two people pressing
      // together land in the same one.
      const call = live ? await actions.join(live.id) : await actions.start({ channelId })
      setStream(media)
      setBackground(chosen)
      setInCall(call)
      setPrejoin(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('call.deviceError'))
    } finally {
      setJoining(false)
    }
  }

  const leave = async () => {
    const id = inCall?.id
    hangUpLocally()
    if (id) await actions.leave(id).catch(() => {})
  }

  const endForAll = async () => {
    const id = inCall?.id
    hangUpLocally()
    if (id) {
      const result = await actions.end(id).catch(() => null)
      if (result?.meetingId) toast.success(t('call.recordKept'))
    }
  }

  const toggleRecording = async () => {
    if (!inCall) return
    // §2.8 gap 11 — recording "back end se on karna parta hai" [20:45]. If the
    // workspace has this switched off, say so and offer to ask, rather than
    // letting the button do nothing. Checked before the consent gate: there is
    // no point asking everyone's permission for something that cannot happen.
    if (
      !inCall.recording &&
      !requireFeature({
        flag: FLAGS.AI_MEETING_NOTES,
        name: t('gate.aiNotetaker'),
        blurb: t('gate.aiNotetakerBlurb'),
      })
    ) {
      return
    }
    // Stopping needs no gate — only starting does, because only starting is
    // the thing people must be told about.
    if (inCall.recording) {
      setRecordingBusy(true)
      await actions.setRecording(inCall.id, false).catch(() => {})
      setRecordingBusy(false)
      return
    }
    setConsentOpen(true)
  }

  const confirmRecording = async () => {
    if (!inCall) return
    setRecordingBusy(true)
    try {
      await actions.setRecording(inCall.id, true)
      setConsentOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('call.deviceError'))
    } finally {
      setRecordingBusy(false)
    }
  }

  if (!channelId) return null
  const present = presentIn(live)

  return (
    <>
      {/* The header control: start one, or join the one already running. */}
      {!inCall && (
        <Button
          size="sm"
          variant={live ? 'default' : 'outline'}
          onClick={beginJoin}
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
      )}

      {prejoin && (
        <CallPreJoin
          onJoin={confirmJoin}
          onCancel={() => setPrejoin(false)}
          joining={joining}
          peopleAlreadyIn={present.length}
        />
      )}

      {inCall && me?.id && (
        <CallSurface
          call={inCall}
          myUserId={me.id}
          localStream={stream}
          background={background}
          onLeave={leave}
          onEnd={endForAll}
          onToggleRecording={toggleRecording}
          recordingBusy={recordingBusy}
          onInvite={onInvite}
          canRecord={canRecord}
        />
      )}

      {/*
        §2.8 gap 10 — the consent gate.

        Not a confirm dialog for safety's sake: in two-party-consent
        jurisdictions recording without telling people is unlawful, and this
        screen is where that is said out loud. It cannot be skipped or
        remembered, because "don't ask again" is exactly the thing that must
        not exist here.
      */}
      {consentOpen && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4"
          data-testid="call-consent"
        >
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t('call.consentTitle')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('call.consentBody')}</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setConsentOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={confirmRecording}
                disabled={recordingBusy}
                data-testid="call-consent-confirm"
                className={cn(recordingBusy && 'opacity-70')}
              >
                {t('call.consentConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* §2.8 gap 11 — the "Unlock AI Notetaker" modal, when the workspace has
          this switched off. Rendered here rather than inside the call surface
          so it survives minimising. */}
      {gateDialog}
    </>
  )
}
