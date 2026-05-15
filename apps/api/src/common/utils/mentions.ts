const MENTION_UUID_IN_ANGLE = /<@([0-9a-fA-F-]{36})>/g
const MENTION_UUID_IN_BRACKET = /@\[([0-9a-fA-F-]{36})\]/g
const MENTION_MARKDOWN = /@\[[^\]]+\]\(user:([0-9a-fA-F-]{36})\)/gi

export function extractMentionUserIds(text: string): string[] {
  if (!text) return []
  const ids = new Set<string>()
  for (const pattern of [MENTION_UUID_IN_ANGLE, MENTION_UUID_IN_BRACKET, MENTION_MARKDOWN]) {
    const re = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const id = match[1]
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

export function formatMentionsInText(
  text: string,
  namesById: Record<string, string>,
  fallback = 'teammate',
): string {
  if (!text) return text
  let next = text
  next = next.replace(MENTION_MARKDOWN, (_, id: string) => `@${namesById[id] ?? fallback}`)
  next = next.replace(MENTION_UUID_IN_BRACKET, (_, id: string) => `@${namesById[id] ?? fallback}`)
  next = next.replace(MENTION_UUID_IN_ANGLE, (_, id: string) => `@${namesById[id] ?? fallback}`)
  return next
}
