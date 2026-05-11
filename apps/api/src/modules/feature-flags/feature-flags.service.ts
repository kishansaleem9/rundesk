import { Injectable, Inject } from '@nestjs/common'
import { eq, isNull } from 'drizzle-orm'
import { featureFlags } from '@rundesk/db'
import { DEFAULT_ENABLED_FLAGS } from '@rundesk/feature-flags'
import type { FlagKey, FlagResolutionContext, ResolvedFlags } from '@rundesk/feature-flags'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

@Injectable()
export class FeatureFlagsService {
  // In-process cache: key = `${userId}:${workspaceId}` → resolved flags + expiry
  private cache = new Map<string, { flags: Record<string, boolean>; expiresAt: number }>()

  constructor(@Inject(DB_TOKEN) private db: Db) {}

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

  invalidateCache(userId?: string, workspaceId?: string) {
    if (userId && workspaceId) {
      this.cache.delete(`${userId}:${workspaceId}`)
    } else {
      // Invalidate all — used when global or workspace-wide flag changes
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
    updatedBy: string,
  ) {
    await this.db.insert(featureFlags).values({
      flagKey, scope, scopeId, workspaceId: workspaceId ?? undefined, enabled, updatedBy,
    }).onConflictDoUpdate({
      target: [featureFlags.flagKey, featureFlags.scope, featureFlags.scopeId, featureFlags.workspaceId],
      set: { enabled, updatedBy, updatedAt: new Date() },
    })
    this.invalidateCache(scopeId ?? undefined, workspaceId ?? undefined)
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
