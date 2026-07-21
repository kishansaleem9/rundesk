import { Injectable, Inject, ForbiddenException } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import { featureFlags, workspaceMembers } from '@rundesk/db'
import { DEFAULT_ENABLED_FLAGS } from '@rundesk/feature-flags'
import type { FlagKey, FlagResolutionContext, ResolvedFlags } from '@rundesk/feature-flags'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

@Injectable()
export class FeatureFlagsService {
  // In-process cache: key = `${userId}:${workspaceId}` → resolved flags + expiry
  private cache = new Map<string, { flags: Record<string, boolean>; expiresAt: number }>()

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
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
    // require super_admin; workspace overrides require workspace_admin of the
    // target workspace. (The @Roles decorator was never enforced — no RolesGuard
    // existed — so this is the real gate.)
    const isSuperAdmin = actor.role === 'super_admin'
    if (scope === 'workspace') {
      if (!isSuperAdmin) {
        if (!workspaceId) throw new ForbiddenException('workspaceId is required for workspace-scoped flags')
        const [membership] = await this.db
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
          .limit(1)
        if (!membership || membership.role !== 'workspace_admin') {
          throw new ForbiddenException('Workspace admin required to change workspace feature flags')
        }
      }
    } else if (!isSuperAdmin) {
      throw new ForbiddenException('Only a super admin can change global, role, or user feature flags')
    }
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
