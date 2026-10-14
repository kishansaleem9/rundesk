import type { NotetakerStatus } from '@rundesk/db'

/**
 * THE MEETING BOT, AT RECALL.AI (`commit-log/log-39863ff-1`).
 *
 * ClickUp's AI Notetaker is a bot that joins a Zoom, Google Meet or Teams
 * meeting, records it and transcribes it. Joining three vendors' meetings as a
 * participant is a service of its own; this asks Recall.ai's, whose API is
 * read from its docs through search excerpts (14 October):
 *
 *   POST   /api/v1/bot/                 {meeting_url, bot_name, join_at?, recording_config}  → {id}
 *   GET    /api/v1/bot/{id}/            {status_changes: [{code, sub_code}], recordings: [{media_shortcuts:
 *                                        {transcript: {data: {download_url}}}}]}
 *   DELETE /api/v1/bot/{id}/            a bot scheduled and not yet joined
 *   POST   /api/v1/bot/{id}/leave_call/ a bot in a call
 *
 * with `Authorization: Token <key>`, at the region's own address
 * (https://us-east-1.recall.ai, us-west-2, eu-central-1, ap-northeast-1). The
 * transcript is the meeting's own captions (`meeting_captions`, which needs no
 * transcription service), downloaded once the bot is `done` from a short-lived
 * address: a list of participants, each with the words they said.
 *
 * Its own variables: RECALL_API_KEY, RECALL_API_URL (us-east-1's unless given)
 * and NOTETAKER_BOT_NAME ("Rundesk Notetaker" unless given). With no key the
 * notetaker is not set up, and the Meetings page says so. The lanes and CI ask
 * `scripts/e2e-lanes/media-stub.mjs`, which answers in these shapes; plain
 * functions over a configuration, so `check-media-stub.mjs` drives exactly what
 * the API calls.
 */
export type RecallConfig = { base: string; key: string; botName: string }

export function recallConfig(env: Record<string, string | undefined> = process.env): RecallConfig | null {
  const key = env.RECALL_API_KEY?.trim()
  if (!key) return null
  return {
    key,
    base: (env.RECALL_API_URL?.trim() || 'https://us-east-1.recall.ai').replace(/\/+$/, ''),
    botName: env.NOTETAKER_BOT_NAME?.trim() || 'Rundesk Notetaker',
  }
}

/** The service answered with a refusal or not at all; `status` is its own, 0 when nothing came back. */
export class RecallFailed extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export type RecallBot = {
  id: string
  status_changes?: Array<{ code?: string; sub_code?: string | null; created_at?: string }>
  recordings?: Array<{ media_shortcuts?: { transcript?: { data?: { download_url?: string | null } | null } | null } }>
}

async function call<T>(cfg: RecallConfig, path: string, init: { method: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${cfg.base}/api/v1${path}`, {
      method: init.method,
      headers: { authorization: `Token ${cfg.key}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    throw new RecallFailed(0, `The meeting bot service could not be reached: ${e instanceof Error ? e.message : String(e)}`)
  }
  const raw = await res.text().catch(() => '')
  if (!res.ok) {
    let said = raw.slice(0, 300)
    try {
      const j = JSON.parse(raw) as Record<string, unknown>
      said = typeof j.detail === 'string' ? j.detail : Object.values(j).flat().filter((v) => typeof v === 'string').join(' ') || said
    } catch {
      /* its first words say it */
    }
    throw new RecallFailed(res.status, `The meeting bot service answered ${res.status}${said ? `: ${said}` : ''}`)
  }
  return (raw ? JSON.parse(raw) : {}) as T
}

/** Send a bot: now, or at `joinAt`. The transcript is the meeting's own captions. */
export async function createBot(cfg: RecallConfig, opts: { meetingUrl: string; joinAt?: Date | null }): Promise<{ id: string }> {
  const bot = await call<{ id?: string }>(cfg, '/bot/', {
    method: 'POST',
    body: {
      meeting_url: opts.meetingUrl,
      bot_name: cfg.botName,
      ...(opts.joinAt ? { join_at: opts.joinAt.toISOString() } : {}),
      recording_config: { transcript: { provider: { meeting_captions: {} } } },
    },
  })
  if (!bot.id) throw new RecallFailed(0, 'The meeting bot service made no bot')
  return { id: bot.id }
}

export function getBot(cfg: RecallConfig, id: string): Promise<RecallBot> {
  return call<RecallBot>(cfg, `/bot/${encodeURIComponent(id)}/`, { method: 'GET' })
}

/** Call a bot back: one not yet in its meeting is unscheduled, one in it leaves. */
export async function removeBot(cfg: RecallConfig, id: string, inCall: boolean): Promise<void> {
  if (inCall) await call(cfg, `/bot/${encodeURIComponent(id)}/leave_call/`, { method: 'POST' })
  else await call(cfg, `/bot/${encodeURIComponent(id)}/`, { method: 'DELETE' })
}

/**
 * Where a bot stands, from its latest status change, as the notetaker says it:
 * scheduled until it starts joining; waiting in a waiting room; recording once
 * in the call; processing from the call's end until its recording is `done`;
 * failed on `fatal` or a refusal to be recorded, with the service's reason.
 */
export function stateOf(bot: RecallBot): { status: NotetakerStatus; detail: string | null } {
  const last = bot.status_changes?.[bot.status_changes.length - 1]
  const code = last?.code ?? ''
  const detail = last?.sub_code ?? (code || null)
  switch (code) {
    case '':
    case 'ready':
      return { status: 'scheduled', detail: null }
    case 'joining_call':
    case 'in_call_not_recording':
    case 'recording_permission_allowed':
      return { status: 'joining', detail }
    case 'in_waiting_room':
      return { status: 'waiting', detail }
    case 'in_call_recording':
      return { status: 'recording', detail }
    case 'call_ended':
    case 'recording_done':
      return { status: 'processing', detail }
    case 'done':
    case 'analysis_done':
      return { status: 'done', detail: null }
    case 'fatal':
    case 'recording_permission_denied':
      return { status: 'failed', detail }
    default:
      return { status: 'joining', detail }
  }
}

export function transcriptUrlOf(bot: RecallBot): string | null {
  for (const r of bot.recordings ?? []) {
    const url = r.media_shortcuts?.transcript?.data?.download_url
    if (url) return url
  }
  return null
}

export type TranscriptPart = { speaker: string; text: string }

/**
 * A transcript as the service downloads it — a list of participants, each with
 * the words they said — as who said what, in order, a speaker's run of words
 * one part. Parts are ordered by their first word's time.
 */
export function readTranscript(entries: unknown): TranscriptPart[] {
  if (!Array.isArray(entries)) return []
  const parts: Array<TranscriptPart & { at: number }> = []
  for (const e of entries as Array<{ participant?: { name?: string | null }; words?: Array<{ text?: string; start_timestamp?: { relative?: number } | null }> }>) {
    const words = Array.isArray(e?.words) ? e.words : []
    const text = words.map((w) => (typeof w?.text === 'string' ? w.text : '')).join(' ').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const speaker = (typeof e?.participant?.name === 'string' && e.participant.name.trim()) || 'Someone'
    parts.push({ speaker, text, at: Number(words[0]?.start_timestamp?.relative ?? parts.length) })
  }
  return parts.sort((a, b) => a.at - b.at).map(({ speaker, text }) => ({ speaker, text }))
}

/** Download a done bot's transcript from its short-lived address: no key, as the address is signed. */
export async function downloadTranscript(url: string): Promise<TranscriptPart[]> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  } catch (e) {
    throw new RecallFailed(0, `The transcript could not be downloaded: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!res.ok) throw new RecallFailed(res.status, `The transcript could not be downloaded (${res.status})`)
  return readTranscript(await res.json().catch(() => null))
}

/** The transcript as the meeting record keeps it: a line per part, its speaker first. */
export function transcriptText(parts: TranscriptPart[]): string {
  return parts.map((p) => `${p.speaker}: ${p.text}`).join('\n')
}
