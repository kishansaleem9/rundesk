import { Injectable, Inject, NotFoundException, BadRequestException, Logger, type OnModuleInit } from '@nestjs/common'
import { and, eq, desc, isNull, or, asc, ilike, inArray, sql } from 'drizzle-orm'
import {
  projectTemplates,
  projects,
  lists,
  tasks,
  spaces,
  TEMPLATE_TARGET_TYPES,
  TEMPLATE_COMPLEXITIES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_USE_CASES,
  type TemplateTargetType,
  type TemplateComplexity,
  type TemplateCategory,
  type TemplateUseCase,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SpacesService } from '../spaces/spaces.service'

type TemplatePayload = NonNullable<typeof projectTemplates.$inferSelect.payload>
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'

/** One row of a facet rail: the value, and how many templates carry it. */
export type FacetBucket<T extends string = string> = { value: T; count: number }

export type TemplateFacets = {
  scope: FacetBucket<'all' | 'builtin' | 'custom'>[]
  type: FacetBucket<TemplateTargetType>[]
  complexity: FacetBucket<TemplateComplexity>[]
  category: FacetBucket<TemplateCategory | 'other'>[]
  useCase: FacetBucket<TemplateUseCase | 'other'>[]
}

/** `other` is a real bucket: `category`/`use_case` are nullable on purpose. */
const CATEGORY_BUCKETS = [...TEMPLATE_CATEGORIES, 'other'] as const
const USE_CASE_BUCKETS = [...TEMPLATE_USE_CASES, 'other'] as const

const isTargetType = (v: unknown): v is TemplateTargetType =>
  typeof v === 'string' && (TEMPLATE_TARGET_TYPES as readonly string[]).includes(v)
const isComplexity = (v: unknown): v is TemplateComplexity =>
  typeof v === 'string' && (TEMPLATE_COMPLEXITIES as readonly string[]).includes(v)
const isCategory = (v: unknown): v is TemplateCategory =>
  typeof v === 'string' && (TEMPLATE_CATEGORIES as readonly string[]).includes(v)
const isUseCase = (v: unknown): v is TemplateUseCase =>
  typeof v === 'string' && (TEMPLATE_USE_CASES as readonly string[]).includes(v)

/**
 * How hard a template is to pick up, read off the thing itself rather than
 * asked of whoever saved it. A person saving a project as a template has no
 * idea whether their 40 tasks count as "advanced", and a dropdown they guess
 * at is a column nobody can trust to filter on.
 */
export function complexityOf(payload: TemplatePayload): TemplateComplexity {
  const listCount = payload?.lists?.length ?? 0
  const taskCount = payload?.lists?.reduce((n, l) => n + (l.tasks?.length ?? 0), 0) ?? 0
  if (listCount > 5 || taskCount > 20) return 'advanced'
  if (listCount > 2 || taskCount > 5) return 'intermediate'
  return 'beginner'
}

type BuiltInTemplate = {
  name: string
  description: string
  icon: string
  targetType: TemplateTargetType
  complexity: TemplateComplexity
  category: TemplateCategory
  useCase: TemplateUseCase
  payload: TemplatePayload
}

// Platform-wide built-in templates (workspaceId = null). Seeded idempotently on
// boot so the starter catalog is genuinely applyable, not decorative. `icon` is
// a lucide icon name the web app maps to a component + cover gradient.
//
// The catalog covers EVERY facet value the rail offers — all three target
// types, all three complexities, all four categories and all four use cases.
// That is not tidiness: a facet value with nothing behind it is a checkbox
// that can only ever empty the grid, which is the defect the frame's greyed-out
// "Workspace Templates  0" row avoids by SAYING it is zero.
const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    name: 'Software sprint',
    description: 'Backlog → in progress → review → done, tuned for engineering teams.',
    icon: 'Code2',
    targetType: 'folder',
    complexity: 'intermediate',
    category: 'engineering',
    useCase: 'planning',
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
    targetType: 'folder',
    complexity: 'beginner',
    category: 'operations',
    useCase: 'onboarding',
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
    targetType: 'folder',
    complexity: 'beginner',
    category: 'marketing',
    useCase: 'launch',
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
    targetType: 'folder',
    complexity: 'advanced',
    category: 'product',
    useCase: 'launch',
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
    targetType: 'folder',
    complexity: 'intermediate',
    category: 'operations',
    useCase: 'planning',
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
    targetType: 'folder',
    complexity: 'beginner',
    category: 'engineering',
    useCase: 'support',
    payload: {
      lists: [
        { name: 'Reported', position: 0, tasks: [{ title: 'Triage incoming bug', priority: 'high', status: 'todo' }] },
        { name: 'Confirmed', position: 1, tasks: [] },
        { name: 'In progress', position: 2, tasks: [] },
        { name: 'Fixed / verified', position: 3, tasks: [] },
      ],
    },
  },
  /*
   * SPACE templates — applying one makes a whole space, through the spaces
   * service rather than a second insert of my own, so a space born from a
   * template gets the same creator membership and defaults a hand-made one
   * does.
   */
  {
    name: 'Agency client space',
    description: 'A space per client: delivery, retainer work and the account log, ready on day one.',
    icon: 'Briefcase',
    targetType: 'space',
    complexity: 'advanced',
    category: 'operations',
    useCase: 'onboarding',
    payload: {
      lists: [
        { name: 'Account', position: 0, tasks: [
          { title: 'Confirm scope & retainer hours', priority: 'high', status: 'todo' },
          { title: 'Add client contacts', priority: 'normal', status: 'todo' },
        ] },
        { name: 'Delivery', position: 1, tasks: [
          { title: 'Kickoff workshop', priority: 'high', status: 'todo' },
          { title: 'Agree the first milestone', priority: 'normal', status: 'todo' },
        ] },
        { name: 'Retainer', position: 2, tasks: [{ title: 'Log this month’s hours', status: 'todo' }] },
        { name: 'Billing', position: 3, tasks: [{ title: 'Raise the first invoice', priority: 'normal', status: 'todo' }] },
        { name: 'Archive', position: 4, tasks: [] },
        { name: 'Notes', position: 5, tasks: [] },
      ],
    },
  },
  {
    name: 'Product team space',
    description: 'Discovery, delivery and a release log — the three lanes a product squad lives in.',
    icon: 'Sparkles',
    targetType: 'space',
    complexity: 'intermediate',
    category: 'product',
    useCase: 'planning',
    payload: {
      lists: [
        { name: 'Discovery', position: 0, tasks: [
          { title: 'Write the problem statement', priority: 'high', status: 'todo' },
          { title: 'Book five customer calls', priority: 'normal', status: 'todo' },
        ] },
        { name: 'Delivery', position: 1, tasks: [{ title: 'Break the first bet into tasks', status: 'todo' }] },
        { name: 'Releases', position: 2, tasks: [] },
      ],
    },
  },
  /*
   * LIST templates — a single list, applied INTO a project you already have.
   * The payload carries exactly one list, which is what makes the type
   * meaningful rather than a label: `apply` refuses a 'list' template that
   * carries more.
   */
  {
    name: 'Content calendar',
    description: 'One list, a month of slots: brief, draft, review, scheduled.',
    icon: 'Calendar',
    targetType: 'list',
    complexity: 'beginner',
    category: 'marketing',
    useCase: 'planning',
    payload: {
      lists: [
        { name: 'Content calendar', position: 0, tasks: [
          { title: 'Plan next month’s themes', priority: 'high', status: 'todo' },
          { title: 'Draft the weekly newsletter', priority: 'normal', status: 'todo' },
          { title: 'Schedule social posts', status: 'todo' },
        ] },
      ],
    },
  },
  {
    name: 'Support queue',
    description: 'An inbound queue with triage, reply and follow-up stubs.',
    icon: 'ListChecks',
    targetType: 'list',
    complexity: 'intermediate',
    category: 'operations',
    useCase: 'support',
    payload: {
      lists: [
        { name: 'Support queue', position: 0, tasks: [
          { title: 'Triage the inbox', priority: 'urgent', status: 'todo' },
          { title: 'Reply to open tickets', priority: 'high', status: 'todo' },
          { title: 'Escalate anything older than 48h', priority: 'high', status: 'todo' },
          { title: 'Write up the week’s themes', status: 'todo' },
          { title: 'Update the help centre', status: 'todo' },
          { title: 'Close what has gone quiet', priority: 'low', status: 'todo' },
        ] },
      ],
    },
  },
  {
    name: 'Engineering onboarding',
    description: 'Week one for a new engineer: access, environment, first pull request.',
    icon: 'GraduationCap',
    targetType: 'list',
    complexity: 'beginner',
    category: 'engineering',
    useCase: 'onboarding',
    payload: {
      lists: [
        { name: 'Engineering onboarding', position: 0, tasks: [
          { title: 'Grant repository & CI access', priority: 'high', status: 'todo' },
          { title: 'Get the app running locally', priority: 'high', status: 'todo' },
          { title: 'Ship a first small pull request', priority: 'normal', status: 'todo' },
        ] },
      ],
    },
  },
]

@Injectable()
export class ProjectTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(ProjectTemplatesService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly spacesService: SpacesService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureBuiltIns()
    } catch (err) {
      // Seeding the built-in catalog must never block API boot.
      this.logger.warn(`Could not seed built-in templates: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Insert any missing platform-wide built-in templates (idempotent by name)
   * AND reconcile the facet metadata of the ones already there.
   *
   * The reconcile half exists because migration 0151 added four columns with
   * defaults, and a built-in seeded before it would sit at
   * folder / beginner / no category forever. That is the mirror of a facade: a
   * row in Postgres that says "beginner" because nobody wrote anything else,
   * filtered on as though somebody had.
   */
  async ensureBuiltIns() {
    const existing = await this.db
      .select({
        name: projectTemplates.name,
        targetType: projectTemplates.targetType,
        complexity: projectTemplates.complexity,
        category: projectTemplates.category,
        useCase: projectTemplates.useCase,
      })
      .from(projectTemplates)
      .where(and(isNull(projectTemplates.workspaceId), eq(projectTemplates.isBuiltIn, true)))
    const have = new Map(existing.map((r) => [r.name, r]))
    const missing = BUILT_IN_TEMPLATES.filter((t) => !have.has(t.name))

    if (missing.length > 0) {
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
            targetType: t.targetType,
            complexity: t.complexity,
            category: t.category,
            useCase: t.useCase,
          })),
        )
        .onConflictDoNothing()
      this.logger.log(`Seeded ${missing.length} built-in project template(s)`)
    }

    let reconciled = 0
    for (const t of BUILT_IN_TEMPLATES) {
      const row = have.get(t.name)
      if (!row) continue
      if (
        row.targetType === t.targetType &&
        row.complexity === t.complexity &&
        row.category === t.category &&
        row.useCase === t.useCase
      ) continue
      await this.db
        .update(projectTemplates)
        .set({ targetType: t.targetType, complexity: t.complexity, category: t.category, useCase: t.useCase })
        .where(and(isNull(projectTemplates.workspaceId), eq(projectTemplates.name, t.name)))
      reconciled++
    }
    if (reconciled > 0) this.logger.log(`Reconciled facets on ${reconciled} built-in project template(s)`)

    return { inserted: missing.length, reconciled }
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

  /**
   * §V2-13 / frame `12:14` — the Template Center's faceted browse.
   *
   * The whole point of this living on the server: `templates` is the narrowed
   * page, `facets` is counted over the corpus. A browser cannot compute the
   * second from the first — it would be counting the array it was handed,
   * which is right about the page and silent about everything the page did not
   * load. That is the "confident zero" shape exactly.
   *
   * WHAT THE COUNTS MEAN, stated because a facet count that means something
   * different from what the reader assumes is worse than none: each bucket is
   * counted over the corpus narrowed by the SEARCH and the SCOPE only, never by
   * the facet selections. So the number beside "Beginner" answers "how many
   * would I get if Beginner were the only thing I picked" — it does not move
   * when you tick Advanced, and a ticked box never hides its own siblings'
   * counts.
   */
  async browse(
    workspaceId: string,
    params: {
      q?: string
      scope?: string
      type?: string | string[]
      complexity?: string | string[]
      category?: string
      useCase?: string
    } = {},
  ): Promise<{ templates: Array<typeof projectTemplates.$inferSelect>; total: number; facets: TemplateFacets }> {
    const csv = (v: string | string[] | undefined): string[] =>
      (Array.isArray(v) ? v : (v ?? '').split(',')).map((s) => s.trim()).filter(Boolean)

    const q = (params.q ?? '').trim()
    const scope: 'all' | 'builtin' | 'custom' =
      params.scope === 'builtin' || params.scope === 'custom' ? params.scope : 'all'
    const types = csv(params.type).filter(isTargetType)
    const complexities = csv(params.complexity).filter(isComplexity)
    // 'other' is the null bucket, and it has to survive the validity filter.
    const rawCategory = (params.category ?? '').trim()
    const category = isCategory(rawCategory) || rawCategory === 'other' ? rawCategory : null
    const rawUseCase = (params.useCase ?? '').trim()
    const useCase = isUseCase(rawUseCase) || rawUseCase === 'other' ? rawUseCase : null

    // Visible corpus: platform built-ins + this workspace's own, nothing else.
    const visible = or(
      isNull(projectTemplates.workspaceId),
      eq(projectTemplates.workspaceId, workspaceId),
    )!
    const like = q ? `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%` : null
    const qCond = like ? or(ilike(projectTemplates.name, like), ilike(projectTemplates.description, like))! : null
    const scopeCond =
      scope === 'builtin' ? eq(projectTemplates.isBuiltIn, true)
      : scope === 'custom' ? eq(projectTemplates.isBuiltIn, false)
      : null

    /*
     * Two bases, deliberately different. `scopeBasis` drops the scope so the
     * rail can say "Built-in 11 · Workspace 2" while you are standing inside
     * Built-in — count the built-ins among the built-ins and the rail reports
     * the same number three times, which reads exactly like working software.
     */
    const scopeBasis = and(visible, ...(qCond ? [qCond] : []))!
    // The basis the facet counts are taken over — search + scope, no facets.
    const countBasis = and(scopeBasis, ...(scopeCond ? [scopeCond] : []))!

    const selected = [countBasis]
    if (types.length) selected.push(inArray(projectTemplates.targetType, types))
    if (complexities.length) selected.push(inArray(projectTemplates.complexity, complexities))
    if (category) {
      selected.push(
        category === 'other' ? isNull(projectTemplates.category) : eq(projectTemplates.category, category),
      )
    }
    if (useCase) {
      selected.push(
        useCase === 'other' ? isNull(projectTemplates.useCase) : eq(projectTemplates.useCase, useCase),
      )
    }

    const templates = await this.db
      .select()
      .from(projectTemplates)
      .where(and(...selected))
      .orderBy(desc(projectTemplates.isBuiltIn), asc(projectTemplates.name))

    /*
     * Four GROUP BYs over the same basis, plus the scope pair. Grouped in SQL
     * rather than counted in JS over `templates`, which is the narrowed set —
     * counting that would make every facet agree with the grid and disagree
     * with the database.
     */
    const [typeRows, complexityRows, categoryRows, useCaseRows, builtInRows] = await Promise.all([
      this.db
        .select({ value: projectTemplates.targetType, count: sql<number>`count(*)::int` })
        .from(projectTemplates).where(countBasis).groupBy(projectTemplates.targetType),
      this.db
        .select({ value: projectTemplates.complexity, count: sql<number>`count(*)::int` })
        .from(projectTemplates).where(countBasis).groupBy(projectTemplates.complexity),
      this.db
        .select({ value: projectTemplates.category, count: sql<number>`count(*)::int` })
        .from(projectTemplates).where(countBasis).groupBy(projectTemplates.category),
      this.db
        .select({ value: projectTemplates.useCase, count: sql<number>`count(*)::int` })
        .from(projectTemplates).where(countBasis).groupBy(projectTemplates.useCase),
      this.db
        .select({ value: projectTemplates.isBuiltIn, count: sql<number>`count(*)::int` })
        .from(projectTemplates).where(scopeBasis).groupBy(projectTemplates.isBuiltIn),
    ])

    const tally = (rows: Array<{ value: string | null; count: number }>, nullKey = '∅') => {
      const m = new Map<string, number>()
      for (const r of rows) m.set(r.value ?? nullKey, Number(r.count) || 0)
      return m
    }
    const typeCounts = tally(typeRows)
    const complexityCounts = tally(complexityRows)
    const categoryCounts = tally(categoryRows, 'other')
    const useCaseCounts = tally(useCaseRows, 'other')
    const builtInCount = Number(builtInRows.find((r) => r.value === true)?.count ?? 0)
    const customCount = Number(builtInRows.find((r) => r.value === false)?.count ?? 0)

    return {
      templates,
      total: templates.length,
      facets: {
        scope: [
          { value: 'all', count: builtInCount + customCount },
          { value: 'builtin', count: builtInCount },
          { value: 'custom', count: customCount },
        ],
        type: TEMPLATE_TARGET_TYPES.map((v) => ({ value: v, count: typeCounts.get(v) ?? 0 })),
        complexity: TEMPLATE_COMPLEXITIES.map((v) => ({ value: v, count: complexityCounts.get(v) ?? 0 })),
        category: CATEGORY_BUCKETS.map((v) => ({ value: v, count: categoryCounts.get(v) ?? 0 })),
        useCase: USE_CASE_BUCKETS.map((v) => ({ value: v, count: useCaseCounts.get(v) ?? 0 })),
      },
    }
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
    dto: {
      projectId: string
      name: string
      description?: string
      icon?: string
      category?: string
      useCase?: string
      targetType?: string
    },
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

    /*
     * A snapshot of one project is a FOLDER template unless the caller says
     * otherwise, and it may only say 'list' when the snapshot is one list —
     * otherwise the type on the card would describe something `apply` cannot
     * do with it. 'space' is not offered here for the same reason: this
     * snapshot is one project, not a space's worth of them.
     */
    const asked = dto.targetType
    const targetType: TemplateTargetType =
      asked === 'list' && payload.lists.length === 1 ? 'list' : 'folder'

    const [row] = await this.db
      .insert(projectTemplates)
      .values({
        workspaceId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        payload,
        createdById: userId,
        targetType,
        // Read off the snapshot rather than asked of the person saving it.
        complexity: complexityOf(payload),
        category: isCategory(dto.category) ? dto.category : null,
        useCase: isUseCase(dto.useCase) ? dto.useCase : null,
      })
      .returning()
    return row
  }

  /** Manually create a template from an inline payload (for built-ins or quick create). */
  async create(
    workspaceId: string,
    userId: string,
    dto: {
      name: string
      description?: string
      icon?: string
      payload: TemplatePayload
      targetType?: string
      complexity?: string
      category?: string
      useCase?: string
    },
  ) {
    if (!dto.payload?.lists) throw new BadRequestException('Template payload must contain lists')
    const targetType: TemplateTargetType = isTargetType(dto.targetType) ? dto.targetType : 'folder'
    if (targetType === 'list' && dto.payload.lists.length !== 1) {
      throw new BadRequestException('A list template must carry exactly one list')
    }
    const [row] = await this.db
      .insert(projectTemplates)
      .values({
        workspaceId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        payload: dto.payload,
        createdById: userId,
        targetType,
        // An explicit complexity is honoured; otherwise it is read off the payload.
        complexity: isComplexity(dto.complexity) ? dto.complexity : complexityOf(dto.payload),
        category: isCategory(dto.category) ? dto.category : null,
        useCase: isUseCase(dto.useCase) ? dto.useCase : null,
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
   * Materialize a template. WHAT gets made is the template's own
   * `targetType` — which is what stops the frame's Template Types facet being
   * a label on a card:
   *
   *   · `space`  — a new space in this workspace (through the spaces service,
   *                so it gets the same creator membership a hand-made one
   *                does), holding one project with the template's lists.
   *   · `folder` — a new project under `targetSpaceId`. The original
   *                behaviour, and still the default.
   *   · `list`   — the template's single list, dropped into a project you
   *                already have (`targetProjectId`).
   *
   * The return shape is unchanged for every existing caller: `project`,
   * `listsCreated`, `tasksCreated`. `space` is added, and is null unless one
   * was made.
   */
  async apply(
    workspaceId: string,
    userId: string,
    dto: {
      templateId: string
      targetSpaceId?: string
      targetProjectId?: string
      projectName?: string
    },
  ) {
    const tpl = await this.getOne(workspaceId, dto.templateId)
    const targetType: TemplateTargetType = isTargetType(tpl.targetType) ? tpl.targetType : 'folder'
    const name = dto.projectName?.trim() || tpl.name

    let createdSpace: typeof spaces.$inferSelect | null = null
    let project: typeof projects.$inferSelect | null = null

    if (targetType === 'list') {
      /*
       * A list template applies INTO something that already exists, so the
       * project is looked up rather than made. Checked through its space so a
       * project id from another workspace cannot be smuggled in.
       */
      if (!dto.targetProjectId) {
        throw new BadRequestException('A list template needs a target project')
      }
      const [found] = await this.db
        .select()
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(projects.id, dto.targetProjectId), eq(spaces.workspaceId, workspaceId)))
        .limit(1)
      if (!found) throw new NotFoundException('Target project not found in this workspace')
      project = found.projects
    } else {
      let spaceId: string
      if (targetType === 'space') {
        createdSpace = (await this.spacesService.createSpace(
          workspaceId,
          { name, description: tpl.description ?? undefined, icon: tpl.icon ?? undefined },
          userId,
        )) as typeof spaces.$inferSelect
        if (!createdSpace?.id) throw new BadRequestException('Could not create the space for this template')
        spaceId = createdSpace.id
      } else {
        if (!dto.targetSpaceId) throw new BadRequestException('A folder template needs a target space')
        const [space] = await this.db
          .select({ id: spaces.id })
          .from(spaces)
          .where(and(eq(spaces.id, dto.targetSpaceId), eq(spaces.workspaceId, workspaceId)))
          .limit(1)
        if (!space) throw new NotFoundException('Target space not found in this workspace')
        spaceId = space.id
      }

      const [made] = await this.db
        .insert(projects)
        .values({
          spaceId,
          name,
          description: tpl.description ?? `Created from template "${tpl.name}"`,
          icon: tpl.icon,
        })
        .returning()
      project = made
    }

    let tasksCreated = 0
    let listsCreated = 0
    // A list template applied into an existing project must not land on top of
    // that project's own list positions.
    const [{ maxPos } = { maxPos: null }] = targetType === 'list'
      ? await this.db
          .select({ maxPos: sql<number | null>`max(${lists.position})` })
          .from(lists)
          .where(eq(lists.projectId, project!.id))
      : [{ maxPos: null as number | null }]
    const base = (maxPos ?? -1) + 1

    for (const list of tpl.payload.lists) {
      const [createdList] = await this.db
        .insert(lists)
        .values({
          projectId: project!.id,
          name: targetType === 'list' ? (dto.projectName?.trim() || list.name) : list.name,
          position: targetType === 'list' ? base + listsCreated : (list.position ?? listsCreated),
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

    return { project: project!, space: createdSpace, targetType, listsCreated, tasksCreated }
  }
}
