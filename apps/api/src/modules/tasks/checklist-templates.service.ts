import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { eq, asc, and, inArray } from 'drizzle-orm'
import {
  checklistTemplates,
  checklistTemplateItems,
  taskChecklists,
  taskChecklistItems,
  tasks,
  lists,
  projects,
  spaces,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

/** Longest a template name may be, and the most items one may carry. */
const MAX_NAME = 200
const MAX_ITEMS = 200

/**
 * Reusable checklists a task can be seeded from — the client's "main template
 * se bhi checklist kar sakti hoon".
 *
 * Applying copies rows rather than pointing at the template, so editing a
 * template later never rewrites checklists already made from it.
 */
@Injectable()
export class ChecklistTemplatesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** The workspace a task belongs to, walking list → project → space. */
  private async workspaceOfTask(taskId: string) {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!row) throw new NotFoundException('Task not found')
    return row.workspaceId
  }

  private async assertMember(workspaceId: string, userId: string) {
    const [m] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!m) throw new ForbiddenException('Workspace membership required')
  }

  /** Templates available in a workspace, newest first, with their items. */
  async list(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId)
    const rows = await this.db
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.workspaceId, workspaceId))
      .orderBy(asc(checklistTemplates.name))
    if (rows.length === 0) return []

    const items = await this.db
      .select()
      .from(checklistTemplateItems)
      .where(inArray(checklistTemplateItems.templateId, rows.map((r) => r.id)))
      .orderBy(asc(checklistTemplateItems.position))

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      items: items
        .filter((i) => i.templateId === r.id)
        .map((i) => ({ id: i.id, content: i.content, position: i.position })),
    }))
  }

  async create(workspaceId: string, userId: string, input: { name: string; items?: string[] }) {
    await this.assertMember(workspaceId, userId)
    const name = (input.name ?? '').trim()
    if (!name) throw new BadRequestException('A template name is required')
    if (name.length > MAX_NAME) throw new BadRequestException(`Name must be ${MAX_NAME} characters or fewer`)

    const contents = (input.items ?? []).map((c) => c.trim()).filter(Boolean)
    if (contents.length > MAX_ITEMS) throw new BadRequestException(`A template may hold at most ${MAX_ITEMS} items`)

    const [tpl] = await this.db
      .insert(checklistTemplates)
      .values({ workspaceId, name, createdById: userId })
      .returning()

    if (contents.length) {
      await this.db.insert(checklistTemplateItems).values(
        contents.map((content, position) => ({ templateId: tpl.id, content, position })),
      )
    }
    return { id: tpl.id, name: tpl.name, itemCount: contents.length }
  }

  /**
   * Save an existing checklist as a template, so a list someone already built
   * by hand can be reused instead of retyped.
   */
  async createFromChecklist(checklistId: string, userId: string, name?: string) {
    const [cl] = await this.db.select().from(taskChecklists).where(eq(taskChecklists.id, checklistId)).limit(1)
    if (!cl) throw new NotFoundException('Checklist not found')
    const workspaceId = await this.workspaceOfTask(cl.taskId)
    await this.assertMember(workspaceId, userId)

    const items = await this.db
      .select({ content: taskChecklistItems.content })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.checklistId, checklistId))
      .orderBy(asc(taskChecklistItems.position))

    return this.create(workspaceId, userId, {
      name: (name ?? cl.title).trim() || cl.title,
      items: items.map((i) => i.content),
    })
  }

  /**
   * Drop a template onto a task as a fresh checklist. Items are copied, and
   * they start unchecked and unassigned — a template describes the work, not
   * who did it last time.
   */
  async applyToTask(taskId: string, templateId: string, userId: string) {
    const workspaceId = await this.workspaceOfTask(taskId)
    await this.assertMember(workspaceId, userId)

    const [tpl] = await this.db
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.id, templateId))
      .limit(1)
    if (!tpl) throw new NotFoundException('Checklist template not found')
    // Templates are workspace-scoped; refuse one borrowed from another tenant.
    if (tpl.workspaceId !== workspaceId) {
      throw new NotFoundException('Checklist template not found')
    }

    const tplItems = await this.db
      .select()
      .from(checklistTemplateItems)
      .where(eq(checklistTemplateItems.templateId, templateId))
      .orderBy(asc(checklistTemplateItems.position))

    // Append after whatever checklists the task already has.
    const existing = await this.db
      .select({ position: taskChecklists.position })
      .from(taskChecklists)
      .where(eq(taskChecklists.taskId, taskId))
    const nextPos = existing.reduce((max, r) => Math.max(max, r.position + 1), 0)

    const [checklist] = await this.db
      .insert(taskChecklists)
      .values({ taskId, title: tpl.name, position: nextPos })
      .returning()

    if (tplItems.length) {
      await this.db.insert(taskChecklistItems).values(
        tplItems.map((i, position) => ({ checklistId: checklist.id, content: i.content, position })),
      )
    }
    return { id: checklist.id, title: checklist.title, itemCount: tplItems.length }
  }

  async remove(templateId: string, userId: string) {
    const [tpl] = await this.db
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.id, templateId))
      .limit(1)
    if (!tpl) throw new NotFoundException('Checklist template not found')
    await this.assertMember(tpl.workspaceId, userId)
    // Items cascade with the template row.
    await this.db.delete(checklistTemplates).where(eq(checklistTemplates.id, templateId))
    return { ok: true }
  }
}
