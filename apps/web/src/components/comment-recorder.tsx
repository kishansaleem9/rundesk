/**
 * §V2-05 — recording from a task comment composer.
 *
 * `[04:14]`–`[04:45]` is a voice note; frame `04:56`'s "+" menu offers
 * `Record a Video Clip`; frame `05:35` is the finished clip playing inside the
 * comment. This component is the recording half of that: the mic, the "+"
 * menu's clip item, the timer while it runs, and the strip that appears when it
 * stops.
 *
 * THE STRIP HAS TWO BUTTONS. Frame `04:16`: `Voice note` and `Transcribe`,
 * with "Insert as text" as the tooltip above `Transcribe`. That tooltip is the
 * explanation of what Transcribe does, and reading it as a third button is the
 * mistake this file's `title` attribute is placed to prevent repeating.
 *
 * WHY IT LISTENS WHILE IT RECORDS. Rundesk transcribes in the browser, with
 * the Web Speech API, which listens to a live microphone — it cannot be handed
 * a finished file. So both artefacts are produced at once: `MediaRecorder`
 * writes the audio and `SpeechRecognition` accumulates the words, and the strip
 * afterwards is the person choosing which one to keep. Recording first and
 * transcribing after would mean either shipping the audio to a service (a
 * different product decision, and a worse one for a private voice note) or
 * making `Transcribe` a button that asks the person to say it all again.
 *
 * AND THAT IS WHY THE LANGUAGE IS RIGHT. `[04:26]` is her complaint that
 * ClickUp's transcription writes Urdu in Devanagari. Because the listening is
 * ours, `useSpeechRecognition({ locale })` sets the recognition language from
 * the app locale through `localeToSpeechLang`, where `ur` means `ur-PK`. The
 * defect she flagged is avoided by using the mapping that already exists, and
 * the one way to reintroduce it is to transcribe here by some other route.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, cn, toast } from '@rundesk/ui'
import { Mic, Square, Video, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import { useSpeechRecognition } from '../lib/use-speech-recognition'
import {
  formatDuration,
  isUsableRecording,
  maxSecondsFor,
  pickComposerType,
  recordingFileName,
  appendTranscript,
  type RecordingKind,
} from '../lib/composer-recording'
import { RECORDER_CHUNK_MS } from '../lib/call-recording'

type Finished = {
  kind: RecordingKind
  file: File
  url: string
  seconds: number
  transcript: string
}

export function CommentRecorder({
  onAttach,
  onTranscript,
  className,
}: {
  /** Hand the finished recording to the composer as an attachment. */
  onAttach: (file: File) => void
  /** Put the spoken words into the composer's text box. */
  onTranscript: (append: (existing: string) => string) => void
  className?: string
}) {
  const { t, locale } = useTranslation()
  const [kind, setKind] = useState<RecordingKind | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [finished, setFinished] = useState<Finished | null>(null)
  const [starting, setStarting] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const transcriptRef = useRef<string>('')
  const startedAtRef = useRef<number>(0)

  /*
   * Accumulated in a ref rather than state: a final result can land in the same
   * tick as the stop, and a state update queued then would not be visible to
   * the `onstop` handler that has to package it.
   */
  const speech = useSpeechRecognition({
    locale,
    continuous: true,
    onResult: (line) => {
      transcriptRef.current = appendTranscript(transcriptRef.current, line)
    },
  })
  // `speech` identity changes each render; the stop handler needs the current one.
  const speechRef = useRef(speech)
  speechRef.current = speech

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    // Order matters: the recorder's `onstop` reads the transcript, so speech is
    // stopped first and its last final result lands before the packaging runs.
    speechRef.current.stop()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    else releaseStream()
  }, [releaseStream])

  /*
   * The clock, and the cap. A recording nobody stopped stops itself.
   *
   * Sampled four times a second but only SET when the whole second changes.
   * Setting it every tick re-rendered the strip 4×/s while nothing on screen
   * differed, which is wasted work and, more importantly, keeps the Stop button
   * permanently "just moved" for anything measuring layout stability — the
   * browser's own scroll-into-view included.
   */
  useEffect(() => {
    if (!kind) return
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setSeconds((prev) => (prev === elapsed ? prev : elapsed))
      if (elapsed >= maxSecondsFor(kind)) {
        toast.info(t('commentRecorder.capReached', { minutes: Math.round(maxSecondsFor(kind) / 60) }))
        stop()
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [kind, stop, t])

  /* A recording still running when the sheet closes would hold the microphone. */
  useEffect(
    () => () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    },
    [],
  )

  const start = async (next: RecordingKind) => {
    if (kind || starting) return
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) {
      toast.error(t('commentRecorder.unsupported'))
      return
    }
    const mimeType = pickComposerType(next, (type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType) {
      // No container this browser can write. Saying so beats recording a
      // zero-byte file and attaching it.
      toast.error(t('commentRecorder.unsupported'))
      return
    }
    setStarting(true)
    let stream: MediaStream
    try {
      stream =
        next === 'clip'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Denied, dismissed, or no device — all three arrive as a rejection and
      // all three mean the same thing to the person: nothing is recording.
      setStarting(false)
      toast.error(next === 'clip' ? t('commentRecorder.clipDenied') : t('commentRecorder.micDenied'))
      return
    }
    setStarting(false)

    // Discard whatever the previous recording left behind, including its object
    // URL — a preview kept alive here is a leak for the life of the page.
    if (finished) URL.revokeObjectURL(finished.url)
    setFinished(null)
    chunksRef.current = []
    transcriptRef.current = ''
    startedAtRef.current = Date.now()
    setSeconds(0)

    const recorder = new MediaRecorder(stream, { mimeType })
    recorderRef.current = recorder
    streamRef.current = stream
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      const blob = new Blob(chunksRef.current, { type: mimeType })
      releaseStream()
      recorderRef.current = null
      setKind(null)
      if (!isUsableRecording(blob.size)) {
        toast.error(t('commentRecorder.tooShort'))
        return
      }
      const file = new File([blob], recordingFileName(next, mimeType, new Date()), { type: mimeType })
      setFinished({
        kind: next,
        file,
        url: URL.createObjectURL(blob),
        seconds: elapsed,
        transcript: transcriptRef.current,
      })
    }
    /*
     * Screen sharing has its own "Stop sharing" button, outside the page. When
     * it is used the track ends and nothing here would notice — the timer would
     * keep counting against a dead stream.
     */
    stream.getVideoTracks()[0]?.addEventListener('ended', () => stop())

    recorder.start(RECORDER_CHUNK_MS)
    setKind(next)
    // Only a voice note is transcribed: `Transcribe` is not offered for a clip,
    // so listening through one would ask for the microphone permission a screen
    // recording does not need.
    if (next === 'voice') speech.start()
  }

  const discard = () => {
    if (finished) URL.revokeObjectURL(finished.url)
    setFinished(null)
  }

  const attach = () => {
    if (!finished) return
    onAttach(finished.file)
    URL.revokeObjectURL(finished.url)
    setFinished(null)
  }

  const transcribe = () => {
    if (!finished) return
    const spoken = finished.transcript.trim()
    if (!spoken) {
      // The recording exists but nothing was recognised — usually an
      // unsupported browser or a language it could not hear. Attaching the
      // audio instead of silently doing nothing keeps the voice note.
      toast.error(t('commentRecorder.nothingHeard'))
      return
    }
    onTranscript((existing) => appendTranscript(existing, spoken))
    URL.revokeObjectURL(finished.url)
    setFinished(null)
  }

  if (finished) {
    return (
      <div
        data-testid="comment-recording-ready"
        className={cn('rounded-md border border-border bg-muted/30 p-2 space-y-2', className)}
      >
        {finished.kind === 'voice' ? (
          <audio data-testid="comment-recording-preview" src={finished.url} controls className="w-full h-9" />
        ) : (
          <video data-testid="comment-recording-preview" src={finished.url} controls className="w-full max-h-56 rounded" />
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(finished.seconds)}</span>
          <button
            type="button"
            data-testid="comment-recording-discard"
            aria-label={t('commentRecorder.discard')}
            title={t('commentRecorder.discard')}
            onClick={discard}
            className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {/*
           * THE CHOICES OF FRAME `04:16`, AND ONLY THOSE. They are wrapped so
           * the count can be asserted: "Insert as text" is the tooltip on
           * Transcribe — carried by `title` below — and reading it as a third
           * button is the mistake this wrapper exists to make a test failure
           * rather than a design.
           */}
          <div data-testid="comment-recording-choices" className="flex items-center gap-1.5">
            <Button size="sm" data-testid="comment-recording-attach" onClick={attach}>
              {finished.kind === 'voice' ? t('commentRecorder.voiceNote') : t('commentRecorder.attachClip')}
            </Button>
            {/* Only a voice note is transcribable — a screen clip was never listened to. */}
            {finished.kind === 'voice' && (
              <Button
                size="sm"
                variant="outline"
                data-testid="comment-recording-transcribe"
                title={t('commentRecorder.insertAsText')}
                onClick={transcribe}
              >
                {t('commentRecorder.transcribe')}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (kind) {
    return (
      <div
        data-testid="comment-recording-active"
        className={cn('flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 px-2 py-1.5', className)}
      >
        <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" aria-hidden />
        <span className="text-xs text-foreground">
          {kind === 'voice' ? t('commentRecorder.recordingVoice') : t('commentRecorder.recordingClip')}
        </span>
        <span data-testid="comment-recording-elapsed" className="text-xs text-muted-foreground tabular-nums">
          {formatDuration(seconds)}
        </span>
        {/* The live hypothesis, so a voice note is visibly being heard. */}
        {kind === 'voice' && speech.interimTranscript && (
          <span className="text-xs text-muted-foreground truncate max-w-[220px]">{speech.interimTranscript}</span>
        )}
        <button
          type="button"
          data-testid="comment-recording-stop"
          onClick={stop}
          className="ml-auto inline-flex items-center gap-1 rounded bg-rose-500 px-2 py-1 text-xs font-medium text-white hover:bg-rose-600"
        >
          <Square className="h-3 w-3" />
          {t('commentRecorder.stop')}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <button
        type="button"
        data-testid="comment-record-voice"
        aria-label={t('commentRecorder.recordVoice')}
        title={t('commentRecorder.recordVoice')}
        disabled={starting}
        onClick={() => start('voice')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
        {t('commentRecorder.recordVoice')}
      </button>
      <button
        type="button"
        data-testid="comment-record-clip"
        aria-label={t('commentRecorder.recordClip')}
        title={t('commentRecorder.recordClip')}
        disabled={starting}
        onClick={() => start('clip')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Video className="h-3.5 w-3.5" />
        {t('commentRecorder.recordClip')}
      </button>
    </div>
  )
}
