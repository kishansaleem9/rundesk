import { and, eq, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { skills } from '@rundesk/db'

/**
 * §15 — who may see a skill.
 *
 * One predicate, used by every read path, because the alternative is the bug
 * class this repo has already been bitten by twice: a filter that exists on the
 * list endpoint and is quietly missing from the detail endpoint, so the thing
 * you cannot find is still readable if you know its id.
 *
 * The rule: a skill is visible inside its workspace to its owner always, and to
 * everyone else only once it has been published (`visibility = 'workspace'`).
 * `private` is the default, so writing a skill never publishes it by accident.
 */
export function visibleSkillsFilter(workspaceId: string, userId: string): SQL {
  return and(
    eq(skills.workspaceId, workspaceId),
    or(eq(skills.visibility, 'workspace'), eq(skills.createdById, userId)),
  )!
}

/**
 * Her library tabs, frame `285_1743`: "All Skills | ✓ Enabled | 👤 Created by me".
 *
 * `enabled` narrows what is already visible — it never widens it, which is why
 * it composes onto the filter above rather than replacing it.
 */
export type SkillTab = 'all' | 'enabled' | 'mine'

export function skillTabFilter(tab: SkillTab, workspaceId: string, userId: string): SQL {
  const base = visibleSkillsFilter(workspaceId, userId)
  if (tab === 'enabled') return and(base, eq(skills.enabled, true))!
  if (tab === 'mine') return and(base, eq(skills.createdById, userId))!
  return base
}
