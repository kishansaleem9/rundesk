import { Injectable, Inject, ForbiddenException, BadRequestException } from '@nestjs/common'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { featureFlagRequests, featureFlags, workspaceMembers } from '@rundesk/db'
import { DEFAULT_ENABLED_FLAGS, FLAGS } from '@rundesk/feature-flags'
import type { FlagKey, FlagResolutionContext, ResolvedFlags } from '@rundesk/feature-flags'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CustomRolesService } from '../custom-roles/custom-roles.service'

const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

/**
 * WHO TURNS A WORKSPACE'S CLICKAPPS ON AND OFF, and is asked to
 * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`). ClickUp
 * ("Intro to ClickApps"): "Only Workspace owners and admins can activate or
 * deactivate ClickApps. Members can view". An admin's by default; a custom
 * role grants it.
 */
const CLICKAPPS_KEY = 'workspace.clickapps.manage' as const

/** A flag this build knows — the switch and the ask refuse anything else. */
function isKnownFlag(flagKey: string): boolean {
  return (Object.values(FLAGS) as string[]).includes(flagKey)
}

@Injectable()
export class FeatureFlagsService {
  // In-process cache: key = `${userId}:${workspaceId}` → resolved flags + expiry
  private cache = new Map<string, { flags: Record<string, boolean>; expiresAt: number }>()

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
    private readonly notifications: NotificationsService,
    private readonly customRoles: CustomRolesService,
  ) {}

  async isEnabled(flagKey: FlagKey, ctx: Partial<FlagResolutionContext>): Promise<boolean> {
    const resolved = await this.resolveForContext(ctx)
    return resolved[flagKey] ?? false
  }

  async resolveForContext(ctx: Partial<FlagResolutionContext>): Promise<Record<string, boolean>> {
    const cacheKey = `${ctx.userId ?? 'anon'}:${ctx.workspaceId ?? 'none'}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.flags

    const resolved = await this.resolveFromDb(ctx)
    this.cache.set(cacheKey, { flags: resolved, expiresAt: Date.now() + CACHE_TTL_MS })
    return resolved
  }

  async resolveForUser(ctx: FlagResolutionContext): Promise<ResolvedFlags> {
    const flags = await this.resolveForContext(ctx)
    return { flags: flags as Record<FlagKey, boolean>, resolvedAt: Date.now() }
  }

  /**
   * Resolve flags for the workspace the caller is actually looking at. The
   * frontend passes the route workspaceId so nav gating reflects the viewed
   * workspace rather than only the token's active one. An explicit workspaceId
   * is honoured only when the caller can see it (super_admin, or a member),
   * so feature config can't be probed for arbitrary workspaces; otherwise we
   * fall back to the token's active workspace.
   */
  async resolveForUserRequest(
    user: { id: string; activeWorkspaceId?: string; role?: string },
    requestedWorkspaceId?: string,
  ): Promise<ResolvedFlags> {
    let workspaceId = user.activeWorkspaceId
    if (requestedWorkspaceId && requestedWorkspaceId !== user.activeWorkspaceId) {
      if (user.role === 'super_admin') {
        workspaceId = requestedWorkspaceId
      } else {
        const [member] = await this.db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, requestedWorkspaceId), eq(workspaceMembers.userId, user.id)))
          .limit(1)
        if (member) workspaceId = requestedWorkspaceId
      }
    }
    return this.resolveForUser({ userId: user.id, workspaceId: workspaceId ?? '', role: user.role ?? '' })
  }

  invalidateCache(userId?: string, workspaceId?: string) {
    if (userId && workspaceId) {
      this.cache.delete(`${userId}:${workspaceId}`)
    } else {
      // Invalidate all — used when global or workspace-wide flag changes
      this.cache.clear()
    }
  }

  /**
   * Drop cache entries affected by a flag change. Cache keys are
   * `${userId}:${workspaceId}`, so a workspace-scoped change must clear every
   * user's entry for that workspace (not a single synthetic key) — otherwise a
   * toggle wouldn't take effect until the 5-minute TTL expired.
   */
  private invalidateForFlagChange(
    scope: 'global' | 'workspace' | 'role' | 'user',
    scopeId: string | null,
    workspaceId: string | null,
  ) {
    if (scope === 'workspace' && workspaceId) {
      for (const key of [...this.cache.keys()]) {
        if (key.endsWith(`:${workspaceId}`)) this.cache.delete(key)
      }
    } else if (scope === 'user' && scopeId) {
      for (const key of [...this.cache.keys()]) {
        if (key.startsWith(`${scopeId}:`)) this.cache.delete(key)
      }
    } else {
      // global / role changes fan out across users — clear everything.
      this.cache.clear()
    }
  }

  private async resolveFromDb(ctx: Partial<FlagResolutionContext>): Promise<Record<string, boolean>> {
    // Start with platform defaults
    const resolved: Record<string, boolean> = {}
    for (const flag of DEFAULT_ENABLED_FLAGS) resolved[flag] = true

    // Load all relevant overrides in one query, ordered global → workspace → role → user
    const rows = await this.db.select().from(featureFlags).where(
      ctx.workspaceId
        ? eq(featureFlags.workspaceId, ctx.workspaceId)
        : isNull(featureFlags.workspaceId),
    )

    // Apply in resolution order: global first, then workspace, role, user (most specific wins)
    const order = ['global', 'workspace', 'role', 'user'] as const
    for (const scope of order) {
      for (const row of rows.filter((r) => r.scope === scope)) {
        const scopeMatches =
          scope === 'global' ||
          (scope === 'workspace' && row.scopeId === ctx.workspaceId) ||
          (scope === 'role' && row.scopeId === ctx.role) ||
          (scope === 'user' && row.scopeId === ctx.userId)

        if (scopeMatches) resolved[row.flagKey] = row.enabled
      }
    }

    return resolved
  }

  async setFlag(
    flagKey: FlagKey,
    enabled: boolean,
    scope: 'global' | 'workspace' | 'role' | 'user',
    scopeId: string | null,
    workspaceId: string | null,
    actor: { id: string; role?: string },
  ) {
    // Authorization: global / role / user overrides are platform-wide and
    // require super_admin; a workspace override asks `workspace.clickapps.manage`
    // in the target workspace — the key, by default an admin's, where this read
    // the membership row for `workspace_admin` and nothing a custom role could
    // grant. (The @Roles decorator was never enforced — no RolesGuard existed —
    // so this is the real gate.)
    const isSuperAdmin = actor.role === 'super_admin'
    if (scope === 'workspace') {
      if (!workspaceId) throw new ForbiddenException('workspaceId is required for workspace-scoped flags')
      if (!isSuperAdmin && !(await this.customRoles.hasPermission(workspaceId, actor.id, CLICKAPPS_KEY))) {
        throw new ForbiddenException(`Missing required permission: ${CLICKAPPS_KEY}`)
      }
      // A workspace's override is that workspace's: a row whose scopeId named
      // another was stored, never applied (`resolveFromDb` matches scopeId to
      // the workspace), and answered as if it had been.
      if (scopeId != null && scopeId !== workspaceId) {
        throw new BadRequestException('A workspace-scoped flag is scoped to its own workspace: scopeId must be the workspaceId')
      }
      scopeId = workspaceId
    } else if (!isSuperAdmin) {
      throw new ForbiddenException('Only a super admin can change global, role, or user feature flags')
    }
    // An override for a flag no build reads is a row that changes nothing.
    if (!isKnownFlag(flagKey)) throw new BadRequestException(`Unknown feature "${flagKey}"`)
    const updatedBy = actor.id
    await this.db.insert(featureFlags).values({
      flagKey, scope, scopeId, workspaceId: workspaceId ?? undefined, enabled, updatedBy,
    }).onConflictDoUpdate({
      target: [featureFlags.flagKey, featureFlags.scope, featureFlags.scopeId, featureFlags.workspaceId],
      set: { enabled, updatedBy, updatedAt: new Date() },
    })
    this.invalidateForFlagChange(scope, scopeId, workspaceId)
    await this.security.logAuditEvent({
      workspaceId: workspaceId ?? undefined,
      actorId: updatedBy,
      action: 'feature_flag.changed',
      resourceType: 'feature_flag',
      resourceId: flagKey,
      description: `Feature flag "${flagKey}" set to ${enabled ? 'on' : 'off'} (${scope})`,
      metadata: { flagKey, enabled, scope, scopeId: scopeId ?? null },
    })
  }

  /**
   * §2.8 gap 11 — "Contact your admin", made into something that happens.
   *
   * It asks whoever may switch the feature on — the holders of
   * `workspace.clickapps.manage`, a custom role's included — and takes them to
   * this workspace's Settings → Features, where they can. It told the
   * base-role admins alone, and linked them to the platform console, which
   * sends anybody but a platform admin away.
   *
   *   `[20:45]` recording "back end se on karna parta hai" — the capability is
   *   off until an admin turns it on, and the person who wants it is not that
   *   admin.
   *
   * The modal that explains this ends in a button. A button that opens a mail
   * client is a button that does nothing on a machine with no mail client set
   * up, so this asks the admins directly, in the app they are already in.
   *
   * Returns what actually happened rather than a bare 200: whether the flag was
   * already on (nothing to ask for), whether this person had already asked
   * today, and how many admins were told.
   */
  async requestFlag(
    flagKey: FlagKey,
    workspaceId: string,
    requester: { id: string; name?: string | null; email?: string | null },
  ): Promise<{ status: 'sent' | 'already_enabled' | 'already_asked' | 'no_admins'; notified: number }> {
    if (!isKnownFlag(flagKey)) {
      throw new BadRequestException(`Unknown feature "${flagKey}"`)
    }
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, requester.id)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Not a member of this workspace')

    // Asking for something you already have would send an admin chasing a
    // toggle that is already on.
    const resolved = await this.resolveForContext({
      userId: requester.id,
      workspaceId,
      role: membership.role,
    })
    if (resolved[flagKey] === true) return { status: 'already_enabled', notified: 0 }

    const holders = await this.customRoles.holdersOf(workspaceId, CLICKAPPS_KEY)
    const recipients = holders.filter((id) => id !== requester.id)
    if (recipients.length === 0) return { status: 'no_admins', notified: 0 }

    /*
     * One ask per person per feature per day. Pressing a button twice is not
     * two requests, and an admin's bell is not a place to leave a drum roll.
     *
     * Read from the ASKS, not from the notifications they produced. A
     * notification row is only written for an admin with an in-app channel
     * switched on, so in a workspace whose admins run email-only there was
     * never a row to find: the rule never tripped and every reload mailed all
     * of them again. What the rule is about is the press, so that is what it
     * now looks at.
     */
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [recent] = await this.db
      .select({ id: featureFlagRequests.id })
      .from(featureFlagRequests)
      .where(
        and(
          eq(featureFlagRequests.workspaceId, workspaceId),
          eq(featureFlagRequests.requesterId, requester.id),
          eq(featureFlagRequests.flagKey, flagKey),
          gte(featureFlagRequests.createdAt, since),
        ),
      )
      .limit(1)
    if (recent) return { status: 'already_asked', notified: 0 }

    // Recorded BEFORE the fan-out, so a request that dies partway through is
    // still an ask that happened rather than one that can be repeated at will.
    await this.db
      .insert(featureFlagRequests)
      .values({ workspaceId, flagKey, requesterId: requester.id })
      .catch(() => undefined)

    const who = requester.name?.trim() || requester.email || 'Someone'
    let notified = 0
    for (const userId of recipients) {
      const outcome = await this.notifications.createWithOutcome({
        userId,
        workspaceId,
        actorId: requester.id,
        type: 'access_requested',
        title: `${who} asked for ${flagKey}`,
        body: `${who} tried to use a feature this workspace has turned off. You can turn "${flagKey}" on in Settings → Features.`,
        target: { entityType: 'feature_flag', entityId: flagKey, url: `/app/${workspaceId}/settings?tab=features` },
      })
      /*
       * DELIVERY, not the row.
       *
       * create() returns the in-app row, and that is null for somebody who has
       * turned in-app off and left email on — a supported combination. Counting
       * rows therefore counted an admin who got the email as nobody, and told
       * the requester "nobody was told" while every admin had the mail. It also
       * meant the once-a-day rule never tripped for them, so they could be
       * emailed again on every press.
       *
       * Muting every channel is still a real zero: that is their choice, and
       * the caller is entitled to know the difference.
       */
      if (outcome?.delivered) notified++
    }
    return { status: 'sent', notified }
  }

  async listOverrides(workspaceId?: string | null) {
    const rows = await this.db
      .select()
      .from(featureFlags)
      .where(
        workspaceId
          ? eq(featureFlags.workspaceId, workspaceId)
          : isNull(featureFlags.workspaceId),
      )
    return rows.sort((a, b) => {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bt - at
    })
  }
}
