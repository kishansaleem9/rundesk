/**
 * WHICH VIDEO MEETING A LINK IS (`commit-log/log-39863ff-1`).
 *
 * ClickUp's AI Notetaker joins Zoom, Google Meet and Microsoft Teams meetings —
 * sent to one by its link, or to every meeting with one on the calendars it is
 * told to join (its help centre, "Use AI Notetaker to take notes and record
 * meetings", through search excerpts, 14 October). So a link is one of the
 * three by its address alone, and anything else — a page, a phone number, a
 * room — is no meeting it can join:
 *
 *   Zoom          https://zoom.us/j/…, https://<company>.zoom.us/j/… (and /w/, /my/)
 *   Google Meet   https://meet.google.com/abc-defg-hij
 *   Teams         https://teams.microsoft.com/l/meetup-join/…, …/meet/…, https://teams.live.com/meet/…
 *
 * Only `https:` — a meeting link is never plain HTTP, and a bot sent to one
 * that is would be sent somewhere else.
 */
export type MeetingPlatform = 'zoom' | 'google_meet' | 'teams'

export function meetingPlatformOf(raw: unknown): MeetingPlatform | null {
  if (typeof raw !== 'string') return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  const path = url.pathname
  if (host === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(path)) return 'google_meet'
  if ((host === 'zoom.us' || host.endsWith('.zoom.us')) && /^\/(j|w|my)\/[^/]+/.test(path)) return 'zoom'
  if (host === 'teams.microsoft.com' && /^\/(l\/meetup-join|meet)\//.test(path)) return 'teams'
  if (host === 'teams.live.com' && /^\/meet\//.test(path)) return 'teams'
  return null
}

const URLS = /https:\/\/[^\s<>"')\]]+/g

/** The first link to a Zoom, Meet or Teams meeting among these words, or null. */
export function findMeetingUrl(...texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    for (const found of (text ?? '').match(URLS) ?? []) {
      const url = found.replace(/[.,;:!?]+$/, '')
      if (meetingPlatformOf(url)) return url
    }
  }
  return null
}
