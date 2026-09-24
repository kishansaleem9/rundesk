import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { eq, asc, and, sql } from 'drizzle-orm'
import { labels, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class LabelsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * WHO MAY MAKE, RENAME AND DELETE A TAG: any member, and no guest. ClickUp's
   * rule (help.clickup.com "Default user role permissions", search snippets):
   * guests may add or remove tags on tasks, but "can't create, edit, or delete
   * tags"; members can, which is why "permissions for tags" is a standing
   * feature request there. Here the routes asked only workspace membership, so
   * a guest made, renamed and deleted the workspace's tags (measured: 201, 200,
   * 200; `found-23-sep/labels-editable-by-any-member`).
   */
  private async assertNotGuest(workspaceId: string, actorId: string) {
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    if (m?.role === 'guest') throw new ForbiddenException('Guests cannot create, rename or delete tags')
  }

  private async workspaceOf(labelId: string): Promise<string> {
    const [row] = await this.db.select({ workspaceId: labels.workspaceId }).from(labels).where(eq(labels.id, labelId)).limit(1)
    if (!row) throw new NotFoundException('Label not found')
    return row.workspaceId
  }

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
  async create(workspaceId: string, data: { name: string; color: string }, actorId: string) {
    const name = data.name.trim()
    if (!name) throw new BadRequestException('A tag needs a name')

    const [existing] = await this.db
      .select()
      .from(labels)
      .where(and(eq(labels.workspaceId, workspaceId), sql`lower(${labels.name}) = lower(${name})`))
      .limit(1)
    // Typing a tag that exists FINDS it, which a guest may do: they may add
    // and remove tags on a task. Making a new one they may not.
    if (existing) return existing
    await this.assertNotGuest(workspaceId, actorId)

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

  async update(labelId: string, data: { name?: string; color?: string }, actorId: string) {
    await this.assertNotGuest(await this.workspaceOf(labelId), actorId)
    const [row] = await this.db
      .update(labels)
      .set({ ...(data.name ? { name: data.name.trim() } : {}), ...(data.color ? { color: data.color } : {}) })
      .where(eq(labels.id, labelId))
      .returning()
    if (!row) throw new NotFoundException('Label not found')
    return row
  }

  async delete(labelId: string, actorId: string) {
    await this.assertNotGuest(await this.workspaceOf(labelId), actorId)
    const [row] = await this.db.delete(labels).where(eq(labels.id, labelId)).returning()
    if (!row) throw new NotFoundException('Label not found')
    return { ok: true }
  }
}
