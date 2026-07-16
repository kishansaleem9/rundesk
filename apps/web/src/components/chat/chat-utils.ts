import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns'

export function formatMessageTime(iso: string) {
  return format(new Date(iso), 'h:mm a')
}

/** Relative "3 hours ago" style, matching the app's inbox time formatting. */
export function formatRelativeTime(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
}

export function formatDateDivider(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMMM d')
}

export function shouldShowMessageHeader(
  messages: Array<{ authorId: string; createdAt: string }>,
  index: number,
) {
  if (index === 0) return true
  const prev = messages[index - 1]
  const curr = messages[index]
  if (prev.authorId !== curr.authorId) return true
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000
}

export function shouldShowDateDivider(
  messages: Array<{ createdAt: string }>,
  index: number,
) {
  if (index === 0) return true
  const prev = new Date(messages[index - 1].createdAt)
  const curr = new Date(messages[index].createdAt)
  return prev.toDateString() !== curr.toDateString()
}

export function initials(name: string | null | undefined) {
  return (name?.trim()?.[0] ?? '?').toUpperCase()
}
