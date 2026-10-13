import { readZip, ZipReadError, type ZipEntry } from '../../common/import/zip-read'

/**
 * SLACK'S EXPORT, READ AS ITS PUBLIC CHANNELS (`commit-log/log-601eacc-2`).
 *
 * ClickUp imports Slack into Chat, and asks for the export file first — it
 * "encourages" uploading a file over its API path, because of Slack's rate
 * limits. It brings over public channels, their threads and replies and their
 * reactions, up to 10 000 messages a channel, newest first; not private
 * channels, direct messages, or saved and pinned messages; and each channel
 * becomes a new Chat channel (help centre, "Import from Slack", read through
 * search excerpts, 13 October).
 *
 * A Slack export is a zip of JSON:
 *   · `channels.json` — the public channels: id, name, topic, purpose,
 *     archived or not, members;
 *   · `users.json` — the people: id, name, profile with real and display
 *     names and email;
 *   · a folder per channel, named for it, of one file per day: that day's
 *     messages, each with its author, text, `ts` (its moment, and its id),
 *     `thread_ts` when it is in a thread, and its reactions;
 *   · `groups.json`, `dms.json`, `mpims.json` — private channels and direct
 *     messages, which are counted here and not read.
 *
 * Pure: nothing here writes. `SlackImportService` makes the channels.
 */

export class SlackExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SlackExportError'
  }
}

/** ClickUp's limit: the newest this many messages of a channel, its replies among them. */
export const SLACK_MESSAGES_PER_CHANNEL = 10_000

export type SlackUser = { id: string; name: string; email: string | null; bot: boolean }

export type SlackMessage = {
  ts: string
  at: Date
  /** The Slack user who wrote it, or null for a bot or an integration. */
  user: string | null
  /** The name it was written under: the person's, or the bot's. */
  name: string
  text: string
  /** The thread it is a reply in: its first message's `ts`. Null when it starts no thread or is the thread's start. */
  threadTs: string | null
  reactions: Array<{ name: string; users: string[] }>
}

export type SlackChannel = {
  id: string
  name: string
  topic: string
  purpose: string
  archived: boolean
  members: string[]
  messages: SlackMessage[]
  /** Older messages past the limit, left behind. */
  dropped: number
}

export type SlackExport = {
  channels: SlackChannel[]
  users: Map<string, SlackUser>
  /** What the export holds that is not imported, as ClickUp leaves it: private channels and direct messages. */
  notImported: { privateChannels: number; directMessages: number }
}

/** Messages that say something; a join, a leave, a topic change are the channel's bookkeeping. */
const BOOKKEEPING = new Set([
  'channel_join', 'channel_leave', 'channel_topic', 'channel_purpose', 'channel_name', 'channel_archive',
  'channel_unarchive', 'group_join', 'group_leave', 'group_topic', 'group_purpose', 'group_name', 'group_archive',
  'group_unarchive', 'pinned_item', 'unpinned_item', 'bot_add', 'bot_remove', 'channel_convert_to_private',
  'channel_convert_to_public', 'reminder_add', 'tombstone', 'sh_room_created', 'huddle_thread',
])

const LIMITS = { maxEntries: 200_000, maxEntryBytes: 64 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 * 1024 }

export function readSlackExport(buf: Buffer): SlackExport {
  let zip: Map<string, ZipEntry>
  try {
    zip = readZip(buf, LIMITS)
  } catch (e) {
    if (e instanceof ZipReadError) throw new SlackExportError(`The Slack export could not be read: ${e.message}`)
    throw e
  }
  const channelsName = [...zip.keys()]
    .filter((n) => /(^|\/)channels\.json$/i.test(n))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0]
  if (!channelsName) {
    throw new SlackExportError('This zip is not a Slack export: it has no channels.json. Export the workspace from Slack (Settings & administration › Workspace settings › Import/Export Data › Export) and upload that zip.')
  }
  const base = channelsName.slice(0, channelsName.length - 'channels.json'.length)
  const json = (name: string): unknown => {
    const entry = zip.get(base + name)
    if (!entry) return null
    try {
      return JSON.parse(entry.text())
    } catch {
      throw new SlackExportError(`${name} in the Slack export is not valid JSON`)
    }
  }

  const users = new Map<string, SlackUser>()
  for (const u of asArray(json('users.json'))) {
    const id = str(u.id)
    if (!id) continue
    const profile = (u.profile ?? {}) as Record<string, unknown>
    users.set(id, {
      id,
      name: str(profile.display_name) || str(profile.real_name) || str(u.real_name) || str(u.name) || id,
      email: str(profile.email).toLowerCase() || null,
      bot: u.is_bot === true || id === 'USLACKBOT',
    })
  }

  // Each channel's day files, by the folder they are in.
  const days = new Map<string, string[]>()
  for (const name of zip.keys()) {
    if (!name.startsWith(base)) continue
    const rest = name.slice(base.length)
    const m = /^([^/]+)\/(\d{4}-\d{2}-\d{2})\.json$/.exec(rest)
    if (!m) continue
    const list = days.get(m[1]) ?? []
    list.push(name)
    days.set(m[1], list)
  }

  const channels: SlackChannel[] = []
  for (const c of asArray(json('channels.json'))) {
    const name = str(c.name)
    if (!name) continue
    const all: SlackMessage[] = []
    for (const file of (days.get(name) ?? []).sort()) {
      let rows: unknown
      try {
        rows = JSON.parse(zip.get(file)!.text())
      } catch {
        continue
      }
      for (const m of asArray(rows)) {
        const message = toMessage(m, users)
        if (message) all.push(message)
      }
    }
    // Newest first up to the limit, then in the order they were written.
    all.sort((a, b) => compareTs(b.ts, a.ts))
    const kept = all.slice(0, SLACK_MESSAGES_PER_CHANNEL)
    kept.sort((a, b) => compareTs(a.ts, b.ts))
    channels.push({
      id: str(c.id),
      name,
      topic: str((c.topic as Record<string, unknown> | undefined)?.value),
      purpose: str((c.purpose as Record<string, unknown> | undefined)?.value),
      archived: c.is_archived === true,
      members: Array.isArray(c.members) ? (c.members as unknown[]).map(str).filter(Boolean) : [],
      messages: kept,
      dropped: all.length - kept.length,
    })
  }

  return {
    channels,
    users,
    notImported: {
      privateChannels: asArray(json('groups.json')).length,
      directMessages: asArray(json('dms.json')).length + asArray(json('mpims.json')).length,
    },
  }
}

function asArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Array<Record<string, unknown>>) : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
}

/** Two `ts` values in order: seconds, then the microseconds after the point. */
export function compareTs(a: string, b: string): number {
  const [as, au = '0'] = a.split('.')
  const [bs, bu = '0'] = b.split('.')
  return Number(as) - Number(bs) || Number(au.padEnd(6, '0')) - Number(bu.padEnd(6, '0'))
}

function toMessage(m: Record<string, unknown>, users: Map<string, SlackUser>): SlackMessage | null {
  if (str(m.type) && str(m.type) !== 'message') return null
  const subtype = str(m.subtype)
  if (BOOKKEEPING.has(subtype)) return null
  const ts = str(m.ts)
  const seconds = Number(ts.split('.')[0])
  if (!ts || !Number.isFinite(seconds)) return null
  const user = str(m.user) || null
  const profile = (m.user_profile ?? {}) as Record<string, unknown>
  const bot = (m.bot_profile ?? {}) as Record<string, unknown>
  const name =
    (user && users.get(user)?.name) ||
    str(profile.display_name) || str(profile.real_name) || str(m.username) || str(bot.name) || (user ?? 'Slack')
  let text = typeof m.text === 'string' ? m.text : ''
  // Shared files are said where they were: the export keeps no bytes of them.
  for (const f of asArray(m.files)) {
    const fileName = str(f.name) || str(f.title)
    if (fileName) text += `${text ? '\n' : ''}[File: ${fileName}]`
  }
  if (!text.trim()) return null
  const threadTs = str(m.thread_ts)
  return {
    ts,
    at: new Date(Math.round(Number(ts) * 1000)),
    user,
    name,
    text,
    threadTs: threadTs && threadTs !== ts ? threadTs : null,
    reactions: asArray(m.reactions)
      .map((r) => ({ name: str(r.name), users: Array.isArray(r.users) ? (r.users as unknown[]).map(str).filter(Boolean) : [] }))
      .filter((r) => r.name && r.users.length),
  }
}

/** The emoji a Slack reaction names, as the character it draws; one it does not know keeps its `:name:`. */
const EMOJI: Record<string, string> = {
  '+1': '👍', thumbsup: '👍', '-1': '👎', thumbsdown: '👎', heart: '❤️', joy: '😂', laughing: '😆', smile: '😄',
  grinning: '😀', slightly_smiling_face: '🙂', wink: '😉', blush: '😊', tada: '🎉', white_check_mark: '✅',
  heavy_check_mark: '✔️', x: '❌', eyes: '👀', fire: '🔥', rocket: '🚀', pray: '🙏', clap: '👏', ok_hand: '👌',
  '100': '💯', raised_hands: '🙌', thinking_face: '🤔', wave: '👋', muscle: '💪', warning: '⚠️', star: '⭐',
  sparkles: '✨', point_up: '☝️', sweat_smile: '😅', sob: '😭', cry: '😢', rage: '😡', sunglasses: '😎',
  heart_eyes: '😍', scream: '😱', confused: '😕', neutral_face: '😐', party_popper: '🎉', bulb: '💡',
  memo: '📝', question: '❓', exclamation: '❗', heavy_plus_sign: '➕', coffee: '☕', zap: '⚡', boom: '💥',
  hugging_face: '🤗', partying_face: '🥳', smiley: '😃', upside_down_face: '🙃', facepalm: '🤦', shrug: '🤷',
}

export function slackEmoji(name: string): string {
  const bare = name.replace(/::skin-tone-\d$/, '')
  return EMOJI[bare] ?? `:${bare}:`
}

/**
 * Slack's message markup as the text a Chat message holds: a person named
 * `<@U…>` becomes the member they are here (`<@uuid>`, which Chat draws as a
 * mention) or their name; a channel `<#C…|name>` its `#name`; `<!here>` its
 * `@here`; a link `<url|label>` the Markdown link `[label](url)`; and the
 * three escapes Slack writes (`&amp;` `&lt;` `&gt;`) the characters they stand
 * for.
 */
export function slackText(
  text: string,
  opts: { userName: (slackId: string) => string; memberOf: (slackId: string) => string | null; channelName: (slackId: string) => string | null },
): { body: string; mentions: string[] } {
  const mentions = new Set<string>()
  const body = text.replace(/<([^<>]+)>/g, (_whole, inner: string) => {
    const [target, label] = splitOnce(inner, '|')
    if (target.startsWith('@')) {
      const id = target.slice(1)
      const member = opts.memberOf(id)
      if (member) {
        mentions.add(member)
        return `<@${member}>`
      }
      return `@${label || opts.userName(id)}`
    }
    if (target.startsWith('#')) return `#${label || opts.channelName(target.slice(1)) || 'channel'}`
    if (target.startsWith('!')) {
      const special = target.slice(1)
      if (special === 'here' || special === 'channel' || special === 'everyone') return `@${special}`
      return label || `@${special.split('^')[0]}`
    }
    if (/^(https?:|mailto:)/i.test(target)) {
      const url = decodeEscapes(target)
      if (!label) return url.replace(/^mailto:/i, '')
      return `[${decodeEscapes(label)}](${url})`
    }
    return label || target
  })
  return { body: decodeEscapes(body), mentions: [...mentions] }
}

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep)
  return i === -1 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]
}

function decodeEscapes(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
