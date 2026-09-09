import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, cn, toast } from '@rundesk/ui'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from '../../lib/i18n'
import { getRealtimeSocket } from '../../lib/realtime'
import { useAuthStore } from '../../store/auth'
import { useCallStore } from '../../store/call'
import { FLAGS } from '@rundesk/feature-flags'
import { useCallActions, useLiveCall, type Call } from '../../lib/calls-api'
import { callHasEnded } from '../../lib/call-lifecycle'
import { useFeatureGate } from '../feature-gate'
import { CallPreJoin, type CallBackground } from './call-prejoin'
import { CallSurface } from './call-surface'

/**
 * §G14-8 [20:12] — the live call, hosted by the shell so minimising works.
 *
 * Everything here used to live in `ChannelCall`, which the chat page mounted.
 * Clicking through to a task unmounted it and its cleanup hung up — so the
 * picture-in-picture dock rendered, looked exactly right, and ended the call
 * the moment you used it for the one thing it is for. That is worse than a
 * missing feature: it teaches you the control works.
 *
 * Mounted once, in the app shell. It now unmounts only when you leave /app
 * entirely, which is when the camera SHOULD stop — so the unmount handover
 * below is still load-bearing, it simply fires at the right boundary now.
 *
 * The header button stayed behind in `ChannelCall`, because "is there a call in
 * the channel I am looking at?" is a question about the page, and dies with it.
 */
export function CallHost({ workspaceId }: { workspaceId: string | null | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user)
  const actions = useCallActions(workspaceId ?? '')
  const { requireFeature, gateDialog } = useFeatureGate(workspaceId ?? '')

  const intent = useCallStore((s) => s.intent)
  const leaveIntent = useCallStore((s) => s.leaveIntent)
  const clearIntent = useCallStore((s) => s.clearIntent)
  const clearLeaveIntent = useCallStore((s) => s.clearLeaveIntent)
  const setActive = useCallStore((s) => s.setActive)

  const [joining, setJoining] = useState(false)
  /** The channel a pre-join is running for, or null when none is open. */
  const [prejoinFor, setPrejoinFor] = useState<CallJoinTarget | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [background, setBackground] = useState<CallBackground>('none')
  // §2.8 [19:46] — carried from the pre-join into the call, where the audio is.
  const [speakerId, setSpeakerId] = useState<string>('')
  const [inCall, setInCall] = useState<Call | null>(null)
  /** Whether recording may be offered here — the channel decided it at join. */
  const [canRecord, setCanRecord] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [recordingBusy, setRecordingBusy] = useState(false)

  /**
   * When we joined. Any query answer older than this predates the call and
   * cannot be evidence that it has ended — see callHasEnded.
   */
  const joinedAt = useRef(0)

  /**
   * The call we are IN, watched wherever we happen to be standing.
   *
   * Keyed on the call's own channel and never on "the channel on screen": in
   * the shell there is no channel on screen at all once you have browsed away,
   * and this drives the participants panel, the recording banner, and who we
   * open peer connections to.
   */
  const joinedQuery = useLiveCall(workspaceId ?? '', inCall?.channelId ?? null)

  // Someone else joining, leaving or recording refreshes the call we are in.
  useEffect(() => {
    const socket = getRealtimeSocket()
    const onEvent = (event: { type?: string; callId?: string }) => {
      if (!event?.type?.startsWith('call.')) return
      if (event.type === 'call.signal' || event.type === 'call.reaction') return
      /*
       * Only when there is a call to ask about.
       *
       * `useLiveCall` is disabled without a channel, but `refetch()` is
       * imperative and ignores `enabled` — so on every call.* event with no
       * call in progress this ran the query function anyway, interpolating a
       * missing id straight into the URL as `?channelId=null`. Postgres then
       * refused `channel_id = 'null'`, which is where the
       * `invalid input syntax for type uuid: "null"` in the CI log came from.
       */
      if (!inCall?.channelId) return
      void joinedQuery.refetch()
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
    // The channel is a dependency because the handler now reads it: without it
    // the closure could keep answering with the call we were in a moment ago.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedQuery.refetch, inCall?.channelId])

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
        answeredAt: joinedQuery.dataUpdatedAt,
        joinedAt: joinedAt.current,
      })
    ) {
      hangUpLocally()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedQuery.data, joinedQuery.isSuccess, joinedQuery.dataUpdatedAt, inCall?.id])

  // Publish what is in progress so page chrome can read it without owning it.
  useEffect(() => {
    setActive(inCall ? { id: inCall.id, channelId: inCall.channelId } : null)
  }, [inCall, setActive])

  const hangUpLocally = () => {
    // Stop the tracks BEFORE clearing state. Dropping the reference first
    // leaves the camera light on with nothing left holding the handle.
    stream?.getTracks().forEach((tr) => tr.stop())
    setStream(null)
    setInCall(null)
    setPrejoinFor(null)
  }

  /**
   * Leaving because the shell went away.
   *
   * This now unmounts only when you leave /app — signing out, or closing the
   * tab — rather than on every route change. Without it the camera light stays
   * on with no UI left to turn it off, and the server goes on listing the
   * person as present, so everybody else keeps a frozen tile of them and a peer
   * connection to a page that no longer exists.
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

  /*
   * Act on a page's intent, then clear it — so pressing Join twice is two
   * joins rather than one stuck flag.
   */
  useEffect(() => {
    if (!intent) return
    if (inCall && intent.callId && inCall.id !== intent.callId) {
      // Being in another call is the ordinary state this feature is built for —
      // minimise one and browse. Switching without asking would drop the one
      // they are actually in.
      toast(t('call.alreadyInAnother'))
    } else if (inCall) {
      toast(t('call.alreadyInAnother'))
    } else {
      setCanRecord(intent.canRecord)
      setPrejoinFor({ channelId: intent.channelId, callId: intent.callId ?? null })
    }
    clearIntent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent])

  /*
   * A leave raised by a page. The id comes from the card because local state
   * may not have one — after a refresh the server still lists you as present
   * while nothing in the browser remembers which call that was.
   */
  useEffect(() => {
    if (!leaveIntent) return
    void leave(leaveIntent.callId)
    clearLeaveIntent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveIntent])

  const confirmJoin = async (media: MediaStream, chosen: CallBackground, speaker: string) => {
    if (!prejoinFor) return false
    setJoining(true)
    try {
      // Joining an id when the page had one, else starting — so two people
      // pressing together land in the same call.
      const call = prejoinFor.callId
        ? await actions.join(prejoinFor.callId)
        : await actions.start({ channelId: prejoinFor.channelId })
      // Stamped BEFORE the state that starts the watcher, so the first render
      // with a call in hand already knows how old an answer has to be to count.
      joinedAt.current = Date.now()
      setStream(media)
      setBackground(chosen)
      setSpeakerId(speaker)
      setInCall(call)
      setPrejoinFor(null)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('call.deviceError'))
      // Reported rather than swallowed: the pre-join dialog is still open and
      // has to take its camera back, or its Join button is inert from here on.
      return false
    } finally {
      setJoining(false)
    }
  }

  const leave = async (fallbackId?: string) => {
    const id = inCall?.id ?? fallbackId
    hangUpLocally()
    if (id) await actions.leave(id).catch(() => {})
  }

  const endForAll = async () => {
    const id = inCall?.id
    hangUpLocally()
    if (id) {
      const result = await actions.end(id).catch(() => null)
      /*
       * `pending` is not the same as "no record". Two people hanging up in the
       * same moment means one loses the race to end the call, and the winner
       * has no meeting id to report until the notes come back seconds later.
       * Both states are worth a word; only a real failure stays silent.
       */
      if (result?.meetingId) toast.success(t('call.recordKept'))
      else if (result?.pending) toast.success(t('call.recordComing'))
    }
  }

  const toggleRecording = async () => {
    if (!inCall) return
    // §2.8 gap 11 — recording "back end se on karna parta hai" [20:45]. Checked
    // before the consent gate: there is no point asking everyone's permission
    // for something that cannot happen.
    if (
      !inCall.recording &&
      !requireFeature({
        flag: FLAGS.AI_MEETING_NOTES,
        name: t('gate.aiNotetaker'),
        blurb: t('gate.aiNotetakerBlurb'),
        // §V2-13 — what it actually does, so the decision to go and ask is an
        // informed one. Each line is something AI notes already do inside a
        // Rundesk call; none of it is aspirational.
        highlights: [
          t('gate.aiNotetakerPoint1'),
          t('gate.aiNotetakerPoint2'),
          t('gate.aiNotetakerPoint3'),
        ],
      })
    ) {
      return
    }
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

  /*
   * §G14-8 — Invite takes you back to the room.
   *
   * The Add People dialog belongs to the chat page, and the whole point of this
   * host is that you may not be on it. Navigating to the call's own channel is
   * the honest version: it puts you where the control exists rather than
   * pretending it is here.
   */
  const invite = () => {
    // A call need not have a channel — a meeting starts one that belongs to no
    // room. There is nowhere to send you then, and sending you to /chat with an
    // empty channel would be a button that lands you nowhere in particular.
    if (!workspaceId || !inCall?.channelId) return
    void navigate({
      to: '/app/$workspaceId/chat',
      params: { workspaceId },
      search: { channel: inCall.channelId },
    })
  }

  if (!workspaceId) return null

  return (
    <>
      {prejoinFor && (
        <CallPreJoin
          onJoin={confirmJoin}
          onCancel={() => setPrejoinFor(null)}
          joining={joining}
          peopleAlreadyIn={0}
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
          onInvite={invite}
          canRecord={canRecord}
          speakerId={speakerId}
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

      {/* The "Unlock AI Notetaker" modal, when the workspace has this switched
          off. Rendered here rather than inside the call surface so it survives
          minimising. */}
      {gateDialog}
    </>
  )
}

/** Which call a pre-join is running for. A null `callId` means "start one". */
type CallJoinTarget = { channelId: string; callId: string | null }
