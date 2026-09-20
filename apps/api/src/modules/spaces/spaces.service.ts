import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common'
import { eq, and, or, ne, inArray } from 'drizzle-orm'
import { spaces, spaceMembers, spaceStatuses, folders, projects, lists, workspaces } from '@rundesk/db'
import type { Db, SpaceDefaultPermission } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'
import { isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'
import { SecurityService } from '../security/security.service'
import { ListsService } from '../lists/lists.service'
import { PlansService } from '../plans/plans.service'
import { PLAN_TIERS, type PlanId } from '../plans/plans.constants'
import {
  SPACE_VIEW_KEYS,
  SPACE_FEATURE_KEYS,
  CLICK_APP_MIN_PLAN,
  clickAppsForPlan,
  effectiveFeatures,
  planRestrictsClickApps,
  findPreset,
  type SpacePreset,
  type SpaceViewKey,
  type SpaceFeatureKey,
} from './space-presets'

// Re-exported from here because this module's callers have always imported it
// from the service; the list itself now lives beside the presets that use it.
export { SPACE_VIEW_KEYS }

/** §V2-06 frame `06:52` — the rungs "Default permission" offers. */
const SPACE_PERMISSIONS: readonly SpaceDefaultPermission[] = ['view', 'comment', 'edit', 'admin']

/**
 * Validate + normalise a space's view config so a bad body can never reach the
 * jsonb column. Drops unknown view keys; guarantees the default view is one of
 * the enabled views. `null` clears it (revert to all-views / list default).
 */
function normalizeViewConfig(
  vc: { defaultView?: string; enabledViews?: string[] } | null,
): { defaultView?: string; enabledViews?: string[] } | null {
  if (vc === null) return null
  if (typeof vc !== 'object' || Array.isArray(vc)) {
    throw new BadRequestException('viewConfig must be an object or null')
  }
  const out: { defaultView?: string; enabledViews?: string[] } = {}
  if (vc.enabledViews !== undefined) {
    if (!Array.isArray(vc.enabledViews)) throw new BadRequestException('enabledViews must be an array')
    const enabled = vc.enabledViews.filter((v): v is SpaceViewKey => SPACE_VIEW_KEYS.includes(v as SpaceViewKey))
    // Never let a space end up with zero views — fall back to all.
    out.enabledViews = enabled.length ? Array.from(new Set(enabled)) : [...SPACE_VIEW_KEYS]
  }
  if (vc.defaultView !== undefined) {
    if (!SPACE_VIEW_KEYS.includes(vc.defaultView as SpaceViewKey)) {
      throw new BadRequestException('invalid defaultView')
    }
    out.defaultView = vc.defaultView
    // The default must be selectable, so ensure it's within the enabled set.
    if (out.enabledViews && !out.enabledViews.includes(vc.defaultView)) out.enabledViews.push(vc.defaultView)
  }
  return out
}

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
    private lists: ListsService,
    private plans: PlansService,
  ) {}

  /**
   * §V2-06 `[07:20]` — the ClickApps gate, server side.
   *
   * A client-only gate is not a gate: the wizard can draw a padlock on Custom
   * Fields and a `curl` can still post `features: ['customFields']`. This is
   * the line that decides.
   *
   * TWO ANSWERS, ON PURPOSE.
   *
   *   · An EXPLICIT `features` array naming a ClickApp the plan does not reach
   *     is REFUSED (403). Somebody asked for something they do not have, and
   *     silently dropping it is the mirror defect — the request succeeds, the
   *     toast is green, and the switch they set is off when they come back.
   *
   *   · A PRESET's features are FILTERED. The preset is a suggestion Rundesk
   *     made, not a request the person typed; "Marketing Teams" must remain
   *     choosable on a free plan, just with fewer switches on. Refusing here
   *     would make three of the four cards un-clickable on free and blame the
   *     person for picking one.
   */
  private assertClickAppsAllowed(planId: PlanId, requested: readonly string[]): void {
    const allowed = new Set<string>(clickAppsForPlan(planId))
    const refused = requested.filter(
      (key) => (SPACE_FEATURE_KEYS as readonly string[]).includes(key) && !allowed.has(key),
    ) as SpaceFeatureKey[]
    if (!refused.length) return
    const named = refused
      .map((key) => `${key} (needs ${PLAN_TIERS[CLICK_APP_MIN_PLAN[key]].label})`)
      .join(', ')
    throw new ForbiddenException(
      `Your ${PLAN_TIERS[planId].label} plan does not include ${named}. Upgrade your plan to enable ${refused.length === 1 ? 'it' : 'them'}.`,
    )
  }

  /**
   * Rows out of the `spaces` table with their ClickApps narrowed to the plan.
   *
   * A NO-OP on the tiers that withhold nothing (business, enterprise — and
   * enterprise is every existing workspace), so the rows a workspace that is
   * not being gated receives are byte-for-byte what they were. That matters:
   * `features: null` means "predates the column, everything on", and
   * materialising it into a map on a plan that changes nothing would rewrite
   * the meaning of every existing space for no reason.
   */
  private async narrowToPlan<T extends { features?: unknown }>(workspaceId: string, rows: T[]): Promise<T[]> {
    if (!rows.length) return rows
    const plan = await this.plans.getWorkspacePlan(workspaceId)
    if (!planRestrictsClickApps(plan.id)) return rows
    return rows.map((row) => ({
      ...row,
      features: effectiveFeatures(row.features as Record<string, boolean> | null, plan.id),
    }))
  }

  /**
   * §V2-06 — "Create a Space", frames `06:52` and `07:06`.
   *
   * Everything past `name` was already accepted here and never sent: both web
   * call sites POSTed `{ workspaceId, name }` and nothing else, so description,
   * colour and icon were live parameters no UI could reach. The wizard now
   * fills them, and brings four more the frames ask for — default permission,
   * the workflow preset, its views and its ClickApps.
   *
   * The preset is applied here rather than in the controller because
   * `[07:46]` makes it more than a stored label: "yeh LIST automatically
   * generate kar deta hai ClickUp … us base pe jo aap ne ooper di ho". A space
   * created from a preset comes with its statuses and its first lists, or the
   * question the wizard asked was for nothing.
   */
  async createSpace(
    workspaceId: string,
    data: {
      name: string
      description?: string
      color?: string
      icon?: string
      visibility?: 'public' | 'private'
      defaultPermission?: SpaceDefaultPermission
      presetKey?: string
      /** Overrides the preset's own, so "customize to your liking" is real. */
      viewConfig?: { defaultView?: string; enabledViews?: string[] }
      features?: string[]
    },
    actorId?: string,
  ) {
    // §A4.2 — an agency holding several clients' work wants new spaces closed by
    // default. An explicit `visibility` on the request still wins, so the policy
    // sets the default rather than removing the choice.
    const [workspace] = await this.db
      .select({ defaultSpacePrivate: workspaces.defaultSpacePrivate })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    const visibility = data.visibility ?? (workspace?.defaultSpacePrivate ? 'private' : 'public')

    const preset = findPreset(data.presetKey)

    /*
     * The wizard's answers win over the preset's defaults, and the preset wins
     * over nothing at all. A person who opened "Customize defaults" and turned
     * Calendar off must not get Calendar back because the preset said so.
     */
    const chosenViews =
      data.viewConfig ?? (preset ? { defaultView: preset.defaultView, enabledViews: preset.views } : null)
    const viewConfig = chosenViews === null ? null : normalizeViewConfig(chosenViews)

    /*
     * §V2-06 `[07:20]` — the plan has its say before the row is written.
     * Explicit choices are refused, the preset's are filtered; see
     * `assertClickAppsAllowed`.
     */
    const plan = await this.plans.getWorkspacePlan(workspaceId)
    const allowedClickApps = clickAppsForPlan(plan.id)
    if (data.features) this.assertClickAppsAllowed(plan.id, data.features)
    const features = data.features ?? preset?.features.filter((f) => allowedClickApps.includes(f))

    const permission: SpaceDefaultPermission = SPACE_PERMISSIONS.includes(
      data.defaultPermission as SpaceDefaultPermission,
    )
      ? (data.defaultPermission as SpaceDefaultPermission)
      : 'edit'

    const result = await this.db
      .insert(spaces)
      .values({
        workspaceId,
        name: data.name,
        description: data.description,
        color: data.color || '#354fb0',
        icon: data.icon,
        visibility,
        defaultPermission: permission,
        presetKey: preset?.key ?? null,
        viewConfig: viewConfig ?? null,
        features: features ? Object.fromEntries(SPACE_FEATURE_KEYS.map((k) => [k, features.includes(k)])) : null,
        createdById: actorId ?? null,
      })
      .returning()

    const space = result[0]
    // Seed the creator as an admin member so private-conversion never orphans
    // the space (mirrors the 0035 backfill for existing spaces).
    if (actorId && space) {
      await this.db
        .insert(spaceMembers)
        .values({ spaceId: space.id, userId: actorId, role: 'admin', addedById: actorId })
        .onConflictDoNothing()
    }

    if (space && preset) await this.applyPreset(space.id, preset, actorId)
    return space
  }

  /**
   * `[07:46]` — the preset's statuses and its first lists.
   *
   * Failures here are logged and swallowed rather than rolled back: the space
   * EXISTS by this point, and a person who watched it appear in the sidebar and
   * then got an error would have no way to tell whether it is there. A space
   * with no seeded list is recoverable in one click; a space that half-exists
   * is not.
   */
  private async applyPreset(spaceId: string, preset: SpacePreset, actorId?: string) {
    try {
      await this.db.insert(spaceStatuses).values(
        preset.statuses.map((st, i) => ({
          spaceId,
          key: st.key,
          name: st.name,
          color: st.color,
          category: st.category,
          position: i,
        })),
      ).onConflictDoNothing()
    } catch (err) {
      this.logger.warn(`space ${spaceId}: preset statuses not applied — ${(err as Error).message}`)
    }

    /*
     * Through the lists service and the space's hidden container project — the
     * same path a hand-made list under a space takes (video 1, §G15-10). A
     * direct insert here would skip whatever that path does about statuses,
     * default views and search indexing, and the seeded lists would quietly
     * differ from every other list in the space.
     */
    try {
      const containerId = await this.lists.defaultContainerForSpace(spaceId, actorId)
      for (const name of preset.seedLists) {
        await this.lists.createList(containerId, { name }, actorId)
      }
    } catch (err) {
      this.logger.warn(`space ${spaceId}: preset lists not created — ${(err as Error).message}`)
    }
  }

  /**
   * The destination tree for the Move picker: every space the actor can see,
   * with its folders and projects. Reuses getSpacesByWorkspace so a private
   * space the actor isn't in never appears as a move target.
   */
  async moveTargets(workspaceId: string, actorId?: string) {
    const visible = await this.getSpacesByWorkspace(workspaceId, actorId)
    if (visible.length === 0) return []
    const spaceIds = visible.map((s) => s.id)

    const [folderRows, projectRows] = await Promise.all([
      this.db
        .select({ id: folders.id, name: folders.name, spaceId: folders.spaceId })
        .from(folders)
        .where(and(inArray(folders.spaceId, spaceIds), eq(folders.isArchived, false))),
      this.db
        .select({ id: projects.id, name: projects.name, spaceId: projects.spaceId, folderId: projects.folderId })
        .from(projects)
        .where(and(inArray(projects.spaceId, spaceIds), eq(projects.isArchived, false))),
    ])

    // Lists too, so a task can be moved — a task lands in a list, not a project.
    const projectIds = projectRows.map((pr) => pr.id)
    const listRows = projectIds.length
      ? await this.db
          .select({ id: lists.id, name: lists.name, projectId: lists.projectId })
          .from(lists)
          .where(and(inArray(lists.projectId, projectIds), eq(lists.isArchived, false)))
      : []

    return visible.map((sp) => {
      const spProjects = projectRows.filter((pr) => pr.spaceId === sp.id)
      const spProjectIds = new Set(spProjects.map((pr) => pr.id))
      return {
        id: sp.id,
        name: sp.name,
        icon: sp.icon,
        color: sp.color,
        folders: folderRows.filter((f) => f.spaceId === sp.id).map((f) => ({ id: f.id, name: f.name })),
        projects: spProjects.map((pr) => ({ id: pr.id, name: pr.name, folderId: pr.folderId })),
        lists: listRows
          .filter((l) => spProjectIds.has(l.projectId))
          .map((l) => ({ id: l.id, name: l.name, projectId: l.projectId })),
      }
    })
  }

  async getSpacesByWorkspace(workspaceId: string, actorId?: string) {
    const base = and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, false))
    // Managers (and internal callers with no actor) see every space.
    const rows =
      !actorId || (await isWorkspaceManager(this.db, workspaceId, actorId))
        ? await this.db.select().from(spaces).where(base)
        : // Everyone else sees public spaces plus the private ones they belong to.
          await this.db
            .select()
            .from(spaces)
            .where(
              and(
                base,
                or(
                  ne(spaces.visibility, 'private'),
                  inArray(
                    spaces.id,
                    this.db
                      .select({ id: spaceMembers.spaceId })
                      .from(spaceMembers)
                      .where(eq(spaceMembers.userId, actorId)),
                  ),
                ),
              ),
            )
    /*
     * THE READ SITE THAT MAKES THE GATE REAL. `useSpaceFeatures` reads exactly
     * these rows, so narrowing here means a downgrade takes the ClickApp away
     * everywhere it is read — without a single change in the web, and without a
     * second copy of the plan rules living in the front end.
     */
    return this.narrowToPlan(workspaceId, rows)
  }

  async getSpace(spaceId: string) {
    const [space] = await this.db
      .select()
      .from(spaces)
      .where(eq(spaces.id, spaceId))
    if (!space) return null
    const [narrowed] = await this.narrowToPlan(space.workspaceId, [space])
    return narrowed ?? null
  }

  /**
   * DEFECT FIXED HERE. `SpacesController.updateSpace` declares
   * `defaultPermission` and `features` in its body type, with a comment saying
   * they are "editable after creation too … a switch you can only ever set once
   * is a decision the person is stuck with" — and neither ever reached the
   * table, because this signature did not accept them and the whitelist below
   * did not copy them. `PUT /spaces/:id {features}` returned 200 and changed
   * nothing: a stored value no writer honours, which is the mirror of the
   * mirror. Both are honoured now, and `features` goes through the same plan
   * gate creation does — a gate that only fires on create is bypassed by
   * creating on one plan and editing on another.
   */
  async updateSpace(
    spaceId: string,
    data: Partial<{
      name: string
      description: string
      color: string
      icon: string
      viewConfig: { defaultView?: string; enabledViews?: string[] } | null
      defaultPermission: SpaceDefaultPermission
      features: Record<string, boolean> | null
    }>,
    actorId?: string,
  ) {
    if (actorId) await this.assertManageable(spaceId, actorId)
    // Whitelist updatable columns instead of spreading the untyped request body
    // (prevents stray/wrong-typed fields reaching the row — crash + mass-assign).
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'description', 'color', 'icon'] as const) {
      if (data[key] !== undefined) set[key] = data[key]
    }
    if (data.viewConfig !== undefined) set.viewConfig = normalizeViewConfig(data.viewConfig)
    if (data.defaultPermission !== undefined) {
      if (!SPACE_PERMISSIONS.includes(data.defaultPermission)) {
        throw new BadRequestException('invalid defaultPermission')
      }
      set.defaultPermission = data.defaultPermission
    }
    if (data.features !== undefined) {
      if (data.features === null) {
        set.features = null
      } else {
        if (typeof data.features !== 'object' || Array.isArray(data.features)) {
          throw new BadRequestException('features must be an object or null')
        }
        const space = await this.getSpaceRow(spaceId)
        if (!space) throw new NotFoundException('Space not found')
        const plan = await this.plans.getWorkspacePlan(space.workspaceId)
        const wanted = SPACE_FEATURE_KEYS.filter((key) => data.features?.[key] === true)
        this.assertClickAppsAllowed(plan.id, wanted)
        set.features = Object.fromEntries(SPACE_FEATURE_KEYS.map((k) => [k, wanted.includes(k)]))
      }
    }
    const result = await this.db
      .update(spaces)
      .set(set)
      .where(eq(spaces.id, spaceId))
      .returning()

    return result[0]
  }

  /** The raw row, un-narrowed — for the internal callers that need `workspaceId`. */
  private async getSpaceRow(spaceId: string) {
    const [space] = await this.db.select().from(spaces).where(eq(spaces.id, spaceId))
    return space ?? null
  }

  async deleteSpace(spaceId: string, actorId?: string, ipAddress?: string) {
    const space = actorId ? await this.assertManageable(spaceId, actorId, 'delete') : null
    await this.db
      .update(spaces)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(eq(spaces.id, spaceId))
    if (actorId && space) {
      // §13.3 — audit the container deletion (space archival).
      await this.security.logAuditEvent({
        workspaceId: space.workspaceId,
        actorId,
        action: 'space.deleted',
        resourceType: 'space',
        resourceId: spaceId,
        description: `Archived space "${space.name}"`,
        ipAddress,
      })
    }
  }

  private async assertManageable(spaceId: string, actorId: string, action: 'manage' | 'delete' = 'manage') {
    // The raw row: this is a permission check, and narrowing ClickApps to the
    // plan on the way would be a plan lookup nobody here reads.
    const space = await this.getSpaceRow(spaceId)
    if (!space) throw new NotFoundException('Space not found')
    await assertCanManageContainer(this.db, {
      workspaceId: space.workspaceId,
      createdById: space.createdById,
      actorId,
      kind: 'space',
      action,
      // Deleting an entire space is admin-only (space.delete not in MANAGER_DELTA).
      adminOnlyDelete: true,
    })
    return space
  }
}
