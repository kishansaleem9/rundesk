/**
 * §15 — a skill's slash command.
 *
 * ClickUp: "The /Slash Command for AI Skills appears for everyone in the
 * Workspace." That is the primary way a skill is used — you type it where you
 * are working, not from a settings page.
 *
 * The slug is DERIVED from the name rather than stored. Storing one would make
 * the command stable across a rename, which sounds better until you consider
 * what a person actually does: they rename "Brand Voice" to "Client Voice" and
 * then type `/client-voice`, because that is what the skill is called now. A
 * derived slug follows the name, which is the behaviour that needs no
 * explaining. The cost is that renaming breaks a memorised command — visible
 * and immediate, unlike a stored slug silently disagreeing with the label.
 */

/** Reserved by the chat composer itself; a skill may not shadow one. */
export const RESERVED_SLASH_COMMANDS = ['task', 'remind'] as const

export function skillSlug(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Strip combining marks so "Résumé" and "Resume" reach the same command
      // rather than one of them being untypable on a US keyboard.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '')
  )
}

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLASH_COMMANDS as readonly string[]).includes(slug)
}

/**
 * Find the one skill a typed command means.
 *
 * Names are unique per person, but slugs are not: "Brand Voice" and
 * "Brand-Voice" collapse to the same command, and two colleagues' published
 * skills can collide outright. Returning the first match would make `/brand`
 * mean different things depending on row order, so an ambiguous command is
 * reported as ambiguous and the person is told which names collided.
 */
export type SlugResolution<T> =
  | { kind: 'match'; skill: T }
  | { kind: 'none' }
  | { kind: 'ambiguous'; names: string[] }

export function resolveSlug<T extends { name: string }>(
  slug: string,
  candidates: T[],
): SlugResolution<T> {
  const hits = candidates.filter((c) => skillSlug(c.name) === slug)
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length > 1) return { kind: 'ambiguous', names: hits.map((h) => h.name) }
  return { kind: 'match', skill: hits[0] }
}
