import { useEffect, useRef, useState } from 'react'
import { Button, cn } from '@rundesk/ui'
import { Mic, MicOff, Video, VideoOff, Loader2, AlertTriangle } from 'lucide-react'
import { useTranslation } from '../../lib/i18n'
import { takeStream } from '../../lib/call-lifecycle'

/**
 * §2.8 — the pre-join dialog, `[19:40]`.
 *
 *   "BACKGROUND colours wagera select down kar sakte ho" — a camera preview,
 *   a background choice, and the device pickers, before anybody sees you.
 *
 * The point of a pre-join screen is that nothing is live yet. The preview
 * stream is local only; it is handed to the call on Join and never before, so
 * "check your hair first" actually means that.
 *
 * Backgrounds are a blur or a flat colour. Replacing a background with an
 * image needs person-segmentation running per frame, which is a model download
 * and a constant GPU cost — offering a picker that quietly did nothing would
 * be worse than offering the two effects that genuinely work.
 */
export type CallBackground = 'none' | 'blur' | 'navy' | 'forest' | 'plum'

const BACKGROUNDS: Array<{ id: CallBackground; className: string }> = [
  { id: 'none', className: '' },
  { id: 'blur', className: 'blur-md' },
  { id: 'navy', className: '' },
  { id: 'forest', className: '' },
  { id: 'plum', className: '' },
]

export const BACKGROUND_TINT: Record<CallBackground, string> = {
  none: '',
  blur: '',
  navy: 'bg-[#0c215d]',
  forest: 'bg-[#14432a]',
  plum: 'bg-[#3d1f47]',
}

/**
 * §2.8 `[19:46]` — "aur yahan SPEAKER ka option hai."
 *
 * Output routing is the one device choice you cannot fix once the call has
 * started: a mic or camera on the wrong device is something you can see and
 * correct, whereas the wrong speaker means you hear nothing and everyone else
 * hears you asking whether anyone is there.
 *
 * Gated on support rather than always drawn. `setSinkId` is Chromium-and-Edge
 * (Firefox keeps it behind a pref, Safari has never shipped it), and a picker
 * that changed nothing would be worse than no picker at all — the person would
 * choose their headphones, hear nothing, and have no reason to suspect the
 * control was decorative.
 */
export const canPickSpeaker = (): boolean =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

/** Route an element's audio at a device, ignoring the ones that cannot be. */
export async function applySink(el: HTMLMediaElement | null, deviceId: string): Promise<void> {
  if (!el || !deviceId || !canPickSpeaker()) return
  try {
    await (el as HTMLMediaElement & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId)
  } catch {
    // A device unplugged between enumerate and here, or one the page is not
    // allowed to address. The default output still works; failing loudly over
    // it would take down a call that is otherwise fine.
  }
}

export function CallPreJoin({
  onJoin,
  onCancel,
  joining,
  peopleAlreadyIn,
}: {
  /** Resolves false when the join did not happen, so the preview comes back. */
  onJoin: (
    stream: MediaStream,
    background: CallBackground,
    speakerId: string,
  ) => void | boolean | Promise<void | boolean>
  onCancel: () => void
  joining: boolean
  peopleAlreadyIn: number
}) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [devices, setDevices] = useState<{
    mics: MediaDeviceInfo[]
    cams: MediaDeviceInfo[]
    speakers: MediaDeviceInfo[]
  }>({ mics: [], cams: [], speakers: [] })
  const [micId, setMicId] = useState<string>('')
  const [camId, setCamId] = useState<string>('')
  const [speakerId, setSpeakerId] = useState<string>('')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [background, setBackground] = useState<CallBackground>('none')
  const [error, setError] = useState('')
  // Whether there is a preview to hand over. State, not the ref: reading a ref
  // during render does not re-render, so the Join button only ever un-greyed
  // when something else happened to cause one.
  const [ready, setReady] = useState(false)

  // Acquire the preview, and re-acquire it when a different device is picked.
  useEffect(() => {
    let cancelled = false
    const acquire = async () => {
      setError('')
      setReady(false)
      try {
        // Stop the previous stream FIRST. Holding two camera handles keeps the
        // light on after switching and, on some machines, fails the second
        // getUserMedia outright.
        streamRef.current?.getTracks().forEach((tr) => tr.stop())
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: micId ? { deviceId: { exact: micId } } : true,
          video: camId ? { deviceId: { exact: camId } } : true,
        })
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        streamRef.current = stream
        setReady(true)
        if (videoRef.current) videoRef.current.srcObject = stream

        // Labels are blank until permission is granted, so the list is only
        // worth reading after getUserMedia has resolved.
        const all = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setDevices({
          mics: all.filter((d) => d.kind === 'audioinput'),
          cams: all.filter((d) => d.kind === 'videoinput'),
          // Enumerated from the same call: a browser that reports outputs at
          // all reports them here, and one that does not returns an empty list
          // rather than throwing.
          speakers: all.filter((d) => d.kind === 'audiooutput'),
        })
      } catch (err) {
        if (cancelled) return
        // Named plainly: "denied" and "no camera attached" are different
        // problems with different fixes, and a generic failure helps with
        // neither.
        const name = (err as { name?: string })?.name
        setError(
          name === 'NotAllowedError'
            ? t('call.permissionDenied')
            : name === 'NotFoundError'
              ? t('call.noDevices')
              : t('call.deviceError'),
        )
      }
    }
    void acquire()
    return () => {
      cancelled = true
    }
  }, [micId, camId, t])

  /*
   * §2.8 [19:44] — "Aap ke VOICE RECORDING wali options hain — check for the
   * high quality voice."
   *
   * The frames show what "check" means: a live input-level bar under the
   * microphone row. Picking a mic tells you which device is selected; it tells
   * you nothing about whether it is actually hearing you, which is the thing
   * people get wrong — muted at the OS level, the wrong input on a dock, a
   * headset that connected for audio-out only. A bar that moves when you speak
   * is the whole answer, and it has to be here rather than in the call,
   * because the point is to find out BEFORE anyone is listening.
   *
   * Web Audio rather than a track property: MediaStreamTrack has no level. The
   * analyser is torn down with the stream it was built from, so switching mic
   * does not leave a second context running against a dead track.
   */
  const [micLevel, setMicLevel] = useState(0)
  useEffect(() => {
    if (!ready || !micOn) {
      setMicLevel(0)
      return
    }
    const stream = streamRef.current
    const track = stream?.getAudioTracks()[0]
    if (!stream || !track) return

    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    let ctx: AudioContext
    try {
      ctx = new Ctx()
    } catch {
      // No Web Audio here; the picker still works, it just cannot show a level.
      return
    }
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const buf = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      // Peak deviation from silence (128), not an average: an average over a
      // whole frame reads near-zero for ordinary speech and the bar looks dead.
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
      setMicLevel(Math.min(1, peak / 96))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      source.disconnect()
      void ctx.close().catch(() => {})
    }
  }, [ready, micOn, micId])

  // Whatever happens, do not leave the camera running.
  //
  // This only ever stops a PREVIEW. Joining hands the stream to the call and
  // nulls the ref first — without that handover this cleanup killed the very
  // stream it had just passed on, because pressing Join unmounts this dialog in
  // the same commit that mounts the call. The camera light went out, every
  // track was already 'ended' by the time addTrack saw it, and both people sat
  // looking at a connected call with nothing in it and no error anywhere.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
    },
    [],
  )

  /**
   * Hand the preview over. After this the call owns it, and we stop nothing.
   *
   * Unless the join fails — the channel was deleted, the server said no — in
   * which case we take it back. Handing it over unconditionally left the
   * dialog still open with an empty ref: the Join button looked enabled,
   * pressed to no effect because there was nothing left to hand over, and the
   * camera it had let go of was running with no owner to stop it.
   */
  // Only when the browser can act on the choice AND has something to offer.
  const showSpeakers = canPickSpeaker() && devices.speakers.length > 0

  const handOff = async () => {
    const stream = takeStream(streamRef)
    if (!stream) return
    const joined = await onJoin(stream, background, speakerId)
    if (joined === false) streamRef.current = stream
  }

  const toggleMic = () => {
    const next = !micOn
    setMicOn(next)
    streamRef.current?.getAudioTracks().forEach((tr) => (tr.enabled = next))
  }
  const toggleCam = () => {
    const next = !camOn
    setCamOn(next)
    streamRef.current?.getVideoTracks().forEach((tr) => (tr.enabled = next))
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      data-testid="call-prejoin"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card p-5 space-y-4">
        <h2 className="text-lg font-semibold">{t('call.readyToJoin')}</h2>

        <div
          className={cn(
            'relative aspect-video w-full overflow-hidden rounded-xl bg-black',
            BACKGROUND_TINT[background],
          )}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            data-testid="call-prejoin-preview"
            className={cn(
              'h-full w-full object-cover',
              background === 'blur' && 'blur-md',
              !camOn && 'invisible',
            )}
          />
          {!camOn && (
            <div className="absolute inset-0 grid place-items-center text-xs text-white/70">
              {t('call.cameraOff')}
            </div>
          )}
          {error && (
            <div className="absolute inset-0 grid place-items-center p-4 text-center">
              <p className="text-xs text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {error}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={micOn ? 'outline' : 'destructive'}
            onClick={toggleMic}
            data-testid="call-prejoin-mic"
          >
            {micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            variant={camOn ? 'outline' : 'destructive'}
            onClick={toggleCam}
            data-testid="call-prejoin-cam"
          >
            {camOn ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
          </Button>
          <div className="ml-auto flex items-center gap-1.5" data-testid="call-prejoin-backgrounds">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                title={t(`call.background.${b.id}` as never)}
                aria-label={t(`call.background.${b.id}` as never)}
                onClick={() => setBackground(b.id)}
                className={cn(
                  'h-6 w-6 rounded-full border-2 transition-colors',
                  BACKGROUND_TINT[b.id] || 'bg-muted',
                  background === b.id ? 'border-primary' : 'border-transparent',
                )}
              />
            ))}
          </div>
        </div>

        <div className={cn('grid gap-2', showSpeakers ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <select
            value={micId}
            onChange={(e) => setMicId(e.target.value)}
            data-testid="call-prejoin-mic-select"
            className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm"
          >
            <option value="">{t('call.defaultMic')}</option>
            {devices.mics.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || t('call.unnamedMic')}
              </option>
            ))}
          </select>
          {/* §2.8 [19:44] — the level bar the frames show under the mic row.
              Sits with the mic select rather than beside it, so what it is
              reporting on is never in doubt. */}
          <div className="sm:col-span-1">
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              data-testid="call-prejoin-mic-level"
              role="meter"
              aria-label={t('call.micLevel')}
              aria-valuenow={Math.round(micLevel * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {micOn ? t('call.micLevelHint') : t('call.micOffHint')}
            </p>
          </div>
          <select
            value={camId}
            onChange={(e) => setCamId(e.target.value)}
            data-testid="call-prejoin-cam-select"
            className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm"
          >
            <option value="">{t('call.defaultCamera')}</option>
            {devices.cams.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || t('call.unnamedCamera')}
              </option>
            ))}
          </select>
          {showSpeakers && (
            <select
              value={speakerId}
              onChange={(e) => setSpeakerId(e.target.value)}
              data-testid="call-prejoin-speaker-select"
              className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm"
            >
              <option value="">{t('call.defaultSpeaker')}</option>
              {devices.speakers.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || t('call.unnamedSpeaker')}
                </option>
              ))}
            </select>
          )}
        </div>

        {peopleAlreadyIn > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('call.alreadyIn', { count: peopleAlreadyIn })}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            data-testid="call-prejoin-join"
            disabled={joining || !ready}
            onClick={() => void handOff()}
          >
            {joining && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t('call.join')}
          </Button>
        </div>
      </div>
    </div>
  )
}
