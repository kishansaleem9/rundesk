import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, eq, desc, isNull, or, asc } from 'drizzle-orm'
import {
  projectTemplates,
  projects,
  lists,
  tasks,
  spaces,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

type TemplatePayload = NonNullable<typeof projectTemplates.$inferSelect.payload>
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'

@Injectable()
export class ProjectTemplatesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** List both built-in templates and the workspace's own saved templates. */
  async list(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(projectTemplates)
      .where(or(isNull(projectTemplates.workspaceId), eq(projectTemplates.workspaceId, workspaceId)))
      .orderBy(desc(projectTemplates.isBuiltIn), desc(projectTemplates.createdAt))
    return rows
  }

  async getOne(workspaceId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(projectTemplates)
      .where(eq(projectTemplates.id, id))
      .limit(1)
    if (!row) throw new NotFoundException('Template not found')
    // Built-ins are visible to everyone; workspace templates only to that workspace.
    if (row.workspaceId && row.workspaceId !== workspaceId) {
      throw new NotFoundException('Template not found')
    }
    return row
  }

  /**
   * Snapshot an existing project (with its lists and tasks) into a named
   * template owned by this workspace.
   */
  async saveFromProject(
    workspaceId: string,
    userId: string,
    dto: { projectId: string; name: string; description?: string; icon?: string },
  ) {
    // Confirm the project belongs to this workspace.
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(projects.id, dto.projectId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!project) throw new NotFoundException('Project not found in this workspace')

    const projectLists = await this.db
      .select()
      .from(lists)
      .where(eq(lists.projectId, dto.projectId))
      .orderBy(asc(lists.position))

    const payload: TemplatePayload = { lists: [] }
    for (const list of projectLists) {
      const listTasks = await this.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.listId, list.id), eq(tasks.isArchived, false)))
        .orderBy(asc(tasks.position))
      payload.lists.push({
        name: list.name,
        position: list.position,
        tasks: listTasks.map((t) => ({
          title: t.title,
          description: t.description,
          priority: t.priority as TaskPriority,
          status: t.status as TaskStatus,
        })),
      })
    }

    const [row] = await this.db
      .insert(projectTemplates)
      .values({
        workspaceId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        payload,
        createdById: userId,
      })
      .returning()
    return row
  }

  /** Manually create a template from an inline payload (for built-ins or quick create). */
  async create(
    workspaceId: string,
    userId: string,
    dto: { name: string; description?: string; icon?: string; payload: TemplatePayload },
  ) {
    if (!dto.payload?.lists) throw new BadRequestException('Template payload must contain lists')
    const [row] = await this.db
      .insert(projectTemplates)
      .values({
        workspaceId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        payload: dto.payload,
        createdById: userId,
      })
      .returning()
    return row
  }

  async delete(workspaceId: string, id: string) {
    const tpl = await this.getOne(workspaceId, id)
    if (tpl.isBuiltIn) throw new BadRequestException('Cannot delete a built-in template')
    if (tpl.workspaceId !== workspaceId) throw new NotFoundException('Template not found')
    await this.db.delete(projectTemplates).where(eq(projectTemplates.id, id))
    return { ok: true }
  }

  /**
   * Materialize a template: create a new project under `targetSpaceId`
   * (must belong to this workspace), recreate all lists + task stubs.
   */
  async apply(
    workspaceId: string,
    userId: string,
    dto: { templateId: string; targetSpaceId: string; projectName?: string },
  ) {
    const tpl = await this.getOne(workspaceId, dto.templateId)

    const [space] = await this.db
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, dto.targetSpaceId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!space) throw new NotFoundException('Target space not found in this workspace')

    const [project] = await this.db
      .insert(projects)
      .values({
        spaceId: dto.targetSpaceId,
        name: dto.projectName ?? tpl.name,
        description: tpl.description ?? `Created from template "${tpl.name}"`,
        icon: tpl.icon,
      })
      .returning()

    let tasksCreated = 0
    let listsCreated = 0
    for (const list of tpl.payload.lists) {
      const [createdList] = await this.db
        .insert(lists)
        .values({
          projectId: project.id,
          name: list.name,
          position: list.position ?? listsCreated,
        })
        .returning()
      listsCreated++

      for (const task of list.tasks) {
        await this.db.insert(tasks).values({
          listId: createdList.id,
          createdById: userId,
          title: task.title,
          description: task.description,
          priority: task.priority ?? 'normal',
          status: task.status ?? 'todo',
        })
        tasksCreated++
      }
    }

    return { project, listsCreated, tasksCreated }
  }
}
