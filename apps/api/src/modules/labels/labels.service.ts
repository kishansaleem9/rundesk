import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, asc, and, sql } from 'drizzle-orm'
import { labels } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class LabelsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  list(workspaceId: string) {
    return this.db
      .select()
      .from(labels)
      .where(eq(labels.workspaceId, workspaceId))
      .orderBy(asc(labels.name))
  }

  /**
   * Create a tag, or hand back the one that already answers to that name.
   *
   * §G15 [23:16] — "likh ke ENTER dabao to naya tag ban jaye", which makes this
   * the create path people hit constantly rather than once from a settings
   * screen. Two things follow.
   *
   * It has to be idempotent. `uq_label_name_per_workspace` means a second
   * "urgent" is a 23505, and a type-and-Enter box produces exactly that the
   * moment somebody tags a second task with a tag they already made. Returning
   * the existing row is also what the user meant: they typed a name to get a
   * tag by that name, not to get a new row.
   *
   * And the match has to ignore case, which the constraint does not. "Urgent"
   * and "urgent" are one tag as far as anybody typing is concerned, and letting
   * both exist turns the list into a spelling test.
   */
  async create(workspaceId: string, data: { name: string; color: string }) {
    const name = data.name.trim()
    if (!name) throw new BadRequestException('A tag needs a name')

    const [existing] = await this.db
      .select()
      .from(labels)
      .where(and(eq(labels.workspaceId, workspaceId), sql`lower(${labels.name}) = lower(${name})`))
      .limit(1)
    if (existing) return existing

    try {
      const [row] = await this.db
        .insert(labels)
        .values({ workspaceId, name, color: data.color })
        .returning()
      return row
    } catch (err) {
      // Two people naming the same tag at once. The loser of the race wanted
      // the tag, not the insert.
      if ((err as { code?: string })?.code === '23505') {
        const [raced] = await this.db
          .select()
          .from(labels)
          .where(and(eq(labels.workspaceId, workspaceId), sql`lower(${labels.name}) = lower(${name})`))
          .limit(1)
        if (raced) return raced
      }
      throw err
    }
  }

  async update(labelId: string, data: { name?: string; color?: string }) {
    const [row] = await this.db
      .update(labels)
      .set({ ...(data.name ? { name: data.name.trim() } : {}), ...(data.color ? { color: data.color } : {}) })
      .where(eq(labels.id, labelId))
      .returning()
    if (!row) throw new NotFoundException('Label not found')
    return row
  }

  async delete(labelId: string) {
    const [row] = await this.db.delete(labels).where(eq(labels.id, labelId)).returning()
    if (!row) throw new NotFoundException('Label not found')
    return { ok: true }
  }
}
