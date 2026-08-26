/**
 * §2.8 gap 10 — AI Notes, and the decisions inside it.
 *
 *   `[20:42]` "main record karoongi aur yeh aap ke khud hi NOTES bana ke dega
 *   aur poori ki poori RECORDING bhi karega — poori call hi ki."
 *
 * Two things happen while the banner is up, and they are separate on purpose.
 * The RECORDING is a mix of everybody's audio, captured by whoever turned it
 * on. The TRANSCRIPT is each person's own browser listening to their own
 * microphone — which is why the notes can say who said what, where a mixed
 * track would give one stream of words with nobody's name on it.
 *
 * The decisions live here, away from the media plumbing, because every one of
 * them fails silently: a container the browser cannot write produces a
 * zero-byte file, and speech recognition repeating itself produces a transcript
 * that says everything twice.
 */

/**
 * Containers worth trying, best first.
 *
 * Opus in WebM is what Chrome and Firefox write and what every transcription
 * service reads. Safari writes MP4/AAC and nothing else, so it is the fallback
 * rather than the absence of a recording.
 */
export const RECORDER_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

/**
 * Pick a container this browser can actually write.
 *
 * Returns null when none of them work, which the caller must treat as "no
 * recording on this browser" rather than pressing on: MediaRecorder with an
 * unsupported type throws on construction in some browsers and quietly writes
 * a zero-byte file in others, and the second is much worse.
 */
export function pickRecorderType(isSupported: (type: string) => boolean): string | null {
  for (const type of RECORDER_TYPES) {
    if (isSupported(type)) return type
  }
  return null
}

/**
 * Should this line be sent?
 *
 * The Web Speech API re-emits a final result whenever it revises one, so the
 * same sentence arrives two or three times with small corrections. Sending
 * each would put "we should ship on Friday" into the notes three times, and a
 * model reading that will faithfully report it as three separate commitments.
 *
 * Compared against the last line rather than all of them: somebody genuinely
 * repeating themselves ("yes. yes.") is not a duplicate, and a transcript that
 * silently drops real repetition is a transcript that has been edited.
 */
export function shouldSendLine(text: string, lastSent: string | null): boolean {
  const line = text.trim()
  if (line.length < 2) return false
  if (!lastSent) return true
  const previous = lastSent.trim()
  // The commonest case, spelled out. The prefix rule below would also reject
  // it — identical strings are prefixes of each other — but leaving the most
  // frequent path to be inferred from that is not worth the two saved lines.
  if (line === previous) return false
  // A revision of the line just sent: the API grew "we should ship" into "we
  // should ship on Friday". Send the longer one and let the caller replace.
  if (line.startsWith(previous) || previous.startsWith(line)) return line.length > previous.length
  return true
}

/**
 * Whether sending this line REPLACES the last one rather than following it.
 *
 * Paired with shouldSendLine: a revision has to overwrite, or the transcript
 * reads "we should ship / we should ship on Friday" — the model's job is hard
 * enough without that.
 */
export function isRevisionOf(text: string, lastSent: string | null): boolean {
  if (!lastSent) return false
  const line = text.trim()
  const previous = lastSent.trim()
  return line !== previous && (line.startsWith(previous) || previous.startsWith(line))
}

/** The captions strip shows the tail, not the whole call. */
export function captionsTail<T>(lines: T[], max = 3): T[] {
  return lines.slice(Math.max(0, lines.length - max))
}

/**
 * How often to hand MediaRecorder a chunk.
 *
 * Not for streaming — the file is assembled and uploaded once at the end. It
 * exists so a browser that is killed mid-call has written something to memory
 * in pieces rather than holding one growing buffer it never flushes.
 */
export const RECORDER_CHUNK_MS = 5000

/**
 * Who captures the mixed recording.
 *
 * Pinning this to whoever STARTED the call meant that when they left
 * mid-recording, the banner stayed up and the transcript kept flowing while
 * nothing was being recorded at all — the loudest promise in the product,
 * quietly broken for the rest of the call.
 *
 * Elected from who is actually present, by a rule every client computes
 * identically from the same participant list, so exactly one person captures
 * and the job moves the moment that person leaves. Sorted rather than "first
 * to join" because join order is not something every client agrees on.
 */
export function capturerFor(presentUserIds: string[]): string | null {
  if (presentUserIds.length === 0) return null
  return [...presentUserIds].sort()[0]
}

/**
 * How many times speech recognition may restart before giving up.
 *
 * It ends itself after every pause, so restarting is normal and this is
 * deliberately generous. It exists for the case where the failure is permanent
 * and every start ends instantly: without a ceiling that is a hot loop running
 * for the length of the call with nothing on screen to explain it.
 */
export const MAX_SPEECH_RESTARTS = 40

/** Below this, the "recording" is a header and no audio. */
export const MIN_RECORDING_BYTES = 1024

/** The shape of a stream this module cares about — a browser one, or a fake. */
export interface AudibleStream {
  id: string
  getAudioTracks(): unknown[]
}

/**
 * Which streams still need wiring into the mix.
 *
 * The recorder is built once, from whoever is in the call at that instant, and
 * is deliberately NOT restarted when somebody joins — restarting it would chop
 * the recording into a new file every time the door opened. But that left
 * anyone who joined after recording started silent in the file: their voice is
 * in the transcript, because their own browser transcribes it, so the notes
 * read as though they were there while the audio says they never spoke.
 *
 * So the mix is grown instead of rebuilt: each new stream is connected to the
 * same destination the recorder is already writing from.
 *
 * A stream with no audio track is skipped rather than remembered — a peer whose
 * microphone arrives a moment after their video should be picked up on the next
 * pass, not written off.
 */
export function streamsToWire<T extends AudibleStream>(
  streams: Array<T | null | undefined>,
  alreadyWired: ReadonlySet<string>,
): T[] {
  const out: T[] = []
  const seen = new Set<string>()
  for (const stream of streams) {
    if (!stream) continue
    if (alreadyWired.has(stream.id) || seen.has(stream.id)) continue
    if (stream.getAudioTracks().length === 0) continue
    seen.add(stream.id)
    out.push(stream)
  }
  return out
}
