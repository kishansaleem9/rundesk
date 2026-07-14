import { asc, eq } from 'drizzle-orm'
import { lists, projects, listStatuses, projectStatuses, spaceStatuses } from '@rundesk/db'
import type { Db } from '@rundesk/db'

export type StatusScope = 'list' | 'project' | 'space'

export type EffectiveStatus = {
  key: string
  name: string
  color: string
  category: string
  position: number
}

export type ListStatusContext = {
  listId: string
  projectId: string
  spaceId: string
  scope: StatusScope
}

/**
 * Resolve which scope a list draws its statuses from, along with the owning
 * project + space ids. Returns null if the list does not exist.
 */
export async function getListStatusContext(
  db: Db,
  listId: string,
): Promise<ListStatusContext | null> {
  const [row] = await db
    .select({
      listId: lists.id,
      projectId: lists.projectId,
      scope: lists.statusScope,
      spaceId: projects.spaceId,
    })
    .from(lists)
    .innerJoin(projects, eq(projects.id, lists.projectId))
    .where(eq(lists.id, listId))
    .limit(1)
  if (!row) return null
  return {
    listId: row.listId,
    projectId: row.projectId,
    spaceId: row.spaceId,
    scope: (row.scope ?? 'list') as StatusScope,
  }
}

/**
 * Return the effective, ordered status set for a list — honouring its
 * `status_scope`. A list scoped to 'list' (the default) reads its own
 * `list_statuses`; 'project'/'space' read the shared template on the owning
 * project/space. Used by both the read endpoint and the task write path so
 * validation and display never diverge.
 */
export async function resolveEffectiveStatuses(
  db: Db,
  listId: string,
  ctx?: ListStatusContext | null,
): Promise<EffectiveStatus[]> {
  const c = ctx ?? (await getListStatusContext(db, listId))
  if (!c) return []

  if (c.scope === 'project') {
    return db
      .select({
        key: projectStatuses.key,
        name: projectStatuses.name,
        color: projectStatuses.color,
        category: projectStatuses.category,
        position: projectStatuses.position,
      })
      .from(projectStatuses)
      .where(eq(projectStatuses.projectId, c.projectId))
      .orderBy(asc(projectStatuses.position))
  }

  if (c.scope === 'space') {
    return db
      .select({
        key: spaceStatuses.key,
        name: spaceStatuses.name,
        color: spaceStatuses.color,
        category: spaceStatuses.category,
        position: spaceStatuses.position,
      })
      .from(spaceStatuses)
      .where(eq(spaceStatuses.spaceId, c.spaceId))
      .orderBy(asc(spaceStatuses.position))
  }

  return db
    .select({
      key: listStatuses.key,
      name: listStatuses.name,
      color: listStatuses.color,
      category: listStatuses.category,
      position: listStatuses.position,
    })
    .from(listStatuses)
    .where(eq(listStatuses.listId, listId))
    .orderBy(asc(listStatuses.position))
}
