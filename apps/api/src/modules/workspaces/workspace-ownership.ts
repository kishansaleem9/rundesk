/*
 * A WORKSPACE'S NAME AND ITS OWNER — the rules, apart from the database, so
 * they are tested as rules (`workspace-ownership.test.ts`) and the service
 * only asks them.
 *
 * QA WS-002, WS-015 to WS-019 (`found-02-nov/workspace-has-no-owner`,
 * `found-02-nov/workspace-name-unchecked`), and ClickUp's help centre: only the
 * Workspace owner deletes a Workspace or transfers it; the owner cannot leave
 * until they have transferred it; the previous owner becomes an admin.
 */

/** Characters, as a person counts them: "🚀" is one, "Ⓐ" is one, "👩\u200d💻" is one. */
export const WORKSPACE_NAME_MIN = 2
export const WORKSPACE_NAME_MAX = 60

// The API compiles against ES2021's library, which has no `Intl.Segmenter`;
// Node has had it since 16. Typed here rather than widening every package's lib.
type GraphemeSegmenter = { segment(text: string): Iterable<unknown> }
const { Segmenter } = Intl as unknown as { Segmenter: new (locale: undefined, options: { granularity: 'grapheme' }) => GraphemeSegmenter }
const segmenter = new Segmenter(undefined, { granularity: 'grapheme' })

/** How many characters a person would count in it. */
export function characterCount(text: string): number {
  return Array.from(segmenter.segment(text)).length
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string }

/**
 * THE NAME AS IT IS KEPT (QA WS-002: "empty/whitespace blocked; long names
 * limited; emoji saved correctly"). Whitespace of every kind at either end
 * goes — a no-break space, a tab, a line break, the zero-width characters a
 * paste brings — and a run of it inside is one space, so "  Acme \n Ops "
 * is "Acme Ops". What is left must have something a person can see, and be
 * 2 to 60 characters as a person counts them, so an emoji is one character
 * and a name of emoji is not refused at half the length of a name of letters.
 */
export function cleanWorkspaceName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'A workspace needs a name' }
  const name = raw
    .replace(/[\s\u200b\u2060\ufeff]+/gu, ' ')
    .replace(/^[\s\u200b-\u200d\u2060\ufeff]+|[\s\u200b-\u200d\u2060\ufeff]+$/gu, '')
  // Something to see: not only spaces, joiners, marks of direction or controls.
  if (!/[^\s\p{Cc}\p{Cf}\p{Z}]/u.test(name)) return { ok: false, reason: 'A workspace name cannot be blank or only spaces' }
  if (/\p{Cc}/u.test(name)) return { ok: false, reason: 'A workspace name cannot hold control characters' }
  const count = characterCount(name)
  if (count < WORKSPACE_NAME_MIN) return { ok: false, reason: `A workspace name needs at least ${WORKSPACE_NAME_MIN} characters` }
  if (count > WORKSPACE_NAME_MAX) return { ok: false, reason: `A workspace name can be at most ${WORKSPACE_NAME_MAX} characters (this one has ${count})` }
  return { ok: true, name }
}

/** Who is asking, and what they are to the workspace. */
export type OwnershipFacts = {
  /** The workspace's owner, as `effectiveOwners` answers: null when it has none. */
  ownerId: string | null
  /** The asker's role in the workspace, or null when they are not a member. */
  role: string | null
  /** How many admins it has, the asker among them if they are one. */
  admins: number
}

/**
 * WHY SOMEBODY MAY NOT LEAVE, or null when they may (QA WS-015, WS-016).
 * Anybody but the owner leaves; the owner hands the workspace over first. The
 * last admin of a workspace with no owner stays, or nobody could run it.
 */
export function leaveRefusal(me: string, facts: OwnershipFacts): string | null {
  if (!facts.role) return 'You are not a member of this workspace'
  if (facts.ownerId === me) {
    return 'You own this workspace. Transfer its ownership to somebody else in it before you leave it.'
  }
  if (facts.role === 'workspace_admin' && facts.admins <= 1) {
    return 'You are its only admin. Make somebody else an admin before you leave it.'
  }
  return null
}

/** The new owner, as the workspace knows them. */
export type Successor = { userId: string; role: string | null; isAgent: boolean }

/**
 * WHY OWNERSHIP MAY NOT GO TO THIS PERSON, or null when it may (QA WS-017).
 * To a member of the workspace — not a guest, not an agent's account — who
 * does not own it already, confirmed with the workspace's name typed exactly.
 */
export function transferRefusal(args: {
  workspaceName: string
  confirmName: unknown
  ownerId: string | null
  to: Successor | null
}): string | null {
  if (typeof args.confirmName !== 'string' || args.confirmName !== args.workspaceName) {
    return 'Type the workspace’s name exactly as it is to transfer its ownership'
  }
  if (!args.to || !args.to.role) return 'The new owner must be a member of this workspace'
  if (args.to.isAgent) return 'An agent cannot own a workspace'
  if (args.to.role === 'guest') return 'A guest cannot own a workspace: make them a member first'
  if (args.to.userId === args.ownerId) return 'They own this workspace already'
  return null
}

/**
 * WHY THE OWNER'S PLACE MAY NOT CHANGE THIS WAY, or null when it may. Nobody
 * removes the owner, and the owner is always an admin: a transfer comes first.
 */
export function ownerProtected(target: string, ownerId: string | null, change: { remove: true } | { role: string }): string | null {
  if (!ownerId || target !== ownerId) return null
  if ('remove' in change) return 'The workspace’s owner cannot be removed. They transfer its ownership first.'
  if (change.role !== 'workspace_admin') return 'The workspace’s owner is always an admin. Transfer its ownership first.'
  return null
}
