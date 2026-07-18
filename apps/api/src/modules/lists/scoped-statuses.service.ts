import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import {
  spaceStatuses,
  projectStatuses,
  listStatuses,
  spaces,
  projects,
  lists,
  tasks,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { getListStatusContext, type StatusScope } from '../../common/statuses/status-resolution'

export type StatusCategory = 'open' | 'in_progress' | 'closed'
export type TemplateScope = 'space' | 'project'

type StatusInput = { name: string; color?: string; category?: StatusCategory }
type StatusPatch = { name?: string; color?: string; category?: StatusCategory }

const VALID_CATEGORIES: ReadonlySet<StatusCategory> = new Set(['open', 'in_progress', 'closed'])
const KEY_MAX_LEN = 64
const NAME_MAX_LEN = 60

function slugifyKey(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base) return `status_${Math.random().toString(36).slice(2, 8)}`
  return base.slice(0, KEY_MAX_LEN)
}

/**
 * CRUD for Space- and Project-scoped status templates (see 0036). Mirrors
 * ListStatusesService, but a template is shared by every list that adopts the
 * scope, so category changes and deletes fan out to tasks across ALL of those
 * lists — never orphaning a task's status.
 */
@Injectable()
export class ScopedStatusesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  private table(scope: TemplateScope) {
    return scope === 'space' ? spaceStatuses : projectStatuses
  }
  private ownerCol(scope: TemplateScope) {
    return scope === 'space' ? spaceStatuses.spaceId : projectStatuses.projectId
  }

  async list(scope: TemplateScope, containerId: string) {
    const t = this.table(scope)
    return this.db
      .select()
      .from(t)
      .where(eq(this.ownerCol(scope), containerId))
      .orderBy(asc(t.position), asc(t.createdAt))
  }

  private async getByKey(scope: TemplateScope, containerId: string, key: string) {
    const t = this.table(scope)
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(this.ownerCol(scope), containerId), eq(t.key, key)))
      .limit(1)
    return row ?? null
  }

  private async requireById(scope: TemplateScope, containerId: string, statusId: string) {
    const t = this.table(scope)
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.id, statusId), eq(this.ownerCol(scope), containerId)))
      .limit(1)
    if (!row) throw new NotFoundException(`Status ${statusId} not found in ${scope}`)
    return row
  }

  private async nextPosition(scope: TemplateScope, containerId: string) {
    const t = this.table(scope)
    const [row] = await this.db
      .select({ maxPos: sql<number>`coalesce(max(${t.position}), -1)::int` })
      .from(t)
      .where(eq(this.ownerCol(scope), containerId))
    return (row?.maxPos ?? -1) + 1
  }

  private async assertContainerExists(scope: TemplateScope, containerId: string) {
    if (scope === 'space') {
      const [row] = await this.db.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, containerId)).limit(1)
      if (!row) throw new NotFoundException(`Space ${containerId} not found`)
    } else {
      const [row] = await this.db.select({ id: projects.id }).from(projects).where(eq(projects.id, containerId)).limit(1)
      if (!row) throw new NotFoundException(`Project ${containerId} not found`)
    }
  }

  /** Ids of every list that currently draws its statuses from this template. */
  private async affectedListIds(scope: TemplateScope, containerId: string): Promise<string[]> {
    if (scope === 'project') {
      const rows = await this.db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.projectId, containerId), eq(lists.statusScope, 'project')))
      return rows.map((r) => r.id)
    }
    const rows = await this.db
      .select({ id: lists.id })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .where(and(eq(projects.spaceId, containerId), eq(lists.statusScope, 'space')))
    return rows.map((r) => r.id)
  }

  async create(scope: TemplateScope, containerId: string, input: StatusInput) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new BadRequestException('Status name is required')
    if (name.length > NAME_MAX_LEN) {
      throw new BadRequestException(`Status name must be ${NAME_MAX_LEN} characters or fewer`)
    }
    if (input.category && !VALID_CATEGORIES.has(input.category)) {
      throw new BadRequestException(`Invalid category "${input.category}"`)
    }
    await this.assertContainerExists(scope, containerId)

    const baseKey = slugifyKey(name)
    let key = baseKey
    let attempt = 1
    while (await this.getByKey(scope, containerId, key)) {
      attempt += 1
      key = `${baseKey}_${attempt}`.slice(0, KEY_MAX_LEN)
      if (attempt > 50) throw new ConflictException('Could not generate a unique status key')
    }

    const position = await this.nextPosition(scope, containerId)
    const t = this.table(scope)
    try {
      const [row] = await this.db
        .insert(t)
        .values({
          ...(scope === 'space' ? { spaceId: containerId } : { projectId: containerId }),
          key,
          name,
          color: input.color ?? '#94a3b8',
          category: input.category ?? 'open',
          position,
        } as any)
        .returning()
      return row
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(`A status with key "${key}" already exists in this ${scope}`)
      }
      throw err
    }
  }

  async update(scope: TemplateScope, containerId: string, statusId: string, patch: StatusPatch) {
    const existing = await this.requireById(scope, containerId, statusId)
    const updates: Record<string, unknown> = { updatedAt: new Date() }

    if (patch.name !== undefined) {
      const trimmed = patch.name.trim()
      if (!trimmed) throw new BadRequestException('Status name cannot be empty')
      if (trimmed.length > NAME_MAX_LEN) {
        throw new BadRequestException(`Status name must be ${NAME_MAX_LEN} characters or fewer`)
      }
      updates.name = trimmed
    }
    if (patch.color !== undefined) updates.color = patch.color || '#94a3b8'
    if (patch.category !== undefined) {
      if (!VALID_CATEGORIES.has(patch.category)) {
        throw new BadRequestException(`Invalid category "${patch.category}"`)
      }
      updates.category = patch.category
    }
    if (Object.keys(updates).length === 1) return existing

    const t = this.table(scope)
    const [row] = await this.db.update(t).set(updates).where(eq(t.id, existing.id)).returning()

    // Category bucket changed → propagate to every task on a list that uses
    // this template so completion / report semantics stay consistent.
    if (patch.category && patch.category !== existing.category) {
      const listIds = await this.affectedListIds(scope, containerId)
      if (listIds.length > 0) {
        await this.db
          .update(tasks)
          .set({ statusCategory: patch.category, updatedAt: new Date() })
          .where(and(inArray(tasks.listId, listIds), eq(tasks.status, existing.key)))
      }
    }
    return row
  }

  async remove(
    scope: TemplateScope,
    containerId: string,
    statusId: string,
    reassignToStatusId?: string | null,
  ) {
    const existing = await this.requireById(scope, containerId, statusId)
    const listIds = await this.affectedListIds(scope, containerId)

    let count = 0
    if (listIds.length > 0) {
      const [{ c }] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(inArray(tasks.listId, listIds), eq(tasks.status, existing.key)))
      count = c
    }

    if (count > 0) {
      if (!reassignToStatusId) {
        throw new BadRequestException(
          `Cannot delete status "${existing.name}": ${count} task(s) across this ${scope} still use it. ` +
            `Pass reassignToStatusId to move them first.`,
        )
      }
      const replacement = await this.requireById(scope, containerId, reassignToStatusId)
      if (replacement.id === existing.id) {
        throw new BadRequestException('reassignToStatusId must be a different status')
      }
      await this.db
        .update(tasks)
        .set({ status: replacement.key, statusCategory: replacement.category, updatedAt: new Date() })
        .where(and(inArray(tasks.listId, listIds), eq(tasks.status, existing.key)))
    }

    const t = this.table(scope)
    await this.db.delete(t).where(eq(t.id, existing.id))
    return { ok: true, reassignedCount: count }
  }

  /**
   * Switch which scope a list draws its statuses from. Refuses the switch if
   * the target status set is empty, or if any status key currently used by a
   * task on the list is absent from the target set (which would orphan it).
   */
  async setListScope(listId: string, target: StatusScope) {
    const ctx = await getListStatusContext(this.db, listId)
    if (!ctx) throw new NotFoundException(`List ${listId} not found`)
    if (ctx.scope === target) return { listId, scope: target, changed: false }

    let targetKeys: string[]
    if (target === 'list') {
      targetKeys = (
        await this.db.select({ key: listStatuses.key }).from(listStatuses).where(eq(listStatuses.listId, listId))
      ).map((r) => r.key)
    } else if (target === 'project') {
      targetKeys = (
        await this.db
          .select({ key: projectStatuses.key })
          .from(projectStatuses)
          .where(eq(projectStatuses.projectId, ctx.projectId))
      ).map((r) => r.key)
    } else {
      targetKeys = (
        await this.db
          .select({ key: spaceStatuses.key })
          .from(spaceStatuses)
          .where(eq(spaceStatuses.spaceId, ctx.spaceId))
      ).map((r) => r.key)
    }

    if (targetKeys.length === 0) {
      throw new BadRequestException(
        `The ${target} has no statuses defined yet. Add statuses to it before switching this list.`,
      )
    }

    const targetSet = new Set(targetKeys)
    const usedKeys = (
      await this.db
        .selectDistinct({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.listId, listId))
    ).map((r) => r.status)
    const missing = usedKeys.filter((k) => !targetSet.has(k))
    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot switch to the ${target} status set: it is missing status(es) still used by tasks here: ${missing.join(', ')}. ` +
          `Add them to the ${target} first.`,
      )
    }

    await this.db.update(lists).set({ statusScope: target, updatedAt: new Date() }).where(eq(lists.id, listId))
    return { listId, scope: target, changed: true }
  }

  async reorder(scope: TemplateScope, containerId: string, orderedIds: string[]) {
    const all = await this.list(scope, containerId)
    const validIds = new Set(all.map((s) => s.id))
    const missing = orderedIds.filter((id) => !validIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(`These ids are not statuses of this ${scope}: ${missing.join(', ')}`)
    }
    if (orderedIds.length !== all.length) {
      throw new BadRequestException('orderedIds must contain every status of the container exactly once')
    }
    const t = this.table(scope)
    await Promise.all(
      orderedIds.map((id, position) =>
        this.db.update(t).set({ position, updatedAt: new Date() }).where(eq(t.id, id)),
      ),
    )
    return this.list(scope, containerId)
  }
}
