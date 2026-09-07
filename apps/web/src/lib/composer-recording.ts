/**
 * §V2-05 — recording from inside a comment composer.
 *
 * Frame `04:16` is a finished voice note offering exactly two buttons —
 * `Voice note` and `Transcribe` — and frame `04:56` is a "+" menu whose third
 * item is `Record a Video Clip`. Both put media into a comment; they differ in
 * what they capture and in what the person ends up with.
 *
 * WHY A SECOND RECORDER MODULE. `lib/call-recording.ts` already wraps
 * `MediaRecorder`, but every decision in it is about a *call*: which
 * participant captures the mix, how to grow that mix as people join, how many
 * times speech recognition may restart across an hour. A composer records one
 * person for a few seconds and then stops. Bending the call recorder into that
 * shape would mean adding a "not actually a call" branch to each of those
 * decisions, so the container-picking helper is shared and nothing else is.
 *
 * WHY THE DECISIONS LIVE HERE. Same reason as the call recorder: every one of
 * them fails silently in a browser. A container the browser cannot write
 * produces a zero-byte file; a filename without an extension produces an
 * attachment nothing will play; a clip with no cap produces a 400 MB upload
 * that fails at the far end after the person has already left the tab.
 */

import { pickRecorderType } from './call-recording'

/**
 * Containers worth trying for a screen or camera clip, best first.
 *
 * VP9 first because it is what Chrome writes natively and what keeps a screen
 * recording of text legible; VP8 for Firefox; MP4/H.264 for Safari, which
 * writes nothing else. `video/webm` bare is the "let the browser choose"
 * fallback that keeps a recording happening on something unusual.
 */
export const VIDEO_RECORDER_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
]

/** What a composer recording is capturing. */
export type RecordingKind = 'voice' | 'clip'

/**
 * Pick a container this browser can write for the given kind.
 *
 * Returns null when none work, which the caller must surface rather than press
 * on with — the same reasoning as the audio picker it delegates to.
 */
export function pickComposerType(
  kind: RecordingKind,
  isSupported: (type: string) => boolean,
): string | null {
  if (kind === 'voice') return pickRecorderType(isSupported)
  for (const type of VIDEO_RECORDER_TYPES) {
    if (isSupported(type)) return type
  }
  return null
}

/**
 * The file extension for a recorded MIME type.
 *
 * An attachment is served back by filename, so a voice note saved as
 * `voice-note` with no extension downloads as an unopenable blob and refuses
 * to play inline. The codec parameters are stripped first — `audio/webm;
 * codecs=opus` is still a `.webm` file.
 */
export function extensionForType(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase()
  switch (base) {
    case 'audio/webm':
    case 'video/webm':
      return 'webm'
    case 'audio/mp4':
      return 'm4a'
    case 'video/mp4':
      return 'mp4'
    case 'audio/ogg':
      return 'ogg'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav'
    default:
      return 'bin'
  }
}

/**
 * A name for the recording, from the kind and the moment it was made.
 *
 * The timestamp is in it because a person leaving three voice notes on one task
 * otherwise gets three attachments called the same thing, and the list of them
 * becomes unreadable in exactly the case where it matters.
 *
 * `at` is passed in rather than read from the clock so this is testable, which
 * is the same reason the export writer takes a fixed DOS timestamp.
 */
export function recordingFileName(kind: RecordingKind, mimeType: string, at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const stem = kind === 'voice' ? 'voice-note' : 'clip'
  return `${stem}_${stamp}.${extensionForType(mimeType)}`
}

/**
 * How a finished attachment should be shown inside a comment.
 *
 * Frame `04:45` renders a voice note as an inline player and frame `05:35`
 * renders a clip as a video with a play button — neither is a paperclip with a
 * filename beside it, which is what every non-image attachment currently gets.
 */
export type AttachmentPresentation = 'audio' | 'video' | 'image' | 'file'

export function presentationFor(mimeType: string | null | undefined): AttachmentPresentation {
  const base = (mimeType ?? '').split(';')[0].trim().toLowerCase()
  if (base.startsWith('audio/')) return 'audio'
  if (base.startsWith('video/')) return 'video'
  if (base.startsWith('image/')) return 'image'
  return 'file'
}

/**
 * The longest a composer recording may run.
 *
 * Not a licence limit — a memory one. `MediaRecorder` holds every chunk in the
 * tab until the recording stops, and a screen capture left running because
 * somebody switched windows and forgot is the realistic way to reach a gigabyte
 * of unsent Blob. Ten minutes of 1080p screen capture is roughly 100 MB, which
 * is also the attachment ceiling, so the two limits agree by construction
 * rather than by coincidence.
 */
export const MAX_VOICE_SECONDS = 10 * 60
export const MAX_CLIP_SECONDS = 10 * 60

export function maxSecondsFor(kind: RecordingKind): number {
  return kind === 'voice' ? MAX_VOICE_SECONDS : MAX_CLIP_SECONDS
}

/** `m:ss`, the way every player in the product already reads. */
export function formatDuration(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Below this a "recording" is a container header and no sound. */
export const MIN_RECORDING_BYTES = 1024

/**
 * Is there anything here worth attaching?
 *
 * A tap on the mic that stops before the first chunk lands produces a Blob of a
 * few dozen bytes. Attaching it gives the person a comment carrying a player
 * that plays nothing, which reads as the product losing their voice note —
 * much worse than being told the recording was too short.
 */
export function isUsableRecording(byteLength: number): boolean {
  return byteLength >= MIN_RECORDING_BYTES
}

/**
 * What the finished-recording strip offers.
 *
 * FRAME `04:16` IS TWO BUTTONS, NOT THREE. The strip shows `Voice note` and
 * `Transcribe`, with "Insert as text" as the dark tooltip hanging above
 * `Transcribe` under the cursor — it is the explanation of what Transcribe
 * does, not a third choice. An earlier reading of this frame turned that
 * tooltip into a button; this list exists so that the count is asserted in a
 * test rather than re-derived from a summary each time.
 */
export const VOICE_NOTE_CHOICES = ['attach', 'transcribe'] as const
export type VoiceNoteChoice = (typeof VOICE_NOTE_CHOICES)[number]

/**
 * Where a transcript goes when `Transcribe` is chosen.
 *
 * Appended to whatever is already typed rather than replacing it: somebody who
 * wrote "quick thought:" and then spoke should end up with both, and a composer
 * that silently discards typed text the moment a recording finishes is a
 * composer people learn not to record from.
 *
 * The separator is chosen from what is already there, so an empty box does not
 * start with a space and a box ending mid-sentence does not run the two
 * together.
 */
export function appendTranscript(existing: string, transcript: string): string {
  const spoken = transcript.trim()
  if (!spoken) return existing
  const typed = existing.replace(/\s+$/, '')
  if (!typed) return spoken
  return `${typed} ${spoken}`
}
