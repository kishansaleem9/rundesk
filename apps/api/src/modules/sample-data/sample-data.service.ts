import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { and, count, eq } from 'drizzle-orm'
import {
  spaces,
  projects,
  lists,
  tasks,
  taskAssignees,
  taskChecklists,
  taskChecklistItems,
  labels,
  taskLabelAssignments,
  docs,
  goals,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

type Priority = 'urgent' | 'high' | 'normal' | 'low'

export interface SeedSummary {
  spaces: number
  projects: number
  lists: number
  tasks: number
  subtasks: number
  checklistItems: number
  labels: number
  docs: number
  goals: number
}

/**
 * Generates a realistic, opinionated demo workspace so brand-new
 * workspaces have something to explore instead of an empty shell.
 *
 * The seeder is intentionally **idempotent-by-refusal** — if the
 * workspace already has any spaces, the call rejects with a 409.
 * That keeps it safe to expose to admins while preventing accidental
 * duplication.
 */
@Injectable()
export class SampleDataService {
  private readonly logger = new Logger(SampleDataService.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly security: SecurityService,
  ) {}

  async seed(workspaceId: string, actor: { id: string; email?: string }): Promise<SeedSummary> {
    await this.assertEmpty(workspaceId)
    await this.requireActorMembership(workspaceId, actor.id)
    const summary: SeedSummary = {
      spaces: 0,
      projects: 0,
      lists: 0,
      tasks: 0,
      subtasks: 0,
      checklistItems: 0,
      labels: 0,
      docs: 0,
      goals: 0,
    }

    const labelIds = await this.createLabels(workspaceId, summary)
    const created = await this.createTree(workspaceId, actor.id, labelIds, summary)
    await this.createDocs(workspaceId, actor.id, created.spaceIds, summary)
    await this.createGoals(workspaceId, actor.id, created.spaceIds, summary)

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'workspace.demo_seeded',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: 'Demo data loaded into workspace',
      metadata: {
        spaces: summary.spaces,
        projects: summary.projects,
        lists: summary.lists,
        tasks: summary.tasks,
        docs: summary.docs,
        goals: summary.goals,
      },
    })

    this.logger.log(
      `Seeded demo data into workspace ${workspaceId}: ${JSON.stringify(summary)}`,
    )

    return summary
  }

  // ------------------------------------------------------------ guards

  private async assertEmpty(workspaceId: string) {
    const [row] = await this.db
      .select({ value: count() })
      .from(spaces)
      .where(eq(spaces.workspaceId, workspaceId))
    const existing = Number(row?.value ?? 0)
    if (existing > 0) {
      throw new ConflictException(
        `Workspace already has ${existing} space${existing === 1 ? '' : 's'}. ` +
          'Demo data can only be loaded into an empty workspace.',
      )
    }
  }

  private async requireActorMembership(workspaceId: string, userId: string) {
    const [member] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!member) {
      throw new NotFoundException('You are not a member of this workspace')
    }
    return member
  }

  // ----------------------------------------------------------- content

  /**
   * Workspace-scoped label palette used across the seeded tasks.
   * Hand-picked so a fresh workspace gets a sensible default set
   * users can build on.
   */
  private readonly LABEL_DEFS: Array<{ key: string; name: string; color: string }> = [
    { key: 'bug',         name: 'Bug',         color: '#ef4444' },
    { key: 'feature',     name: 'Feature',     color: '#3b82f6' },
    { key: 'enhancement', name: 'Enhancement', color: '#a855f7' },
    { key: 'design',      name: 'Design',      color: '#f59e0b' },
    { key: 'docs',        name: 'Docs',        color: '#10b981' },
    { key: 'tech-debt',   name: 'Tech debt',   color: '#64748b' },
    { key: 'urgent',      name: 'Urgent',      color: '#dc2626' },
    { key: 'good-first',  name: 'Good first',  color: '#14b8a6' },
  ]

  private async createLabels(
    workspaceId: string,
    summary: SeedSummary,
  ): Promise<Record<string, string>> {
    const rows = await this.db
      .insert(labels)
      .values(
        this.LABEL_DEFS.map((l) => ({
          workspaceId,
          name: l.name,
          color: l.color,
        })),
      )
      .returning({ id: labels.id, name: labels.name })
    summary.labels = rows.length
    const byKey: Record<string, string> = {}
    for (const def of this.LABEL_DEFS) {
      const match = rows.find((r) => r.name === def.name)
      if (match) byKey[def.key] = match.id
    }
    return byKey
  }

  /**
   * Drives the bulk of the seed. Picks 3 spaces × 2 projects ×
   * 4 lists, then layers tasks per (project, list) pair using a
   * recipe table so the demo feels curated rather than random.
   */
  private async createTree(
    workspaceId: string,
    actorId: string,
    labelIds: Record<string, string>,
    summary: SeedSummary,
  ): Promise<{ spaceIds: string[] }> {
    const spaceIds: string[] = []
    for (const spaceDef of SPACE_RECIPE) {
      const [space] = await this.db
        .insert(spaces)
        .values({
          workspaceId,
          name: spaceDef.name,
          description: spaceDef.description,
          color: spaceDef.color,
          icon: spaceDef.icon,
        })
        .returning()
      if (!space) continue
      summary.spaces += 1
      spaceIds.push(space.id)

      for (const projectDef of spaceDef.projects) {
        const [project] = await this.db
          .insert(projects)
          .values({
            spaceId: space.id,
            name: projectDef.name,
            description: projectDef.description,
            color: spaceDef.color,
          })
          .returning()
        if (!project) continue
        summary.projects += 1

        const createdLists: Array<{ id: string; key: string }> = []
        for (let i = 0; i < projectDef.lists.length; i++) {
          const listDef = projectDef.lists[i]
          const [list] = await this.db
            .insert(lists)
            .values({
              projectId: project.id,
              name: listDef.name,
              position: i,
            })
            .returning()
          if (!list) continue
          summary.lists += 1
          createdLists.push({ id: list.id, key: listDef.key })
          // Status seeding is handled by the existing ListsService /
          // migration 0020 logic — but inserts via the bare table
          // don't run that path. We replicate the minimal seed
          // inline so demo lists have the default pipeline.
          await this.seedDefaultStatuses(list.id)
        }

        for (const taskDef of projectDef.tasks) {
          const targetList = createdLists.find((l) => l.key === taskDef.listKey) ?? createdLists[0]
          if (!targetList) continue
          await this.createTask({
            workspaceId,
            listId: targetList.id,
            actorId,
            taskDef,
            labelIds,
            summary,
          })
        }
      }
    }
    return { spaceIds }
  }

  private async seedDefaultStatuses(listId: string) {
    // Mirrors lists.service.ts DEFAULT_LIST_STATUSES.
    const seeds = [
      { key: 'backlog',     name: 'Backlog',     color: '#94a3b8', category: 'open' as const,         position: 0 },
      { key: 'todo',        name: 'To do',       color: '#64748b', category: 'open' as const,         position: 1 },
      { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' as const,  position: 2 },
      { key: 'in_review',   name: 'In review',   color: '#a855f7', category: 'in_progress' as const,  position: 3 },
      { key: 'done',        name: 'Done',        color: '#10b981', category: 'closed' as const,       position: 4 },
      { key: 'cancelled',   name: 'Cancelled',   color: '#f43f5e', category: 'closed' as const,       position: 5 },
    ]
    // Use the schema's listStatuses table via the same query API the
    // service uses. Imported lazily to avoid a hard circular dep.
    const { listStatuses } = await import('@rundesk/db')
    await this.db
      .insert(listStatuses)
      .values(seeds.map((s) => ({ listId, ...s })))
      .onConflictDoNothing()
  }

  private async createTask(args: {
    workspaceId: string
    listId: string
    actorId: string
    taskDef: TaskRecipe
    labelIds: Record<string, string>
    summary: SeedSummary
  }) {
    const { listId, actorId, taskDef, labelIds, summary } = args
    const status = taskDef.status ?? 'todo'
    const statusCategory =
      status === 'done' || status === 'cancelled'
        ? 'closed'
        : status === 'in_progress' || status === 'in_review'
          ? 'in_progress'
          : 'open'

    const now = new Date()
    const dueDate = taskDef.dueInDays != null ? offsetDate(now, taskDef.dueInDays) : null

    const [task] = await this.db
      .insert(tasks)
      .values({
        listId,
        createdById: actorId,
        title: taskDef.title,
        description: taskDef.description ?? null,
        priority: taskDef.priority ?? 'normal',
        status,
        statusCategory,
        dueDate,
        timeEstimate: taskDef.timeEstimateSeconds ?? null,
        completedAt: statusCategory === 'closed' ? now : null,
      })
      .returning()
    if (!task) return
    summary.tasks += 1

    // Assignee = the seeding actor on tasks marked owned-by-actor so the
    // workload report has something to show.
    if (taskDef.assignToActor) {
      await this.db
        .insert(taskAssignees)
        .values({ taskId: task.id, userId: actorId })
        .onConflictDoNothing()
    }

    // Labels (resolved by key against the workspace palette).
    if (taskDef.labelKeys?.length) {
      const ids = taskDef.labelKeys
        .map((k) => labelIds[k])
        .filter((id): id is string => !!id)
      if (ids.length) {
        await this.db
          .insert(taskLabelAssignments)
          .values(ids.map((labelId) => ({ taskId: task.id, labelId })))
          .onConflictDoNothing()
      }
    }

    // One checklist per task that has items.
    if (taskDef.checklist?.length) {
      const [checklist] = await this.db
        .insert(taskChecklists)
        .values({ taskId: task.id, title: 'Acceptance criteria', position: 0 })
        .returning()
      if (checklist) {
        await this.db.insert(taskChecklistItems).values(
          taskDef.checklist.map((content, idx) => ({
            checklistId: checklist.id,
            content,
            position: idx,
          })),
        )
        summary.checklistItems += taskDef.checklist.length
      }
    }

    // Subtasks live in the same list; parent_task_id links them.
    if (taskDef.subtasks?.length) {
      for (const sub of taskDef.subtasks) {
        const [child] = await this.db
          .insert(tasks)
          .values({
            listId,
            parentTaskId: task.id,
            createdById: actorId,
            title: sub.title,
            priority: sub.priority ?? 'normal',
            status: sub.status ?? 'todo',
            statusCategory: sub.status === 'done' ? 'closed' : 'open',
            dueDate: sub.dueInDays != null ? offsetDate(now, sub.dueInDays) : null,
            completedAt: sub.status === 'done' ? now : null,
          })
          .returning()
        if (child) summary.subtasks += 1
      }
    }
  }

  private async createDocs(
    workspaceId: string,
    actorId: string,
    spaceIds: string[],
    summary: SeedSummary,
  ) {
    for (let i = 0; i < DOC_RECIPE.length; i++) {
      const def = DOC_RECIPE[i]
      const spaceId = def.spaceIndex != null ? spaceIds[def.spaceIndex] ?? null : null
      const [doc] = await this.db
        .insert(docs)
        .values({
          workspaceId,
          spaceId,
          createdById: actorId,
          title: def.title,
          icon: def.icon ?? null,
          content: tipTapDoc(def.body),
          plaintext: def.body.join('\n'),
          position: i,
        })
        .returning()
      if (doc) summary.docs += 1
    }
  }

  private async createGoals(
    workspaceId: string,
    actorId: string,
    spaceIds: string[],
    summary: SeedSummary,
  ) {
    const now = new Date()
    const goalDefs = [
      {
        title: 'Ship the redesigned onboarding flow',
        kind: 'percentage' as const,
        targetValue: 100,
        currentValue: 60,
        status: 'on_track' as const,
        dueInDays: 30,
        spaceIndex: 0,
      },
      {
        title: 'Hit 99.9% API availability for the quarter',
        kind: 'percentage' as const,
        targetValue: 99.9,
        currentValue: 99.78,
        status: 'at_risk' as const,
        dueInDays: 60,
        spaceIndex: 0,
      },
      {
        title: 'Launch 4 product marketing campaigns',
        kind: 'numeric' as const,
        targetValue: 4,
        currentValue: 2,
        status: 'on_track' as const,
        dueInDays: 90,
        spaceIndex: 2,
      },
    ]
    for (const g of goalDefs) {
      await this.db.insert(goals).values({
        workspaceId,
        spaceId: g.spaceIndex != null ? spaceIds[g.spaceIndex] ?? null : null,
        ownerId: actorId,
        title: g.title,
        kind: g.kind,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        status: g.status,
        dueDate: offsetDate(now, g.dueInDays),
        startDate: now,
      })
      summary.goals += 1
    }
  }
}

// -------------------------------------------------------------- helpers

function offsetDate(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function tipTapDoc(paragraphs: string[]): Record<string, unknown> {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  }
}

// ---------------------------------------------------------------- recipes

type TaskRecipe = {
  title: string
  description?: string
  priority?: Priority
  status?: string
  dueInDays?: number
  timeEstimateSeconds?: number
  listKey: string
  labelKeys?: string[]
  assignToActor?: boolean
  checklist?: string[]
  subtasks?: Array<{
    title: string
    status?: string
    priority?: Priority
    dueInDays?: number
  }>
}

type ProjectRecipe = {
  name: string
  description: string
  lists: Array<{ key: string; name: string }>
  tasks: TaskRecipe[]
}

type SpaceRecipe = {
  name: string
  description: string
  color: string
  icon: string
  projects: ProjectRecipe[]
}

const STANDARD_LISTS: Array<{ key: string; name: string }> = [
  { key: 'backlog',  name: 'Backlog' },
  { key: 'sprint',   name: 'Current sprint' },
  { key: 'review',   name: 'In review' },
  { key: 'shipped',  name: 'Shipped' },
]

const SPACE_RECIPE: SpaceRecipe[] = [
  {
    name: 'Engineering',
    description: 'Product engineering — APIs, web, infra.',
    color: '#3b82f6',
    icon: '⚙️',
    projects: [
      {
        name: 'Platform',
        description: 'Core API, auth, billing, deploys.',
        lists: STANDARD_LISTS,
        tasks: [
          {
            title: 'Migrate auth tokens to rotated JWT keys',
            description: 'Move signing keys behind a rotation schedule. Coordinate with mobile teams.',
            priority: 'high',
            status: 'in_progress',
            dueInDays: 5,
            listKey: 'sprint',
            labelKeys: ['feature', 'urgent'],
            assignToActor: true,
            checklist: [
              'Generate new RSA keypair',
              'Update jwks endpoint',
              'Coordinate rollout window with mobile',
              'Cycle stale tokens after grace period',
            ],
            subtasks: [
              { title: 'Write JWKS rotation script', status: 'done', priority: 'normal' },
              { title: 'Roll keys in staging', status: 'in_progress', priority: 'high' },
              { title: 'Plan production rollout', status: 'todo', priority: 'normal' },
            ],
          },
          {
            title: 'Postgres 16 upgrade',
            description: 'Test pgvector + json shape compatibility. Plan downtime window.',
            priority: 'high',
            status: 'todo',
            dueInDays: 14,
            listKey: 'sprint',
            labelKeys: ['enhancement', 'tech-debt'],
            checklist: [
              'Spin up Postgres 16 in staging',
              'Run integration suite',
              'Document rollback path',
            ],
          },
          {
            title: 'Investigate slow task list query (P95 > 800ms)',
            description: 'Probably missing index on (list_id, status, position). Profile first.',
            priority: 'urgent',
            status: 'in_review',
            dueInDays: 2,
            listKey: 'review',
            labelKeys: ['bug', 'urgent'],
            assignToActor: true,
          },
          {
            title: 'Audit log retention policy',
            priority: 'normal',
            status: 'backlog',
            listKey: 'backlog',
            labelKeys: ['feature', 'tech-debt'],
          },
          {
            title: 'Realtime broadcast for whiteboards',
            status: 'done',
            priority: 'normal',
            listKey: 'shipped',
            labelKeys: ['feature'],
          },
          {
            title: 'Refactor connection pool to use pgbouncer transaction mode',
            status: 'backlog',
            priority: 'low',
            listKey: 'backlog',
            labelKeys: ['tech-debt'],
          },
        ],
      },
      {
        name: 'Mobile',
        description: 'iOS + Android clients.',
        lists: STANDARD_LISTS,
        tasks: [
          {
            title: 'Implement biometric unlock',
            priority: 'high',
            status: 'in_progress',
            dueInDays: 10,
            listKey: 'sprint',
            labelKeys: ['feature'],
            checklist: ['Touch ID', 'Face ID', 'Android Biometric API'],
          },
          {
            title: 'Bug: drag-reorder loses position on app resume',
            priority: 'urgent',
            status: 'in_review',
            dueInDays: 3,
            listKey: 'review',
            labelKeys: ['bug', 'urgent'],
          },
          {
            title: 'Offline-first sync for tasks',
            priority: 'high',
            status: 'backlog',
            listKey: 'backlog',
            labelKeys: ['feature', 'enhancement'],
          },
          {
            title: 'Ship v3.2 to App Store',
            status: 'done',
            listKey: 'shipped',
            labelKeys: ['feature'],
          },
        ],
      },
    ],
  },
  {
    name: 'Design',
    description: 'Brand, product, design systems.',
    color: '#a855f7',
    icon: '🎨',
    projects: [
      {
        name: 'Design system v2',
        description: 'Tokens, components, docs.',
        lists: STANDARD_LISTS,
        tasks: [
          {
            title: 'Audit Button component variants',
            priority: 'normal',
            status: 'in_progress',
            dueInDays: 4,
            listKey: 'sprint',
            labelKeys: ['design', 'enhancement'],
            checklist: ['Document existing variants', 'Drop deprecated ones', 'Update Storybook'],
          },
          {
            title: 'Dark mode color tokens',
            priority: 'high',
            status: 'todo',
            dueInDays: 7,
            listKey: 'sprint',
            labelKeys: ['design'],
          },
          {
            title: 'Refresh empty-state illustrations',
            priority: 'low',
            status: 'backlog',
            listKey: 'backlog',
            labelKeys: ['design'],
          },
          {
            title: 'Ship v2 typography scale',
            status: 'done',
            listKey: 'shipped',
            labelKeys: ['design'],
          },
        ],
      },
    ],
  },
  {
    name: 'Marketing',
    description: 'Growth, content, lifecycle.',
    color: '#f59e0b',
    icon: '📣',
    projects: [
      {
        name: 'Q3 launch campaign',
        description: 'Full-funnel campaign for the major release.',
        lists: STANDARD_LISTS,
        tasks: [
          {
            title: 'Draft launch landing page copy',
            priority: 'high',
            status: 'in_progress',
            dueInDays: 6,
            listKey: 'sprint',
            labelKeys: ['feature', 'docs'],
            checklist: [
              'Hero headline + sub',
              'Three feature blocks',
              'Pricing section',
              'CTA copy variations',
            ],
          },
          {
            title: 'Brief design on hero illustration',
            priority: 'normal',
            status: 'todo',
            dueInDays: 3,
            listKey: 'sprint',
            labelKeys: ['design'],
          },
          {
            title: 'Schedule social rollout calendar',
            priority: 'normal',
            status: 'backlog',
            listKey: 'backlog',
          },
          {
            title: 'Press kit assets to media partners',
            status: 'done',
            listKey: 'shipped',
            labelKeys: ['docs'],
          },
        ],
      },
      {
        name: 'Lifecycle',
        description: 'Onboarding, retention, win-back.',
        lists: STANDARD_LISTS,
        tasks: [
          {
            title: 'Refresh activation email series',
            priority: 'normal',
            status: 'todo',
            dueInDays: 10,
            listKey: 'sprint',
            labelKeys: ['enhancement'],
          },
          {
            title: 'A/B test trial-end nudge',
            priority: 'high',
            status: 'in_review',
            dueInDays: 5,
            listKey: 'review',
            labelKeys: ['enhancement'],
            assignToActor: true,
          },
          {
            title: 'Shipped: weekly digest email',
            status: 'done',
            listKey: 'shipped',
          },
        ],
      },
    ],
  },
]

const DOC_RECIPE: Array<{
  title: string
  icon?: string
  spaceIndex?: number | null
  body: string[]
}> = [
  {
    title: 'Welcome to your demo workspace 👋',
    icon: '✨',
    spaceIndex: null,
    body: [
      'This workspace was preloaded with example spaces, projects, tasks, docs, and goals so you can explore the product without starting from scratch.',
      'Open the Engineering or Marketing space in the left sidebar to see real lists with sprints, subtasks, checklists, and labels.',
      'Hit ⌘K anywhere to jump between things, or open Settings → Roles to see custom permissions in action.',
    ],
  },
  {
    title: 'Engineering on-call runbook',
    icon: '📟',
    spaceIndex: 0,
    body: [
      'When paged: ack within 5 minutes, post a status update in #incidents, then start investigating.',
      'Common dashboards: API latency, error budget, deploy timeline.',
      'If the issue is customer-impacting, escalate to the duty manager and start a postmortem doc.',
    ],
  },
  {
    title: 'Design system principles',
    icon: '🎯',
    spaceIndex: 1,
    body: [
      'Consistency over cleverness: prefer existing tokens before introducing new ones.',
      'Components should be composable and accessible by default.',
      'Every new pattern needs a Storybook entry and a contribution doc.',
    ],
  },
  {
    title: 'Q3 campaign brief',
    icon: '🚀',
    spaceIndex: 2,
    body: [
      'Goal: 10k qualified signups across the launch window.',
      'Audience: existing trial users + warm leads from the Q2 webinar.',
      'Channels: landing page refresh, two-week email series, four social pushes, one paid burst.',
    ],
  },
]
