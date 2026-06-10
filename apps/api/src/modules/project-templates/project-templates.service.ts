import { Injectable, Inject, NotFoundException, BadRequestException, Logger, type OnModuleInit } from '@nestjs/common'
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

// Platform-wide built-in templates (workspaceId = null). Seeded idempotently on
// boot so the starter catalog is genuinely applyable, not decorative. `icon` is
// a lucide icon name the web app maps to a component + cover gradient.
const BUILT_IN_TEMPLATES: Array<{ name: string; description: string; icon: string; payload: TemplatePayload }> = [
  {
    name: 'Software sprint',
    description: 'Backlog → in progress → review → done, tuned for engineering teams.',
    icon: 'Code2',
    payload: {
      lists: [
        { name: 'Backlog', position: 0, tasks: [
          { title: 'Define sprint goal', priority: 'high', status: 'todo' },
          { title: 'Groom & estimate backlog', priority: 'normal', status: 'todo' },
        ] },
        { name: 'In progress', position: 1, tasks: [] },
        { name: 'In review', position: 2, tasks: [] },
        { name: 'Done', position: 3, tasks: [] },
      ],
    },
  },
  {
    name: 'Client onboarding',
    description: 'Kickoff → discovery → delivery → handoff, with a checklist per phase.',
    icon: 'Users',
    payload: {
      lists: [
        { name: 'Kickoff', position: 0, tasks: [
          { title: 'Schedule kickoff call', priority: 'high', status: 'todo' },
          { title: 'Share welcome packet', priority: 'normal', status: 'todo' },
        ] },
        { name: 'Discovery', position: 1, tasks: [
          { title: 'Document requirements', priority: 'high', status: 'todo' },
        ] },
        { name: 'Delivery', position: 2, tasks: [] },
        { name: 'Handoff', position: 3, tasks: [
          { title: 'Final walkthrough', priority: 'normal', status: 'todo' },
        ] },
      ],
    },
  },
  {
    name: 'Marketing campaign',
    description: 'Content calendar, briefs, design review and a launch checklist.',
    icon: 'Megaphone',
    payload: {
      lists: [
        { name: 'Ideas', position: 0, tasks: [{ title: 'Brainstorm campaign themes', status: 'todo' }] },
        { name: 'In production', position: 1, tasks: [
          { title: 'Write campaign brief', priority: 'high', status: 'todo' },
          { title: 'Design key visuals', priority: 'normal', status: 'todo' },
        ] },
        { name: 'Review', position: 2, tasks: [] },
        { name: 'Launched', position: 3, tasks: [] },
      ],
    },
  },
  {
    name: 'Product launch',
    description: 'Cross-functional plan with go/no-go gates, PR tasks and ops readiness.',
    icon: 'Rocket',
    payload: {
      lists: [
        { name: 'Pre-launch', position: 0, tasks: [
          { title: 'Finalize launch date', priority: 'high', status: 'todo' },
          { title: 'Draft press release', priority: 'normal', status: 'todo' },
          { title: 'Go / no-go review', priority: 'urgent', status: 'todo' },
        ] },
        { name: 'Launch day', position: 1, tasks: [{ title: 'Publish announcement', priority: 'high', status: 'todo' }] },
        { name: 'Post-launch', position: 2, tasks: [{ title: 'Collect feedback & metrics', status: 'todo' }] },
      ],
    },
  },
  {
    name: 'OKR quarterly cycle',
    description: 'Set objectives, draft key results and run weekly check-ins.',
    icon: 'ListChecks',
    payload: {
      lists: [
        { name: 'Objectives', position: 0, tasks: [{ title: 'Draft quarterly objectives', priority: 'high', status: 'todo' }] },
        { name: 'Key results', position: 1, tasks: [{ title: 'Define measurable key results', priority: 'high', status: 'todo' }] },
        { name: 'Weekly check-ins', position: 2, tasks: [] },
        { name: 'Retrospective', position: 3, tasks: [] },
      ],
    },
  },
  {
    name: 'Bug triage flow',
    description: 'Severity lanes from newly reported through fixed and verified.',
    icon: 'Bug',
    payload: {
      lists: [
        { name: 'Reported', position: 0, tasks: [{ title: 'Triage incoming bug', priority: 'high', status: 'todo' }] },
        { name: 'Confirmed', position: 1, tasks: [] },
        { name: 'In progress', position: 2, tasks: [] },
        { name: 'Fixed / verified', position: 3, tasks: [] },
      ],
    },
  },
]

@Injectable()
export class ProjectTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(ProjectTemplatesService.name)

  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async onModuleInit() {
    try {
      await this.ensureBuiltIns()
    } catch (err) {
      // Seeding the built-in catalog must never block API boot.
      this.logger.warn(`Could not seed built-in templates: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** Insert any missing platform-wide built-in templates (idempotent by name). */
  async ensureBuiltIns() {
    const existing = await this.db
      .select({ name: projectTemplates.name })
      .from(projectTemplates)
      .where(and(isNull(projectTemplates.workspaceId), eq(projectTemplates.isBuiltIn, true)))
    const have = new Set(existing.map((r) => r.name))
    const missing = BUILT_IN_TEMPLATES.filter((t) => !have.has(t.name))
    if (missing.length === 0) return { inserted: 0 }
    // onConflictDoNothing + the uq_builtin_template_name partial index make this
    // safe even if two instances boot and seed concurrently.
    await this.db
      .insert(projectTemplates)
      .values(
        missing.map((t) => ({
          workspaceId: null,
          name: t.name,
          description: t.description,
          icon: t.icon,
          payload: t.payload,
          isBuiltIn: true,
        })),
      )
      .onConflictDoNothing()
    this.logger.log(`Seeded ${missing.length} built-in project template(s)`)
    return { inserted: missing.length }
  }

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
