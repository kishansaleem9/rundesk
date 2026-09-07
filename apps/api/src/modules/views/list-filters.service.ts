import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { listFilterPresets } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

/**
 * §V2-07 "Saved filters" — frame `11:41`.
 *
 * The rules themselves are stored as opaque JSON, the same bargain
 * `task_views.config` makes: the shape of a filter tree is a property of the
 * screen that builds and evaluates it, and a server-side mirror of it would be
 * a second definition to keep in step. What IS enforced here is the shape of
 * the CONTAINER — an array, of objects, of a bounded size — because those are
 * the things whose absence would break the reader rather than the filter.
 */

/** One level of nesting, so a saved preset cannot be a tree of arbitrary depth. */
const MAX_NODES = 100

function assertRules(rules: unknown): unknown[] {
  if (rules === undefined) return []
  if (!Array.isArray(rules)) throw new BadRequestException('Filter "rules" must be an array')
  if (rules.length > MAX_NODES) throw new BadRequestException(`A filter can hold at most ${MAX_NODES} rules`)
  for (const node of rules) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      throw new BadRequestException('Each filter rule must be an object')
    }
    const nested = (node as { rules?: unknown }).rules
    if (nested !== undefined) {
      if (!Array.isArray(nested)) throw new BadRequestException('A nested filter\'s "rules" must be an array')
      if (nested.length > MAX_NODES) throw new BadRequestException(`A nested filter can hold at most ${MAX_NODES} rules`)
      for (const leaf of nested) {
        if (leaf === null || typeof leaf !== 'object' || Array.isArray(leaf)) {
          throw new BadRequestException('Each filter rule must be an object')
        }
        // Depth is capped at one: a group inside a group has no control in the
        // panel that builds it, so it could only arrive from a hand-written
        // request and would render as nothing.
        if ((leaf as { rules?: unknown }).rules !== undefined) {
          throw new BadRequestException('Filters can nest one level deep')
        }
      }
    }
  }
  return rules
}

@Injectable()
export class ListFiltersService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  list(listId: string, userId: string) {
    return this.db
      .select()
      .from(listFilterPresets)
      .where(and(eq(listFilterPresets.listId, listId), eq(listFilterPresets.userId, userId)))
      .orderBy(asc(listFilterPresets.name))
  }

  /** Saving under a name you already used replaces it — that is what "save" means. */
  async save(listId: string, userId: string, name: string, rules: unknown) {
    const trimmed = (name ?? '').trim()
    if (!trimmed) throw new BadRequestException('A filter name is required')
    const [row] = await this.db
      .insert(listFilterPresets)
      .values({ listId, userId, name: trimmed.slice(0, 80), rules: assertRules(rules) })
      .onConflictDoUpdate({
        target: [listFilterPresets.listId, listFilterPresets.userId, listFilterPresets.name],
        set: { rules: assertRules(rules), updatedAt: new Date() },
      })
      .returning()
    return row
  }

  /** Scoped by user, so one person cannot delete another's saved filter. */
  async remove(id: string, userId: string) {
    const [row] = await this.db
      .delete(listFilterPresets)
      .where(and(eq(listFilterPresets.id, id), eq(listFilterPresets.userId, userId)))
      .returning()
    if (!row) throw new NotFoundException('Filter not found')
    return { ok: true }
  }
}
