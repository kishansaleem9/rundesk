import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException, Logger, type OnModuleInit } from '@nestjs/common'
import { and, eq, desc, isNull, or, asc, ilike, inArray, sql } from 'drizzle-orm'
import {
  projectTemplates,
  projects,
  lists,
  tasks,
  spaces,
  users,
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
import { seedListStatuses } from '../lists/list-statuses.defaults'
import { assertCanPlaceIn } from '../../common/permissions/container-access'
import { CustomRolesService } from '../custom-roles/custom-roles.service'
import { readableProject } from '../../common/permissions/read-access'
import { listVisibilityFilter, resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'
import { isUuid } from '../../common/validation/uuid'
import { likeContaining } from '../../common/sql/like'

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
  /**
   * `ledger-rows/row-1874` — the frame's top-row **Created by**: one bucket per
   * person who made a template in the corpus, with their name, in name order.
   * The value is their user id, which is what `createdBy=` takes back. The
   * built-ins have no maker and are in no bucket.
   */
  createdBy: Array<FacetBucket & { name: string }>
  /**
   * And **Tags**: one bucket per word whatever its case, alphabetical. The
   * value is the word as tags are stored, in lower case (`normalizeTemplateTags`);
   * `spellTagFacet` still picks one should a row hold another spelling, and
   * `tag=` matches any.
   */
  tag: FacetBucket[]
}

/**
 * `ledger-rows/row-1874` — a template's tags, cleaned once, where they are
 * written: saved with the template (`saveFromProject`, `create`) or changed
 * afterwards (`setTags`).
 *
 * Trimmed, a run of spaces made one, blanks dropped, and one per word whatever
 * its case — the first spelling kept — so "Q3" and "q3 " are one chip on the
 * card and one bucket in the facet, which groups them in SQL by `lower()`.
 *
 * REFUSED PAST ITS BOUNDS, NOT CUT TO FIT, which is where this parts from
 * `normalizeMeetingTags`: that one slices a long tag and keeps the first
 * twenty. A template is shown to the whole workspace and filtered on by
 * everybody in it. A tag cut short is a different tag from the one typed, and
 * filtering on what was typed finds nothing; a twenty-first dropped without a
 * word is a tag its saver believes the template carries. So the write is
 * refused, in words that say which bound and by how much, and nothing is
 * written. The bounds are meetings' own; ClickUp's help centre gives a task
 * forty tags and says nothing of a template's.
 */
export const TEMPLATE_TAG_MAX_LENGTH = 40
export const TEMPLATE_TAGS_MAX = 20
export function normalizeTemplateTags(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new BadRequestException('Tags must be a list of words')
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') throw new BadRequestException('Every tag must be text')
    const tag = raw.trim().replace(/\s+/g, ' ')
    if (!tag) continue
    // Characters as a person counts them, not UTF-16 units: an emoji is one.
    const chars = Array.from(tag)
    if (chars.length > TEMPLATE_TAG_MAX_LENGTH) {
      throw new BadRequestException(
        `A tag can be at most ${TEMPLATE_TAG_MAX_LENGTH} characters, and "${chars.slice(0, 24).join('')}…" has ${chars.length}`,
      )
    }
    /*
     * IN LOWER CASE, AS CLICKUP KEEPS A TAG (`found-30-sep/template-tags-keep-their-case`):
     * its tags are lower case whatever case they are typed in (people ask its
     * feedback board for capitals). Each template kept its own spelling, so the
     * Tags facet had to choose one for a word the cards spelled two ways; a
     * word is one tag now, in one spelling, on every card and in the facet.
     */
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  if (out.length > TEMPLATE_TAGS_MAX) {
    throw new BadRequestException(`A template can carry at most ${TEMPLATE_TAGS_MAX} tags, and these are ${out.length}`)
  }
  return out
}

/** `db.execute`'s rows, whichever shape the driver hands them back in. */
function rowsOf<T>(found: unknown): T[] {
  return (Array.isArray(found) ? found : ((found as { rows?: unknown[] })?.rows ?? [])) as T[]
}

/**
 * One spelling of one tag word over the facet's corpus: how many templates
 * carry it as spelled, when one of them last wrote it, and how many templates
 * carry the word in any spelling.
 */
export type TagSpelling = {
  word: string
  spelling: string
  uses: number
  newest: Date | string | null
  count: number
}

/**
 * `found-30-sep/template-tags-spelled-by-collation` — WHICH SPELLING THE TAGS
 * FACET SHOWS for a word saved in more than one ("Q3" and "q3").
 *
 * It was `min(t)`, the spelling the database's collation sorts first: "Q3"
 * under C.UTF-8, which the lanes run, and "q3" under en_US, which CI's
 * Postgres runs. The filter matches any case, so only the label moved, but it
 * moved with the server's locale. Now a rule, and no collation in it:
 *
 *   1. the spelling the MOST templates carry — what the workspace mostly calls it;
 *   2. then the one written MOST RECENTLY — a template's tags are written when
 *      it is saved and when they are changed, which is when `updated_at` moves;
 *   3. then the first by character code, so that no two servers disagree.
 *
 * Each word's count is its own (templates carrying it in any spelling), never
 * the sum of its spellings' uses: a row written around the normaliser with both
 * spellings is one template. The words keep the order they come in.
 */
export function spellTagFacet(rows: TagSpelling[]): FacetBucket[] {
  const time = (v: Date | string | null) => (v instanceof Date ? v.getTime() : v ? Date.parse(v) || 0 : 0)
  const beats = (a: TagSpelling, b: TagSpelling) =>
    a.uses !== b.uses ? a.uses > b.uses
    : time(a.newest) !== time(b.newest) ? time(a.newest) > time(b.newest)
    : a.spelling < b.spelling
  const chosen = new Map<string, TagSpelling>()
  for (const r of rows) {
    const held = chosen.get(r.word)
    if (!held || beats(r, held)) chosen.set(r.word, r)
  }
  return [...chosen.values()].map((r) => ({ value: String(r.spelling), count: Number(r.count) || 0 }))
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
    private readonly roles: CustomRolesService,
  ) {}

  /**
   * The permission the thing a template MAKES needs — asked here because it
   * depends on the template's own type, which the route cannot know before
   * the template is loaded. The same check and the same words as
   * PermissionsGuard, which guards the direct routes.
   *
   * WHY. `POST /projects` requires `project.create`, which members do not
   * hold, and applying a folder template creates a project with no check at
   * all: the templates page was a way round the permission for anybody in the
   * workspace. A space template creates a space, so it needs `space.create`.
   */
  private async assertMayMake(workspaceId: string, userId: string, globalRole: string | undefined, key: 'project.create' | 'space.create') {
    if (globalRole === 'super_admin') return
    const resolution = await this.roles.resolveForUser(workspaceId, userId)
    if (!resolution?.permissions.includes(key)) throw new ForbiddenException(`Missing required permission: ${key}`)
  }

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
      createdBy?: string
      tag?: string
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
    // `ledger-rows/row-1874` — the frame's other two top-row facets. A tag is
    // matched the way it is stored and counted: spaces made one, any case.
    const createdBy = (params.createdBy ?? '').trim()
    const tag = (params.tag ?? '').trim().replace(/\s+/g, ' ')

    // Visible corpus: platform built-ins + this workspace's own, nothing else.
    const visible = or(
      isNull(projectTemplates.workspaceId),
      eq(projectTemplates.workspaceId, workspaceId),
    )!
    // Literal, the backslash included: left unescaped, a query ending in `\`
    // escaped the closing `%` and found nothing.
    const like = q ? likeContaining(q) : null
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
    if (createdBy) {
      // A malformed id is nobody, and nobody made anything: the grid comes back
      // empty rather than the filter being dropped in silence — and Postgres is
      // never handed a uuid it would refuse with a 500.
      selected.push(isUuid(createdBy) ? eq(projectTemplates.createdById, createdBy) : sql`false`)
    }
    if (tag) {
      selected.push(sql`exists (select 1 from unnest(${projectTemplates.tags}) as t where lower(t) = lower(${tag}))`)
    }

    const templates = await this.db
      .select()
      .from(projectTemplates)
      .where(and(...selected))
      .orderBy(desc(projectTemplates.isBuiltIn), asc(projectTemplates.name))

    /*
     * Six GROUP BYs over the same basis, plus the scope pair. Grouped in SQL
     * rather than counted in JS over `templates`, which is the narrowed set —
     * counting that would make every facet agree with the grid and disagree
     * with the database.
     *
     * The last two are `ledger-rows/row-1874`'s. CREATED BY joins `users` for
     * the name, and the inner join is what leaves the built-ins out: nobody in
     * a workspace made them, so they belong to no bucket rather than to an
     * "unknown" one. TAGS unnests the array and groups by `lower()`, one bucket
     * per word whatever its case, and counts TEMPLATES (distinct ids), so a row
     * written around the normaliser with a word twice is still counted once.
     * Each spelling comes back with its own uses and newest write, and
     * `spellTagFacet` chooses the one shown by rule rather than by collation
     * (`found-30-sep/template-tags-spelled-by-collation`).
     */
    const [typeRows, complexityRows, categoryRows, useCaseRows, builtInRows, creatorRows, tagFound] = await Promise.all([
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
      this.db
        .select({ value: projectTemplates.createdById, name: users.displayName, count: sql<number>`count(*)::int` })
        .from(projectTemplates)
        .innerJoin(users, eq(users.id, projectTemplates.createdById))
        .where(countBasis)
        .groupBy(projectTemplates.createdById, users.displayName)
        .orderBy(sql`lower(${users.displayName})`, projectTemplates.createdById),
      this.db.execute(sql`
        with tagged as (
          select ${projectTemplates.id} as id, ${projectTemplates.updatedAt} as written, t as spelling, lower(t) as word
          from ${projectTemplates}, unnest(${projectTemplates.tags}) as t
          where ${countBasis}
        )
        select s.word, s.spelling, s.uses, s.newest, w.count
        from (
          select word, spelling, count(distinct id)::int as uses, max(written) as newest
          from tagged group by word, spelling
        ) s
        join (select word, count(distinct id)::int as count from tagged group by word) w on w.word = s.word
        order by s.word`),
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
        createdBy: creatorRows.map((r) => ({ value: String(r.value), name: r.name, count: Number(r.count) || 0 })),
        tag: spellTagFacet(rowsOf<TagSpelling>(tagFound)),
      },
    }
  }

  async getOne(workspaceId: string, id: string) {
    // A malformed id is a template that is not there. Handed to Postgres it
    // was refused as uuid syntax, a 500, on every route that reads one
    // (`ledger-rows/row-1874` added one more: the tags edit).
    if (!isUuid(id)) throw new NotFoundException('Template not found')
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
  /**
   * A template of the project as its saver may read it
   * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`):
   * the project by the read rule, and only the lists and tasks the saver may
   * open. While managers and admins alone could save, they read all of it; a
   * member granted `template.manage` does not, and a template is shown to the
   * whole workspace.
   */
  async saveFromProject(
    workspaceId: string,
    actor: { id: string; role?: string | null },
    dto: {
      projectId: string
      name: string
      description?: string
      icon?: string
      category?: string
      useCase?: string
      targetType?: string
      tags?: unknown
    },
  ) {
    // Refused before anything is read (`ledger-rows/row-1874`): ClickUp saves
    // a template with "a template name, description, tags", and a tag past
    // its bounds is refused in words rather than cut (`normalizeTemplateTags`).
    const tags = normalizeTemplateTags(dto.tags)
    // The project, in this workspace, as the saver may open it.
    const project = isUuid(dto.projectId) ? await readableProject(this.db, workspaceId, dto.projectId, actor) : null
    if (!project) throw new NotFoundException('Project not found in this workspace')
    const isManager = await resolveIsManager(this.db, workspaceId, actor.id, actor.role)

    const projectLists = await this.db
      .select()
      .from(lists)
      .where(and(eq(lists.projectId, dto.projectId), listVisibilityFilter(actor.id, isManager)))
      .orderBy(asc(lists.position))

    const payload: TemplatePayload = { lists: [] }
    for (const list of projectLists) {
      const listTasks = await this.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.listId, list.id), eq(tasks.isArchived, false), taskVisibilityFilter(this.db, actor.id, isManager)))
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
        createdById: actor.id,
        targetType,
        // Read off the snapshot rather than asked of the person saving it.
        complexity: complexityOf(payload),
        category: isCategory(dto.category) ? dto.category : null,
        useCase: isUseCase(dto.useCase) ? dto.useCase : null,
        tags,
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
      tags?: unknown
    },
  ) {
    if (!dto.payload?.lists) throw new BadRequestException('Template payload must contain lists')
    // Refused here rather than discovered by whoever applies it: a list needs a
    // name, and its tasks — when it has any — are an array of titled tasks.
    for (const list of dto.payload.lists) {
      if (typeof list?.name !== 'string' || !list.name.trim()) throw new BadRequestException('Every list in a template needs a name')
      if (list.tasks !== undefined && (!Array.isArray(list.tasks) || list.tasks.some((t) => typeof t?.title !== 'string' || !t.title.trim()))) {
        throw new BadRequestException('A template list’s tasks must each have a title')
      }
    }
    const targetType: TemplateTargetType = isTargetType(dto.targetType) ? dto.targetType : 'folder'
    if (targetType === 'list' && dto.payload.lists.length !== 1) {
      throw new BadRequestException('A list template must carry exactly one list')
    }
    // `ledger-rows/row-1874` — cleaned, or refused in words, as a save's are.
    const tags = normalizeTemplateTags(dto.tags)
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
        tags,
      })
      .returning()
    return row
  }

  /**
   * `ledger-rows/row-1874` — a template's tags, changed after it was saved.
   * ClickUp: "You can add or edit tags in the Template Center at any time".
   * The route asks `template.manage`, as saving and deleting one do. The list
   * sent replaces the list held; an empty one clears it.
   *
   * A BUILT-IN IS REFUSED: it is one row shown to every workspace, so a tag
   * one workspace wrote on it would appear in all of them.
   */
  async setTags(workspaceId: string, id: string, value: unknown) {
    const tpl = await this.getOne(workspaceId, id)
    if (tpl.isBuiltIn || !tpl.workspaceId) throw new BadRequestException('A built-in template cannot be tagged')
    // Absent is not "none": a body that forgot the list must not clear it.
    if (value === undefined) throw new BadRequestException('Send the tags as a list; an empty list clears them')
    const tags = normalizeTemplateTags(value)
    const [row] = await this.db
      .update(projectTemplates)
      .set({ tags, updatedAt: new Date() })
      .where(and(eq(projectTemplates.id, tpl.id), eq(projectTemplates.workspaceId, workspaceId)))
      .returning()
    if (!row) throw new NotFoundException('Template not found')
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
    globalRole?: string,
  ) {
    const tpl = await this.getOne(workspaceId, dto.templateId)
    const targetType: TemplateTargetType = isTargetType(tpl.targetType) ? tpl.targetType : 'folder'
    if (targetType === 'folder') await this.assertMayMake(workspaceId, userId, globalRole, 'project.create')
    if (targetType === 'space') await this.assertMayMake(workspaceId, userId, globalRole, 'space.create')
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
      // Applying a template CREATES in the target, so it faces the create
      // gate every other create faces. See assertCanPlaceIn.
      await assertCanPlaceIn(this.db, { spaceId: found.spaces.id, projectId: found.projects.id, actorId: userId, kind: 'list' })
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
        await assertCanPlaceIn(this.db, { spaceId: space.id, actorId: userId, kind: 'project' })
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
      /*
       * A list from a template needs its status pipeline. Applying a template
       * used to produce lists with no statuses at all, so a task in one could
       * be set to `done` and still read back `statusCategory: 'open'` —
       * permanently, and invisibly, because the UI renders the key while
       * everything that matters reads the category.
       */
      if (createdList) await seedListStatuses(this.db, createdList.id)
      listsCreated++

      // `?? []`: a list with no `tasks` is a list with nothing in it, as
      // `complexityOf` already reads it. This iterated it bare and answered 500
      // to anybody applying a template whose list carried none.
      for (const task of list.tasks ?? []) {
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
