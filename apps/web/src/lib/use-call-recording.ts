import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import {
  MIN_RECORDING_BYTES,
  RECORDER_CHUNK_MS,
  captionsTail,
  isRevisionOf,
  pickRecorderType,
  shouldSendLine,
  streamsToWire,
} from './call-recording'

/**
 * §2.8 gap 10 — AI Notes, running.
 *
 *   "main record karoongi aur yeh aap ke khud hi NOTES bana ke dega aur poori
 *   ki poori RECORDING bhi karega — poori call hi ki."  `[20:42]`
 *
 * Starts when the recording banner goes up and stops when it comes down. There
 * is deliberately no way to start either half without the banner: the server
 * refuses transcript lines while recording is off, and this does not try.
 *
 * Two independent halves:
 *
 *   - The recording. Everybody's audio mixed into one track and written to a
 *     file, uploaded straight to storage at the end. Only the person who turned
 *     recording on captures it — every participant recording the same call
 *     would produce N copies of it, all but one of them wasted.
 *
 *   - The transcript. This browser listening to THIS person's microphone, one
 *     line at a time. Everyone does this, which is what makes the notes able to
 *     say who said what.
 */
export interface CaptionLine {
  id: number
  text: string
}

export function useCallRecording({
  workspaceId,
  callId,
  recording,
  localStream,
  peerStreams,
  captureAudio,
}: {
  workspaceId: string
  callId: string
  /** The banner. Everything here is downstream of it. */
  recording: boolean
  localStream: MediaStream | null
  peerStreams: MediaStream[]
  /** Whether THIS client captures the mixed recording (one of us must). */
  captureAudio: boolean
}) {
  const [captions, setCaptions] = useState<CaptionLine[]>([])
  const [unavailable, setUnavailable] = useState<'recorder' | 'speech' | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const lastSentRef = useRef<string | null>(null)
  const captionIdRef = useRef(0)
  // Peers change constantly; the recorder is built once and must see the
  // latest without being torn down and restarted every time somebody joins.
  const peersRef = useRef<MediaStream[]>(peerStreams)
  peersRef.current = peerStreams

  /**
   * The live mix.
   *
   * Held open for the whole recording rather than built and forgotten, because
   * people join a call after it has started and have to end up in the file.
   * `wired` keys by MediaStream.id so the same stream is never connected twice,
   * and the source nodes are KEPT: a MediaStreamAudioSourceNode with nothing
   * referencing it can be collected, and the peer it carried goes silent with
   * no error to say why.
   */
  const mixRef = useRef<{
    ctx: AudioContext
    destination: MediaStreamAudioDestinationNode
    wired: Map<string, MediaStreamAudioSourceNode>
  } | null>(null)

  /** Connect anything not already in the mix. Safe to call repeatedly. */
  const wirePeers = useCallback(() => {
    const mix = mixRef.current
    if (!mix) return
    for (const stream of streamsToWire([localStream, ...peersRef.current], new Set(mix.wired.keys()))) {
      try {
        const node = mix.ctx.createMediaStreamSource(stream)
        node.connect(mix.destination)
        mix.wired.set(stream.id, node)
      } catch {
        // Not connectable yet. Left unwired deliberately so the next pass
        // retries it, rather than marked done and silent for the whole call.
      }
    }
  }, [localStream])

  /** Everyone's audio, mixed into one track MediaRecorder can write. */
  const buildMix = useCallback((): MediaStream | null => {
    const audible = [localStream, ...peersRef.current].filter(
      (s): s is MediaStream => !!s && s.getAudioTracks().length > 0,
    )
    if (audible.length === 0) return null
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const destination = ctx.createMediaStreamDestination()
    mixRef.current = { ctx, destination, wired: new Map() }
    wirePeers()
    return destination.stream
  }, [localStream, wirePeers])

  /** Upload what was captured, and tell the server where it landed. */
  const finishUpload = useCallback(
    async (type: string) => {
      const chunks = chunksRef.current
      chunksRef.current = []
      if (chunks.length === 0) return
      const blob = new Blob(chunks, { type })
      // A file this small is a container header and no audio — uploading it
      // would attach an unplayable recording to the meeting record.
      if (blob.size < MIN_RECORDING_BYTES) return
      try {
        const { uploadUrl, storageKey } = await api<{ uploadUrl: string; storageKey: string }>(
          `/workspaces/${workspaceId}/calls/${callId}/recording/upload-url`,
          { method: 'POST', body: { contentType: type } },
        )
        const put = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': type },
          body: blob,
        })
        // Only claim the recording once the bytes are actually there. Attaching
        // a key for a failed upload puts a dead link on the meeting record.
        if (!put.ok) return
        await api(`/workspaces/${workspaceId}/calls/${callId}/recording/attach`, {
          method: 'POST',
          body: { storageKey },
        })
      } catch {
        // The call and its notes survive a failed upload. The transcript is
        // the half the notes are written from, and it is already on the server.
      }
    },
    [workspaceId, callId],
  )

  // ─── the recording ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!recording || !captureAudio) return
    const type = pickRecorderType((t) =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
    )
    if (!type) {
      // Said out loud rather than left as a call that produced no file.
      setUnavailable('recorder')
      return
    }
    const mix = buildMix()
    if (!mix) return

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(mix, { mimeType: type })
    } catch {
      setUnavailable('recorder')
      return
    }
    recorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.start(RECORDER_CHUNK_MS)

    return () => {
      // onstop fires after the final chunk is delivered, so the upload has to
      // wait for it — uploading from the cleanup body loses the last few
      // seconds of every call.
      recorder.onstop = () => void finishUpload(type)
      if (recorder.state !== 'inactive') recorder.stop()
      recorderRef.current = null
      // Disconnect before closing: an AudioContext closed with live nodes
      // attached logs in some browsers and leaves the nodes referenced.
      for (const node of mixRef.current?.wired.values() ?? []) {
        try {
          node.disconnect()
        } catch {
          /* already gone */
        }
      }
      mixRef.current = null
      void audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [recording, captureAudio, buildMix, finishUpload])

  /*
   * Somebody joined (or their microphone came up) while we were recording.
   *
   * Deliberately a SEPARATE effect from the recorder above, keyed on the peer
   * list. Putting peerStreams in the recorder's dependencies would tear the
   * recorder down and start a new file every time the door opened, and only
   * the last of those files would ever be uploaded.
   */
  useEffect(() => {
    if (!recording || !captureAudio) return
    wirePeers()
  }, [recording, captureAudio, peerStreams, wirePeers])

  // ─── the transcript ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!recording) return
    const Recognition =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor })
        .webkitSpeechRecognition
    if (!Recognition) {
      setUnavailable((prev) => prev ?? 'speech')
      return
    }

    const recognition = new Recognition()
    recognitionRef.current = recognition
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = navigator.language || 'en-US'

    let stopped = false

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result.isFinal) continue
        const text = result[0]?.transcript ?? ''
        if (!shouldSendLine(text, lastSentRef.current)) continue
        const replaces = isRevisionOf(text, lastSentRef.current)
        lastSentRef.current = text

        setCaptions((prev) => {
          const line = { id: ++captionIdRef.current, text: text.trim() }
          const next = replaces && prev.length > 0 ? [...prev.slice(0, -1), line] : [...prev, line]
          return captionsTail(next, 3)
        })

        // The server refuses these while recording is off, so a line that
        // races the banner coming down is dropped there rather than here.
        void api(`/workspaces/${workspaceId}/calls/${callId}/transcript`, {
          method: 'POST',
          body: { text },
        }).catch(() => undefined)
      }
    }

    // Chrome ends recognition on its own after a pause. Restarting is what
    // makes this last a whole call rather than the first sentence of one.
    recognition.onend = () => {
      if (stopped) return
      try {
        recognition.start()
      } catch {
        // Already starting. The next onend will try again.
      }
    }
    recognition.onerror = () => {
      // 'no-speech' and 'aborted' are ordinary; onend restarts either way.
    }

    try {
      recognition.start()
    } catch {
      setUnavailable((prev) => prev ?? 'speech')
    }

    return () => {
      stopped = true
      recognitionRef.current = null
      try {
        recognition.stop()
      } catch {
        /* already stopped */
      }
    }
  }, [recording, workspaceId, callId])

  // The banner coming down clears the captions: they are a live aid, and
  // leaving the last three on screen implies it is still listening.
  useEffect(() => {
    if (!recording) {
      setCaptions([])
      lastSentRef.current = null
    }
  }, [recording])

  return { captions, unavailable }
}
