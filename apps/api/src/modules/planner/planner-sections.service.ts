import { Injectable, Inject, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { and, asc, eq, inArray, max, ne } from 'drizzle-orm'
import { plannerRailSections, plannerRailSectionTasks, tasks, users } from '@rundesk/db'
import type { Db, PlannerSettings } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { readableTaskIds, taskReadAnswer } from '../../common/permissions/read-access'
import { isUuid } from '../../common/validation/uuid'

/** A section of one's own, in `railSections`: `section:<id>`. */
export const SECTION_KEY_PREFIX = 'section:'
export const sectionKey = (id: string) => `${SECTION_KEY_PREFIX}${id}`
export const sectionIdOf = (key: unknown): string | null =>
  typeof key === 'string' && key.startsWith(SECTION_KEY_PREFIX) && isUuid(key.slice(SECTION_KEY_PREFIX.length))
    ? key.slice(SECTION_KEY_PREFIX.length)
    : null

/** How many sections of one's own a rail takes, and how many tasks one holds. */
export const MAX_RAIL_SECTIONS = 20
export const MAX_SECTION_TASKS = 100
export const SECTION_NAME_MAX = 60

export type RailSectionTask = { id: string; title: string; status: string; dueDate: string | null }
export type RailSectionView = { id: string; name: string; emoji: string | null; createdAt: string; tasks: RailSectionTask[] }

/**
 * THE RAIL'S ORDER, SAVED FROM ONE WORKSPACE, KEEPS THE OTHERS' SECTIONS WHERE
 * THEY WERE. `railSections` is one order for the person, and a page in one
 * workspace sends only the sections it draws; the sections of another
 * workspace (`foreign`) would drop out of it and fall to the foot of their
 * own rail. Each goes back after the key it followed, or first when nothing
 * it followed is left.
 */
export function mergeRailOrder(stored: readonly string[], next: readonly string[], foreign: (key: string) => boolean): string[] {
  const out = [...next]
  stored.forEach((key, i) => {
    if (!foreign(key) || out.includes(key)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(stored[j])
      if (k !== -1) {
        at = k + 1
        break
      }
    }
    out.splice(at, 0, key)
  })
  return out
}

/**
 * "+ ADD A NEW SECTION" IN THE PLANNER'S RAIL (`commit-log/log-716d25c-1`,
 * `ledger-rows/row-835`), as ClickUp makes its own sidebar sections: a name and
 * an optional emoji, tasks put in by hand — each in one of the person's
 * sections at a time — and deleting one leaves its tasks as they were.
 *
 * A section is its maker's alone, in one workspace: every route asks for the
 * caller's own section in the workspace it names, and a colleague's is not
 * there (404). A task goes in only when its reader may open it, refused as the
 * read is refused; and the rail lists only those they still may, not archived
 * nor in the trash.
 */
@Injectable()
export class PlannerSectionsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async list(workspaceId: string, userId: string): Promise<RailSectionView[]> {
    const sections = await this.db
      .select()
      .from(plannerRailSections)
      .where(and(eq(plannerRailSections.userId, userId), eq(plannerRailSections.workspaceId, workspaceId)))
      .orderBy(asc(plannerRailSections.createdAt), asc(plannerRailSections.id))
    if (sections.length === 0) return []
    const picks = await this.db
      .select({
        sectionId: plannerRailSectionTasks.sectionId,
        taskId: plannerRailSectionTasks.taskId,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        isArchived: tasks.isArchived,
        deletedAt: tasks.deletedAt,
      })
      .from(plannerRailSectionTasks)
      .innerJoin(tasks, eq(tasks.id, plannerRailSectionTasks.taskId))
      .where(inArray(plannerRailSectionTasks.sectionId, sections.map((s) => s.id)))
      .orderBy(asc(plannerRailSectionTasks.position), asc(plannerRailSectionTasks.addedAt))
    const readable = await readableTaskIds(this.db, workspaceId, userId, picks.map((p) => p.taskId))
    return sections.map((s) => ({
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      createdAt: s.createdAt.toISOString(),
      tasks: picks
        .filter((p) => p.sectionId === s.id && readable.has(p.taskId) && !p.isArchived && !p.deletedAt)
        .map((p) => ({ id: p.taskId, title: p.title, status: p.status, dueDate: p.dueDate ? p.dueDate.toISOString() : null })),
    }))
  }

  async create(workspaceId: string, userId: string, body: { name?: unknown; emoji?: unknown }): Promise<RailSectionView> {
    const name = this.nameOf(body.name)
    const emoji = this.emojiOf(body.emoji)
    const mine = await this.db
      .select({ id: plannerRailSections.id })
      .from(plannerRailSections)
      .where(and(eq(plannerRailSections.userId, userId), eq(plannerRailSections.workspaceId, workspaceId)))
    if (mine.length >= MAX_RAIL_SECTIONS) {
      throw new BadRequestException(`The rail takes ${MAX_RAIL_SECTIONS} sections of your own`)
    }
    const [made] = await this.db
      .insert(plannerRailSections)
      .values({ workspaceId, userId, name, emoji })
      .returning()
    return { id: made.id, name: made.name, emoji: made.emoji, createdAt: made.createdAt.toISOString(), tasks: [] }
  }

  async update(workspaceId: string, userId: string, sectionId: string, body: { name?: unknown; emoji?: unknown }) {
    await this.own(workspaceId, userId, sectionId)
    const patch: { name?: string; emoji?: string | null } = {}
    if (body.name !== undefined) patch.name = this.nameOf(body.name)
    if (body.emoji !== undefined) patch.emoji = this.emojiOf(body.emoji)
    if (Object.keys(patch).length === 0) throw new BadRequestException('Nothing to change: a name or an emoji')
    const [row] = await this.db.update(plannerRailSections).set(patch).where(eq(plannerRailSections.id, sectionId)).returning()
    return { id: row.id, name: row.name, emoji: row.emoji }
  }

  /** The section goes, and its place in the rail's order; its tasks stay as they were. */
  async remove(workspaceId: string, userId: string, sectionId: string) {
    await this.own(workspaceId, userId, sectionId)
    await this.db.transaction(async (tx) => {
      await tx.delete(plannerRailSections).where(eq(plannerRailSections.id, sectionId))
      const [row] = await tx.select({ settings: users.plannerSettings }).from(users).where(eq(users.id, userId)).limit(1)
      const settings = (row?.settings ?? {}) as PlannerSettings
      if (Array.isArray(settings.railSections) && settings.railSections.includes(sectionKey(sectionId))) {
        await tx
          .update(users)
          .set({ plannerSettings: { ...settings, railSections: settings.railSections.filter((k) => k !== sectionKey(sectionId)) } })
          .where(eq(users.id, userId))
      }
    })
    return { deleted: true }
  }

  /**
   * A task into a section: one the person may open, in this workspace, not
   * archived nor in the trash. Already in another of their sections, it moves.
   */
  async addTask(workspaceId: string, userId: string, sectionId: string, taskId: unknown) {
    await this.own(workspaceId, userId, sectionId)
    if (typeof taskId !== 'string' || !isUuid(taskId)) throw new BadRequestException('Name the task to put in the section')
    const answer = await taskReadAnswer(this.db, workspaceId, taskId, { id: userId })
    if (!answer) throw new NotFoundException('Task not found')
    if ('refused' in answer) throw new ForbiddenException(answer.refused)
    const [task] = await this.db
      .select({ isArchived: tasks.isArchived, deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (task?.deletedAt) throw new BadRequestException('The task is in the trash')
    if (task?.isArchived) throw new BadRequestException('The task is archived')
    const held = await this.db
      .select({ taskId: plannerRailSectionTasks.taskId })
      .from(plannerRailSectionTasks)
      .where(and(eq(plannerRailSectionTasks.sectionId, sectionId), ne(plannerRailSectionTasks.taskId, taskId)))
    if (held.length >= MAX_SECTION_TASKS) throw new BadRequestException(`A section holds ${MAX_SECTION_TASKS} tasks`)
    await this.db.transaction(async (tx) => {
      // One section at a time: from wherever else this person had put it.
      await tx
        .delete(plannerRailSectionTasks)
        .where(and(eq(plannerRailSectionTasks.userId, userId), eq(plannerRailSectionTasks.taskId, taskId)))
      const [last] = await tx
        .select({ top: max(plannerRailSectionTasks.position) })
        .from(plannerRailSectionTasks)
        .where(eq(plannerRailSectionTasks.sectionId, sectionId))
      await tx.insert(plannerRailSectionTasks).values({ sectionId, taskId, userId, position: (last?.top ?? -1) + 1 })
    })
    return { sectionId, taskId }
  }

  async removeTask(workspaceId: string, userId: string, sectionId: string, taskId: string) {
    await this.own(workspaceId, userId, sectionId)
    if (!isUuid(taskId)) throw new NotFoundException('That task is not in the section')
    const gone = await this.db
      .delete(plannerRailSectionTasks)
      .where(and(eq(plannerRailSectionTasks.sectionId, sectionId), eq(plannerRailSectionTasks.taskId, taskId)))
      .returning({ taskId: plannerRailSectionTasks.taskId })
    if (gone.length === 0) throw new NotFoundException('That task is not in the section')
    return { removed: true }
  }

  private async own(workspaceId: string, userId: string, sectionId: string) {
    if (!isUuid(sectionId)) throw new NotFoundException('No such section')
    const [row] = await this.db
      .select({ id: plannerRailSections.id })
      .from(plannerRailSections)
      .where(
        and(
          eq(plannerRailSections.id, sectionId),
          eq(plannerRailSections.userId, userId),
          eq(plannerRailSections.workspaceId, workspaceId),
        ),
      )
      .limit(1)
    if (!row) throw new NotFoundException('No such section')
  }

  private nameOf(raw: unknown): string {
    const name = typeof raw === 'string' ? raw.trim() : ''
    if (!name) throw new BadRequestException('Name the section')
    if (name.length > SECTION_NAME_MAX) throw new BadRequestException(`A section's name is ${SECTION_NAME_MAX} characters at most`)
    return name
  }

  /** One emoji, or none: up to 8 code units carries a flag or a family; text is not an emoji. */
  private emojiOf(raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === '') return null
    if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > 8 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(raw) || /[\p{L}\p{N}]/u.test(raw)) {
      throw new BadRequestException('The emoji is one emoji, or none')
    }
    return raw.trim()
  }
}
