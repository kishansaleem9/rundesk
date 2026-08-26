import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Badge, cn } from '@rundesk/ui'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Users,
  Minimize2,
  Maximize2,
  Circle,
  Smile,
  UserPlus,
  AlertTriangle,
} from 'lucide-react'
import { useTranslation } from '../../lib/i18n'
import { getRealtimeSocket } from '../../lib/realtime'
import { useWebRtcCall } from '../../lib/use-webrtc-call'
import { useCallRecording } from '../../lib/use-call-recording'
import { capturerFor } from '../../lib/call-recording'
import { presentIn, type Call } from '../../lib/calls-api'
import { EmojiPicker } from '../emoji/emoji-picker'
import { BACKGROUND_TINT, type CallBackground } from './call-prejoin'

/** How long a reaction stays on screen. Long enough to see, short enough to pass. */
const REACTION_MS = 3000

interface FloatingReaction {
  id: number
  userId: string
  emoji: string
}

/**
 * §2.8 — the call surface, `[19:40–21:15]`.
 *
 * Everything she demonstrates from inside a call: the tiles, mute and camera,
 * screen share, the participants panel with Invite, the reactions overlay, and
 * minimising to a corner so you can keep talking while you browse.
 *
 * Docked rather than routed. A call that lived at a URL would end the moment
 * someone clicked a task, which is the opposite of what "minimise" is for.
 */
export function CallSurface({
  call,
  myUserId,
  localStream,
  background,
  onLeave,
  onEnd,
  onToggleRecording,
  recordingBusy,
  onInvite,
  canRecord,
}: {
  call: Call
  myUserId: string
  localStream: MediaStream | null
  background: CallBackground
  onLeave: () => void
  onEnd: () => void
  onToggleRecording: () => void
  recordingBusy: boolean
  onInvite: () => void
  canRecord: boolean
}) {
  const { t } = useTranslation()
  const [minimised, setMinimised] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [showPeople, setShowPeople] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const localRef = useRef<HTMLVideoElement | null>(null)
  const screenStream = useRef<MediaStream | null>(null)

  const present = presentIn(call)
  const { peers, failedPeers, hasTurn, replaceVideoTrack, tooManyPeers } = useWebRtcCall({
    callId: call.id,
    myUserId,
    peerIds: present.map((p) => p.userId),
    localStream,
  })

  /*
   * §2.8 gap 10 — AI Notes, while the banner is up.
   *
   * Everyone transcribes their own microphone, which is what lets the notes say
   * who said what. Exactly one person captures the mixed recording — every
   * participant writing the same call would produce one copy per person, all
   * but one of them wasted.
   *
   * Elected from who is PRESENT, not pinned to whoever started the call. Pinned
   * to the starter, a host who left mid-recording took the recording with them:
   * the banner stayed up, the transcript kept flowing, and nothing was captured
   * for the rest of the call. The election re-runs the moment the participant
   * list changes, so the job simply moves.
   */
  const capturer = capturerFor(present.map((p) => p.userId))
  const { captions, unavailable: notesUnavailable } = useCallRecording({
    workspaceId: call.workspaceId,
    callId: call.id,
    recording: call.recording,
    localStream,
    peerStreams: peers.map((p) => p.stream),
    captureAudio: myUserId === capturer,
  })

  /**
   * The minimised dock's own preview.
   *
   * A callback ref, not an effect: that <video> only exists while minimised, so
   * on mount there was nothing to attach to and the effect's `[localStream]`
   * deps never changed afterwards. The corner tile was black for the whole
   * call, and expanding and re-minimising did not fix it.
   */
  const attachLocal = useCallback(
    (el: HTMLVideoElement | null) => {
      localRef.current = el
      if (el && localStream) el.srcObject = localStream
    },
    [localStream],
  )

  // Reactions from everyone else, cleared on a timer.
  useEffect(() => {
    const socket = getRealtimeSocket()
    const onEvent = (event: { type?: string; callId?: string; userId?: string; emoji?: string }) => {
      if (event?.type !== 'call.reaction' || event.callId !== call.id || !event.emoji) return
      const id = Date.now() + Math.random()
      setReactions((prev) => [...prev, { id, userId: event.userId ?? '', emoji: event.emoji! }])
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), REACTION_MS)
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [call.id])

  const sendReaction = (emoji: string) => {
    getRealtimeSocket().emit('call.reaction', {
      callId: call.id,
      workspaceId: call.workspaceId,
      emoji,
    })
    // Shown locally too: waiting for the round trip to see your own reaction
    // makes the button feel broken.
    const id = Date.now() + Math.random()
    setReactions((prev) => [...prev, { id, userId: myUserId, emoji }])
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), REACTION_MS)
    setShowReactions(false)
  }

  const toggleMic = () => {
    const next = !micOn
    setMicOn(next)
    localStream?.getAudioTracks().forEach((tr) => (tr.enabled = next))
  }
  const toggleCam = () => {
    const next = !camOn
    setCamOn(next)
    localStream?.getVideoTracks().forEach((tr) => (tr.enabled = next))
  }

  /**
   * §2.8 — "koi tab share karni hai, window share karni hai, ya poori screen"
   * `[20:12]`. The browser's own picker offers all three; we ask for display
   * media and it does the choosing, which is the only way a page is allowed to.
   */
  const toggleShare = async () => {
    if (sharing) {
      screenStream.current?.getTracks().forEach((tr) => tr.stop())
      screenStream.current = null
      setSharing(false)
      await replaceVideoTrack(localStream?.getVideoTracks()[0] ?? null)
      return
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      screenStream.current = display
      setSharing(true)
      const track = display.getVideoTracks()[0]
      await replaceVideoTrack(track)
      // Chrome's own "Stop sharing" bar ends the track without telling us, so
      // the button would stay lit and the camera never come back.
      track.onended = () => {
        screenStream.current = null
        setSharing(false)
        void replaceVideoTrack(localStream?.getVideoTracks()[0] ?? null)
      }
    } catch {
      // Cancelling the picker is a normal thing to do, not an error.
    }
  }

  useEffect(
    () => () => {
      screenStream.current?.getTracks().forEach((tr) => tr.stop())
    },
    [],
  )

  const nameOf = (userId: string) =>
    present.find((p) => p.userId === userId)?.name ??
    present.find((p) => p.userId === userId)?.email ??
    t('call.someone')

  if (minimised) {
    return (
      <div
        className="fixed bottom-4 right-4 z-[55] w-64 rounded-xl border border-border/60 bg-card shadow-xl overflow-hidden"
        data-testid="call-minimised"
      >
        <div className="relative aspect-video bg-black">
          <video ref={attachLocal} autoPlay playsInline muted className="h-full w-full object-cover" />
          {call.recording && (
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-red-600/90 px-1.5 py-0.5 text-[10px] text-white">
              <Circle className="h-2 w-2 fill-current" />
              {t('call.recording')}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 px-2 py-1.5">
          <span className="text-[11px] text-muted-foreground truncate">
            {t('call.peopleCount', { count: present.length })}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={toggleMic} title={t('call.mic')} className="p-1 text-muted-foreground hover:text-foreground">
              {micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5 text-destructive" />}
            </button>
            <button
              onClick={() => setMinimised(false)}
              title={t('call.expand')}
              data-testid="call-expand"
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={onLeave} title={t('call.leave')} className="p-1 text-destructive">
              <PhoneOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-black/95" data-testid="call-surface">
      <header className="flex items-center gap-3 px-4 py-2.5 text-white/90">
        <span className="text-sm font-medium truncate">{call.title ?? t('call.title')}</span>
        {/* The recording banner is deliberately loud and always present — it is the
            consent notice, not a status chip. */}
        {call.recording && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-medium"
            data-testid="call-recording-banner"
          >
            <Circle className="h-2.5 w-2.5 fill-current animate-pulse" />
            {t('call.recordingEveryone')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {tooManyPeers && (
            <Badge variant="secondary" className="text-[10px]" data-testid="call-too-many">
              {t('call.tooMany')}
            </Badge>
          )}
          {failedPeers.length > 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-300" data-testid="call-failed-peers">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {hasTurn ? t('call.someoneUnreachable') : t('call.needsTurn')}
            </Badge>
          )}
          {/* §2.8 gap 10 — say when half of AI Notes cannot run here rather
              than leaving a recording banner over a browser that is writing
              nothing. Safari has no speech recognition; some builds have no
              MediaRecorder container we can write. */}
          {call.recording && notesUnavailable && (
            <Badge variant="outline" className="text-[10px] text-amber-300" data-testid="call-notes-limited">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {notesUnavailable === 'speech' ? t('call.noTranscription') : t('call.noRecorder')}
            </Badge>
          )}
          <button onClick={() => setMinimised(true)} title={t('call.minimise')} data-testid="call-minimise" className="p-1 text-white/70 hover:text-white">
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative flex-1 min-h-0 p-3">
        <div
          className={cn(
            'grid h-full gap-2',
            peers.length === 0 ? 'grid-cols-1' : peers.length < 4 ? 'grid-cols-2' : 'grid-cols-3',
          )}
          data-testid="call-tiles"
        >
          <Tile
            label={t('call.you')}
            stream={localStream}
            muted
            videoOff={!camOn}
            background={background}
          />
          {peers.map((p) => (
            <Tile key={p.userId} label={nameOf(p.userId)} stream={p.stream} background="none" />
          ))}
        </div>

        {/* Reactions float over the tiles and then are gone — nothing is kept,
            because a channel full of thumbs-ups nobody meant to save is worse
            than no reactions at all. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="call-reactions">
          {reactions.map((r) => (
            <span
              key={r.id}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 text-3xl animate-[float_3s_ease-out_forwards]"
              style={{ left: `${20 + ((r.id * 37) % 60)}%` }}
            >
              {r.emoji}
            </span>
          ))}
        </div>

        {/*
          §2.8 gap 10 — live captions.
          The visible proof that the notes are being written from something
          real. A recording banner with nothing happening under it is the kind
          of promise people stop believing.
        */}
        {call.recording && captions.length > 0 && (
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 w-[min(680px,90%)] -translate-x-1/2 space-y-1"
            data-testid="call-captions"
          >
            {captions.map((line) => (
              <p
                key={line.id}
                className="rounded-lg bg-black/70 px-3 py-1.5 text-center text-[13px] leading-snug text-white/90"
              >
                {line.text}
              </p>
            ))}
          </div>
        )}

        {showPeople && (
          <aside
            className="absolute right-3 top-3 bottom-3 w-64 rounded-xl border border-white/15 bg-card/95 p-3 overflow-y-auto"
            data-testid="call-participants"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t('call.participants')}</span>
              <Button size="sm" variant="outline" onClick={onInvite} data-testid="call-invite">
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                {t('call.invite')}
              </Button>
            </div>
            <ul className="space-y-1">
              {present.map((p) => (
                <li key={p.userId} className="flex items-center gap-2 text-xs py-1">
                  <span className="h-6 w-6 rounded-full bg-muted grid place-items-center text-[10px] shrink-0">
                    {(p.name ?? p.email ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{p.name ?? p.email}</span>
                  {p.userId === call.startedById && (
                    <Badge variant="secondary" className="text-[9px] ml-auto shrink-0">
                      {t('call.host')}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="flex items-center justify-center gap-2 px-4 py-3">
        <Ctl on={micOn} onClick={toggleMic} testid="call-mic" title={t('call.mic')}>
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Ctl>
        <Ctl on={camOn} onClick={toggleCam} testid="call-cam" title={t('call.camera')}>
          {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Ctl>
        <Ctl on={sharing} onClick={toggleShare} testid="call-share" title={t('call.share')}>
          <MonitorUp className="h-4 w-4" />
        </Ctl>

        <div className="relative">
          <Ctl on={showReactions} onClick={() => setShowReactions((v) => !v)} testid="call-react" title={t('call.react')}>
            <Smile className="h-4 w-4" />
          </Ctl>
          {/*
            §2.8 gap 7 — the same picker the chat composer opens, which is what
            the reference shows floating over the tiles mid-call. Frequently
            Used is the first section, so the one-tap 👍 is still one tap.

            No custom emoji here: a workspace emoji is an image, and the float
            overlay below renders the character it is given, so a custom one
            would drift up the screen as the literal text ":shipit:".
          */}
          {showReactions && (
            <div
              className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-xl border border-white/15 bg-popover shadow-lg"
              data-testid="call-reaction-picker"
            >
              <EmojiPicker onSelect={sendReaction} autoFocus={false} />
            </div>
          )}
        </div>

        <Ctl on={showPeople} onClick={() => setShowPeople((v) => !v)} testid="call-people" title={t('call.participants')}>
          <Users className="h-4 w-4" />
          <span className="ml-1 text-xs">{present.length}</span>
        </Ctl>

        {canRecord && (
          <Ctl
            on={call.recording}
            danger={call.recording}
            onClick={onToggleRecording}
            testid="call-record"
            title={call.recording ? t('call.stopRecording') : t('call.startRecording')}
            disabled={recordingBusy}
          >
            <Circle className={cn('h-4 w-4', call.recording && 'fill-current')} />
          </Ctl>
        )}

        <Button variant="destructive" onClick={onLeave} data-testid="call-leave" className="ml-2">
          <PhoneOff className="h-4 w-4 mr-1.5" />
          {t('call.leave')}
        </Button>
        {myUserId === call.startedById && (
          <Button variant="ghost" onClick={onEnd} data-testid="call-end" className="text-white/70">
            {t('call.endForAll')}
          </Button>
        )}
      </footer>
    </div>
  )
}

function Tile({
  label,
  stream,
  muted,
  videoOff,
  background,
}: {
  label: string
  stream: MediaStream | null
  muted?: boolean
  videoOff?: boolean
  background: CallBackground
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return (
    <div
      className={cn('relative rounded-xl overflow-hidden bg-black min-h-0', BACKGROUND_TINT[background])}
      data-testid="call-tile"
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          'h-full w-full object-cover',
          background === 'blur' && 'blur-md',
          videoOff && 'invisible',
        )}
      />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
        {label}
      </span>
    </div>
  )
}

function Ctl({
  children,
  on,
  danger,
  onClick,
  title,
  testid,
  disabled,
}: {
  children: React.ReactNode
  on: boolean
  danger?: boolean
  onClick: () => void
  title: string
  testid: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={on}
      data-testid={testid}
      disabled={disabled}
      className={cn(
        'inline-flex items-center rounded-full px-3 py-2 transition-colors disabled:opacity-50',
        danger
          ? 'bg-red-600 text-white'
          : on
            ? 'bg-white/15 text-white'
            : 'bg-white/5 text-white/60 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}
