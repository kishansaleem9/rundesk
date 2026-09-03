/**
 * §G07-5 frame `087_0535` — "Record a Clip" and "Talk to Text" are separate
 * entries in Personal Tools, and the top bar offers both as pinnable icons.
 *
 * They pointed at `/clips` and `/clips?kind=audio` and nothing read the
 * parameter, so pinning both gave two icons onto the identical page.
 *
 * The kind is read off the STORAGE KEY, which upload stamps
 * (`…-voice-memo-…` / `…-screen-recording-…`). Not off the title: the title
 * carries the same words but a person can rename it, and a library that
 * reshuffles itself because somebody edited a caption is worse than no filter
 * at all.
 */
export type ClipKind = 'audio' | 'video'

/** Screen recordings are the default: an unstamped key is not a voice memo. */
export function clipKind(storageKey: string): ClipKind {
  return /-voice-memo-/.test(storageKey) ? 'audio' : 'video'
}

/** Everything when no kind is asked for; otherwise only that kind. */
export function matchesClipKind(storageKey: string, kind: ClipKind | undefined): boolean {
  return !kind || clipKind(storageKey) === kind
}
