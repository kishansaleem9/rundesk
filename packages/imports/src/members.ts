export type Member = { userId: string; email: string | null; displayName: string | null }

/**
 * §2.3 Task assignee: an email matches a member's email exactly (any case, as
 * addresses are); a name matches a member's full name, case-insensitively. A
 * name two members share matches neither, and is reported. The wizard shows
 * the unmatched ones before Start; the API decides again when it writes.
 */
export function matchAssignee(value: string, members: Member[]): { userId: string } | { unmatched: string; ambiguous?: boolean } {
  const v = value.trim()
  if (!v) return { unmatched: v }
  const lower = v.toLowerCase()
  if (v.includes('@')) {
    const hit = members.find((m) => (m.email ?? '').toLowerCase() === lower)
    return hit ? { userId: hit.userId } : { unmatched: v }
  }
  const named = members.filter((m) => (m.displayName ?? '').trim().toLowerCase() === lower)
  if (named.length === 1) return { userId: named[0].userId }
  return { unmatched: v, ambiguous: named.length > 1 }
}
