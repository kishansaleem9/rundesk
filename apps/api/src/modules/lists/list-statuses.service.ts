import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import { listStatuses, lists, tasks, projectStatuses, spaceStatuses } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { getListStatusContext } from '../../common/statuses/status-resolution'

export type StatusCategory = 'open' | 'in_progress' | 'closed'

export type ListStatusCreateInput = {
  name: string
  color?: string
  category?: StatusCategory
}

export type ListStatusUpdateInput = {
  name?: string
  color?: string
  category?: StatusCategory
}

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

@Injectable()
export class ListStatusesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async list(listId: string) {
    const ctx = await getListStatusContext(this.db, listId)
    const scope = ctx?.scope ?? 'list'

    if (scope === 'project' && ctx) {
      const rows = await this.db
        .select()
        .from(projectStatuses)
        .where(eq(projectStatuses.projectId, ctx.projectId))
        .orderBy(asc(projectStatuses.position), asc(projectStatuses.createdAt))
      return rows.map((r) => ({ ...r, listId, scope }))
    }
    if (scope === 'space' && ctx) {
      const rows = await this.db
        .select()
        .from(spaceStatuses)
        .where(eq(spaceStatuses.spaceId, ctx.spaceId))
        .orderBy(asc(spaceStatuses.position), asc(spaceStatuses.createdAt))
      return rows.map((r) => ({ ...r, listId, scope }))
    }

    const rows = await this.db
      .select()
      .from(listStatuses)
      .where(eq(listStatuses.listId, listId))
      .orderBy(asc(listStatuses.position), asc(listStatuses.createdAt))
    return rows.map((r) => ({ ...r, scope: 'list' as const }))
  }

  /**
   * List-level status mutations are only valid when the list owns its own
   * pipeline. If it inherits a project/space template, the caller must edit
   * that template instead (409, so the UI can redirect).
   */
  private async assertOwnScope(listId: string) {
    const ctx = await getListStatusContext(this.db, listId)
    if (ctx && ctx.scope !== 'list') {
      throw new ConflictException(
        `This list uses the ${ctx.scope}'s status set. Edit statuses at the ${ctx.scope} level instead.`,
      )
    }
  }

  /**
   * Return the canonical id, name, color, and category for a status `key`
   * on a list. Used by tasks.service to validate status changes and derive
   * the status_category bucket atomically.
   */
  async getByKey(listId: string, key: string) {
    const [row] = await this.db
      .select()
      .from(listStatuses)
      .where(and(eq(listStatuses.listId, listId), eq(listStatuses.key, key)))
      .limit(1)
    return row ?? null
  }

  async create(listId: string, input: ListStatusCreateInput) {
    const name = input.name?.trim()
    if (!name) throw new BadRequestException('Status name is required')
    if (name.length > NAME_MAX_LEN) {
      throw new BadRequestException(`Status name must be ${NAME_MAX_LEN} characters or fewer`)
    }
    if (input.category && !VALID_CATEGORIES.has(input.category)) {
      throw new BadRequestException(`Invalid category "${input.category}"`)
    }

    await this.assertListExists(listId)
    await this.assertOwnScope(listId)

    // Generate a unique key from the name; suffix on collision.
    const baseKey = slugifyKey(name)
    let key = baseKey
    let attempt = 1
    while (await this.getByKey(listId, key)) {
      attempt += 1
      key = `${baseKey}_${attempt}`.slice(0, KEY_MAX_LEN)
      if (attempt > 50) throw new ConflictException('Could not generate a unique status key')
    }

    const nextPosition = await this.nextPosition(listId)
    try {
      const [row] = await this.db
        .insert(listStatuses)
        .values({
          listId,
          key,
          name,
          color: input.color ?? '#94a3b8',
          category: input.category ?? 'open',
          position: nextPosition,
        })
        .returning()
      return row
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(`A status with key "${key}" already exists in this list`)
      }
      throw err
    }
  }

  async update(listId: string, statusId: string, patch: ListStatusUpdateInput) {
    await this.assertOwnScope(listId)
    const existing = await this.requireById(listId, statusId)
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

    const [row] = await this.db
      .update(listStatuses)
      .set(updates)
      .where(eq(listStatuses.id, existing.id))
      .returning()

    // If the category bucket changed, propagate to every task still on
    // this status so reports / "is task closed?" checks stay consistent.
    if (patch.category && patch.category !== existing.category) {
      await this.db
        .update(tasks)
        .set({ statusCategory: patch.category, updatedAt: new Date() })
        .where(and(eq(tasks.listId, listId), eq(tasks.status, existing.key)))
    }

    return row
  }

  /**
   * Delete a status. If any tasks still reference it the caller must pass
   * `reassignToStatusId` so we can rebind them atomically; we never delete
   * a status that would orphan tasks.
   */
  async remove(listId: string, statusId: string, reassignToStatusId?: string | null) {
    await this.assertOwnScope(listId)
    const existing = await this.requireById(listId, statusId)

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.listId, listId), eq(tasks.status, existing.key)))

    if (count > 0) {
      if (!reassignToStatusId) {
        throw new BadRequestException(
          `Cannot delete status "${existing.name}": ${count} task(s) still use it. ` +
            `Pass reassignToStatusId to move them first.`,
        )
      }
      const replacement = await this.requireById(listId, reassignToStatusId)
      if (replacement.id === existing.id) {
        throw new BadRequestException('reassignToStatusId must be a different status')
      }
      await this.db
        .update(tasks)
        .set({
          status: replacement.key,
          statusCategory: replacement.category,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.listId, listId), eq(tasks.status, existing.key)))
    }

    await this.db.delete(listStatuses).where(eq(listStatuses.id, existing.id))
    return { ok: true, reassignedCount: count }
  }

  /**
   * Bulk reorder. Caller passes the full id array in the desired order;
   * we rewrite `position` to match the array index so subsequent reads
   * stay deterministic.
   */
  async reorder(listId: string, orderedIds: string[]) {
    await this.assertOwnScope(listId)
    const all = await this.list(listId)
    const validIds = new Set(all.map((s) => s.id))
    const missing = orderedIds.filter((id) => !validIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(
        `These ids are not statuses of this list: ${missing.join(', ')}`,
      )
    }
    if (orderedIds.length !== all.length) {
      throw new BadRequestException('orderedIds must contain every status of the list exactly once')
    }
    await Promise.all(
      orderedIds.map((id, position) =>
        this.db
          .update(listStatuses)
          .set({ position, updatedAt: new Date() })
          .where(eq(listStatuses.id, id)),
      ),
    )
    return this.list(listId)
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private async requireById(listId: string, statusId: string) {
    const [row] = await this.db
      .select()
      .from(listStatuses)
      .where(and(eq(listStatuses.id, statusId), eq(listStatuses.listId, listId)))
      .limit(1)
    if (!row) throw new NotFoundException(`Status ${statusId} not found in list`)
    return row
  }

  private async nextPosition(listId: string) {
    const [row] = await this.db
      .select({ maxPos: sql<number>`coalesce(max(${listStatuses.position}), -1)::int` })
      .from(listStatuses)
      .where(eq(listStatuses.listId, listId))
    return (row?.maxPos ?? -1) + 1
  }

  private async assertListExists(listId: string) {
    const [row] = await this.db.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).limit(1)
    if (!row) throw new NotFoundException(`List ${listId} not found`)
  }
}
