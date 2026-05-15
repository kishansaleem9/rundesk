export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; userId: string; label: string }

const MENTION_TOKEN =
  /<@([0-9a-fA-F-]{36})>|@\[([0-9a-fA-F-]{36})\]|@\[[^\]]+\]\(user:([0-9a-fA-F-]{36})\)/gi

export function extractMentionUserIds(text: string): string[] {
  if (!text) return []
  const ids = new Set<string>()
  const re = new RegExp(MENTION_TOKEN.source, MENTION_TOKEN.flags)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const id = match[1] ?? match[2] ?? match[3]
    if (id) ids.add(id)
  }
  return [...ids]
}

export function buildNamesById(
  members: Array<{ userId: string; displayName?: string | null; email?: string | null }>,
): Record<string, string> {
  return Object.fromEntries(
    members.map((m) => [m.userId, (m.displayName?.trim() || m.email?.trim() || 'teammate') as string]),
  )
}

export function formatMentionsPlain(
  text: string,
  namesById: Record<string, string>,
  fallback = 'teammate',
): string {
  if (!text) return text
  return parseMentionSegments(text, namesById, fallback)
    .map((seg) => (seg.type === 'mention' ? `@${seg.label}` : seg.value))
    .join('')
}

export function parseMentionSegments(
  text: string,
  namesById: Record<string, string>,
  fallback = 'teammate',
): MentionSegment[] {
  if (!text) return []
  const segments: MentionSegment[] = []
  const re = new RegExp(MENTION_TOKEN.source, MENTION_TOKEN.flags)
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    const userId = match[1] ?? match[2] ?? match[3]
    if (userId) {
      segments.push({
        type: 'mention',
        userId,
        label: namesById[userId] ?? fallback,
      })
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }]
}
