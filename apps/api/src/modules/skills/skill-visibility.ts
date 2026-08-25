import { and, eq, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { skillInstalls, skills } from '@rundesk/db'

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
 * "This person has installed it."
 *
 * A correlated EXISTS rather than a join: a join against `skill_installs` would
 * multiply rows the moment its unique constraint was not doing its job, so a
 * list would quietly show duplicates — a rendering bug a long way from its
 * cause. EXISTS cannot return more rows than the table it filters.
 *
 * Written as a `sql` fragment so this module stays pure and DB-free, and the
 * predicate can be rendered and asserted on without a connection.
 */
export function installedByFilter(userId: string): SQL {
  return sql`exists (select 1 from ${skillInstalls} where ${skillInstalls.skillId} = ${skills.id} and ${skillInstalls.userId} = ${userId})`
}

/**
 * Her library tabs, frame `285_1743`: "All Skills | ✓ Enabled | 👤 Created by me".
 *
 * ClickUp's hub is where you "browse, install, and manage" skills, so Enabled
 * is the set THIS person installed — not a flag the author set. Read the other
 * way the tab would be a filter on someone else's switch sitting next to
 * "Created by me", which is two views of authorship and none of use.
 *
 * Every tab narrows what `visibleSkillsFilter` already allows; none widens it.
 */
export type SkillTab = 'all' | 'enabled' | 'mine'

export function skillTabFilter(tab: SkillTab, workspaceId: string, userId: string): SQL {
  const base = visibleSkillsFilter(workspaceId, userId)
  if (tab === 'enabled') return and(base, installedByFilter(userId))!
  if (tab === 'mine') return and(base, eq(skills.createdById, userId))!
  return base
}
