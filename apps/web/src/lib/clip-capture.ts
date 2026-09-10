/**
 * The screen-record setup panel's choices, and the stream they produce.
 *
 * §V2-S05 frame `04:55` shows the panel ClickUp puts in front of a recording:
 * source `Entire screen`, quality `1080p`, mic `Default – Internal Microphone`,
 * and a red **Record Clip** button. Rundesk recorded immediately on the click
 * with `getDisplayMedia({ video: true, audio: true })` and no way to say what
 * to capture or which microphone to use.
 *
 * WHY A MODULE, AND THIS IS THE LOAD-BEARING REASON. There are TWO recorders in
 * this product — the comment composer (`comment-recorder.tsx`) and the clips
 * page (`workspace-clips-page.tsx`) — and both had their own copy of that same
 * hardcoded constraint object. A setup panel built into one of them would be
 * the tenth instance of this codebase's duplicated-logic defect, and the copy
 * that did not get it would go on recording at whatever the browser felt like.
 * So the choices, their constraints, and the stream they open live here once.
 *
 * WHAT BELONGS TO THE BROWSER, said plainly rather than faked. A web page
 * cannot enumerate screens or windows: `getDisplayMedia` always shows the
 * browser's own picker and the person chooses there. `displaySurface` is a
 * HINT — Chrome uses it to pre-select a tab in that dialog — so the source
 * control is honestly a preference, not a selector, and the panel says the
 * browser will still ask. A dropdown claiming to list your monitors would be a
 * facade over an API that does not offer them.
 *
 * WHY THE MIC IS A SECOND STREAM. `getDisplayMedia`'s audio is SYSTEM audio,
 * not the microphone — so a screen recording with commentary needs a separate
 * `getUserMedia` and the two joined. That is why the frame has a mic selector
 * beside the source: they are different captures, and without the second one a
 * "record a clip and talk over it" produces a silent film.
 */

/** A quality the panel offers, and the video constraint it really sends. */
export type ClipQuality = {
  id: '720p' | '1080p'
  label: string
  height: number
}

/**
 * Two, not five. 1080p is the frame's own value and 720p is the one worth
 * having beside it — a smaller file for a slow connection. Offering 4K would
 * promise a capture most screens cannot source and most uploads should not
 * carry.
 */
export const CLIP_QUALITIES: readonly ClipQuality[] = [
  { id: '720p', label: '720p', height: 720 },
  { id: '1080p', label: '1080p', height: 1080 },
] as const

/** What the browser may be asked to pre-select in its own picker. */
export type ClipSurface = 'monitor' | 'window' | 'browser'

export const CLIP_SURFACES: readonly ClipSurface[] = ['monitor', 'window', 'browser'] as const

export type ClipSetup = {
  quality: ClipQuality['id']
  surface: ClipSurface
  /** `''` means "no microphone" — a silent screen capture is a real choice. */
  micId: string
}

export const DEFAULT_CLIP_SETUP: ClipSetup = {
  quality: '1080p',
  surface: 'monitor',
  micId: 'default',
}

/**
 * The constraints one setup turns into.
 *
 * `ideal` rather than `exact` throughout: a screen that cannot source 1080p
 * should record at what it has, not refuse. `exact` here would turn a quality
 * preference into a reason the recording never starts.
 */
export function displayConstraints(setup: ClipSetup): MediaStreamConstraints {
  const height = CLIP_QUALITIES.find((q) => q.id === setup.quality)?.height ?? 1080
  return {
    video: {
      height: { ideal: height },
      // 16:9 at the chosen height, so a quality label means a size and not
      // just a vertical count.
      width: { ideal: Math.round((height * 16) / 9) },
      // @ts-expect-error — displaySurface is standard for getDisplayMedia and
      // absent from lib.dom's MediaTrackConstraints in this TS version.
      displaySurface: setup.surface,
    },
    // System audio, which is not the microphone — see the note at the top.
    audio: true,
  }
}

/** The constraints for the chosen microphone, or null when there is none. */
export function micConstraints(setup: ClipSetup): MediaStreamConstraints | null {
  if (!setup.micId) return null
  return {
    audio: setup.micId === 'default' ? true : { deviceId: { exact: setup.micId } },
    video: false,
  }
}

export type MicOption = { deviceId: string; label: string }

/**
 * The microphones to offer.
 *
 * Labels are only populated once a permission has been granted — before that
 * the browser returns empty strings, deliberately, so a page cannot fingerprint
 * a device list. So an unlabelled input is shown by position rather than as a
 * blank row: "Microphone 2" is a worse name than the real one and a far better
 * one than nothing.
 */
export async function listMicrophones(): Promise<MicOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  let devices: MediaDeviceInfo[] = []
  try {
    devices = await navigator.mediaDevices.enumerateDevices()
  } catch {
    // A blocked or unavailable device list is "no choices", never a crash on
    // the way to a recording.
    return []
  }
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
    }))
}

/**
 * Open the stream a recording should use: the display capture, plus the chosen
 * microphone mixed in as an extra track.
 *
 * THE MIC IS BEST-EFFORT, and that is a deliberate asymmetry. Losing the screen
 * means there is nothing to record and the caller must hear about it; losing the
 * microphone means a silent clip, which is worth having and worth warning about
 * rather than refusing. So a rejected mic is reported through `micError` and the
 * screen capture proceeds.
 */
export async function openClipStream(setup: ClipSetup): Promise<{
  stream: MediaStream
  micError: boolean
}> {
  const display = await navigator.mediaDevices.getDisplayMedia(displayConstraints(setup))
  const wanted = micConstraints(setup)
  if (!wanted) return { stream: display, micError: false }
  try {
    const mic = await navigator.mediaDevices.getUserMedia(wanted)
    for (const track of mic.getAudioTracks()) display.addTrack(track)
    return { stream: display, micError: false }
  } catch {
    return { stream: display, micError: true }
  }
}

/**
 * The last setup used, remembered.
 *
 * Somebody who records at 720p with a headset does it again next time. Stored
 * per person in the browser, like the other panel preferences in this codebase,
 * and every field validated on the way back out: a stored quality that is no
 * longer offered must fall back rather than send a constraint nothing matches.
 */
const KEY = 'rundesk.clipSetup'

export function readClipSetup(): ClipSetup {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_CLIP_SETUP
    const parsed = JSON.parse(raw) as Partial<ClipSetup>
    return {
      quality: CLIP_QUALITIES.some((q) => q.id === parsed.quality)
        ? (parsed.quality as ClipQuality['id'])
        : DEFAULT_CLIP_SETUP.quality,
      surface: CLIP_SURFACES.includes(parsed.surface as ClipSurface)
        ? (parsed.surface as ClipSurface)
        : DEFAULT_CLIP_SETUP.surface,
      micId: typeof parsed.micId === 'string' ? parsed.micId : DEFAULT_CLIP_SETUP.micId,
    }
  } catch {
    // Unreadable storage, or stored nonsense, both mean "use the defaults".
    return DEFAULT_CLIP_SETUP
  }
}

export function writeClipSetup(setup: ClipSetup): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(setup))
  } catch {
    // A choice that cannot be remembered still applies to this recording.
  }
}
