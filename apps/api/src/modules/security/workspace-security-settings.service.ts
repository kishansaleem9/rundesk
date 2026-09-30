import { Injectable, Inject, BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { workspaceSecuritySettings, workspaceMembers, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from './security.service'
import { canonicalIp, isIpAllowed, isValidIpRule } from './ip-allowlist.util'

export type SecuritySettings = {
  workspaceId: string | null
  ipAllowlistEnabled: boolean
  ipAllowlist: string[]
  ipAllowlistIncludeAdmins: boolean
  sessionTimeoutMinutes: number
  maxConcurrentSessions: number
  lockoutEnabled: boolean
  lockoutThreshold: number
  lockoutDurationMinutes: number
  requireStrongPasswords: boolean
  blockBreachedPasswords: boolean
}

// Mirrors the column defaults in the schema so an un-configured workspace
// behaves identically to one with a freshly-inserted default row.
export const SECURITY_DEFAULTS: Omit<SecuritySettings, 'workspaceId'> = {
  ipAllowlistEnabled: false,
  ipAllowlist: [],
  ipAllowlistIncludeAdmins: false,
  sessionTimeoutMinutes: 10080,
  maxConcurrentSessions: 0,
  lockoutEnabled: true,
  lockoutThreshold: 5,
  lockoutDurationMinutes: 30,
  requireStrongPasswords: true,
  blockBreachedPasswords: false,
}

type UpdatablePatch = Partial<Omit<SecuritySettings, 'workspaceId' | 'ipAllowlist'>> & { ipAllowlist?: unknown }

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? Math.round(v) : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

@Injectable()
export class WorkspaceSecuritySettingsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  /** Settings for a workspace, falling back to defaults when no row exists. */
  async get(workspaceId: string | null | undefined): Promise<SecuritySettings> {
    if (!workspaceId) return { workspaceId: null, ...SECURITY_DEFAULTS }
    const [row] = await this.db
      .select()
      .from(workspaceSecuritySettings)
      .where(eq(workspaceSecuritySettings.workspaceId, workspaceId))
      .limit(1)
    if (!row) return { workspaceId, ...SECURITY_DEFAULTS }
    return {
      workspaceId,
      ipAllowlistEnabled: row.ipAllowlistEnabled,
      ipAllowlist: (row.ipAllowlist as string[]) ?? [],
      ipAllowlistIncludeAdmins: row.ipAllowlistIncludeAdmins,
      sessionTimeoutMinutes: row.sessionTimeoutMinutes,
      maxConcurrentSessions: row.maxConcurrentSessions,
      lockoutEnabled: row.lockoutEnabled,
      lockoutThreshold: row.lockoutThreshold,
      lockoutDurationMinutes: row.lockoutDurationMinutes,
      requireStrongPasswords: row.requireStrongPasswords,
      blockBreachedPasswords: row.blockBreachedPasswords,
    }
  }

  /**
   * Upsert the workspace policy. Sanitises every field and — critically —
   * guarantees the admin saving the change cannot lock themselves out: when
   * the allowlist is enabled with a non-empty list, the requester's own IP is
   * auto-added if it isn't already covered.
   */
  async update(
    workspaceId: string,
    patch: UpdatablePatch,
    actorId: string,
    requesterIp?: string,
  ): Promise<SecuritySettings> {
    const current = await this.get(workspaceId)

    // Sanitise the IP list: keep only valid rules, trim, dedupe, cap length.
    let ipAllowlist = current.ipAllowlist
    if (patch.ipAllowlist !== undefined) {
      const arr = Array.isArray(patch.ipAllowlist) ? patch.ipAllowlist : []
      ipAllowlist = [
        ...new Set(
          arr
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.trim())
            .filter((x) => x && isValidIpRule(x)),
        ),
      ].slice(0, 200)
    }

    const next: SecuritySettings = {
      workspaceId,
      ipAllowlistEnabled: patch.ipAllowlistEnabled ?? current.ipAllowlistEnabled,
      ipAllowlist,
      ipAllowlistIncludeAdmins: patch.ipAllowlistIncludeAdmins ?? current.ipAllowlistIncludeAdmins,
      sessionTimeoutMinutes: patch.sessionTimeoutMinutes !== undefined
        ? clampInt(patch.sessionTimeoutMinutes, 5, 525600, current.sessionTimeoutMinutes)
        : current.sessionTimeoutMinutes,
      maxConcurrentSessions: patch.maxConcurrentSessions !== undefined
        ? clampInt(patch.maxConcurrentSessions, 0, 100, current.maxConcurrentSessions)
        : current.maxConcurrentSessions,
      lockoutEnabled: patch.lockoutEnabled ?? current.lockoutEnabled,
      lockoutThreshold: patch.lockoutThreshold !== undefined
        ? clampInt(patch.lockoutThreshold, 1, 100, current.lockoutThreshold)
        : current.lockoutThreshold,
      lockoutDurationMinutes: patch.lockoutDurationMinutes !== undefined
        ? clampInt(patch.lockoutDurationMinutes, 1, 1440, current.lockoutDurationMinutes)
        : current.lockoutDurationMinutes,
      requireStrongPasswords: patch.requireStrongPasswords ?? current.requireStrongPasswords,
      blockBreachedPasswords: patch.blockBreachedPasswords ?? current.blockBreachedPasswords,
    }

    // Anti-lockout: never let an admin enable an allowlist that excludes them.
    if (next.ipAllowlistEnabled && next.ipAllowlist.length > 0 && requesterIp) {
      if (!isIpAllowed(requesterIp, next.ipAllowlist)) {
        const clean = canonicalIp(requesterIp)
        if (clean && isValidIpRule(clean)) next.ipAllowlist = [...next.ipAllowlist, clean]
      }
    }

    const { workspaceId: _ws, ...values } = next
    void _ws
    await this.db
      .insert(workspaceSecuritySettings)
      .values({ workspaceId, ...values, updatedAt: new Date(), updatedById: actorId })
      .onConflictDoUpdate({
        target: workspaceSecuritySettings.workspaceId,
        set: { ...values, updatedAt: new Date(), updatedById: actorId },
      })

    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'security.settings_updated',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: 'Updated workspace security settings',
      metadata: {
        ipAllowlistEnabled: next.ipAllowlistEnabled,
        ipAllowlistCount: next.ipAllowlist.length,
        sessionTimeoutMinutes: next.sessionTimeoutMinutes,
        maxConcurrentSessions: next.maxConcurrentSessions,
        lockoutEnabled: next.lockoutEnabled,
        requireStrongPasswords: next.requireStrongPasswords,
        blockBreachedPasswords: next.blockBreachedPasswords,
      },
      ipAddress: requesterIp,
    })

    return next
  }

  /**
   * Resolve the effective policy for a user at login time: their primary
   * (earliest-joined) workspace, plus whether they are an admin there (used by
   * the IP-allowlist admin exemption).
   */
  async getEffectiveForUser(userId: string): Promise<{ settings: SecuritySettings; isWorkspaceAdmin: boolean }> {
    /*
     * ARCHIVED WORKSPACES ARE NOT CANDIDATES. This selected straight from
     * `workspace_members` with no join, so a person whose oldest membership
     * was in a workspace they had since archived took their session policy —
     * and, now that `login` resolves through here, their token's `workspaceId`
     * claim — from a workspace that no longer appears in their own switcher.
     * `WorkspacesService.findByMember` has always excluded archived ones; this
     * now agrees with it, which is the point of resolving in one place.
     */
    const [membership] = await this.db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)))
      .orderBy(asc(workspaceMembers.joinedAt))
      .limit(1)
    if (!membership) return { settings: { workspaceId: null, ...SECURITY_DEFAULTS }, isWorkspaceAdmin: false }
    const settings = await this.get(membership.workspaceId)
    return { settings, isWorkspaceAdmin: membership.role === 'workspace_admin' }
  }

  // ─── Password policy ─────────────────────────────────────────────────────────

  /**
   * A NEW PASSWORD, HELD TO A POLICY: the strength rules below when
   * `requireStrong`, the breach list when `blockBreached`; a 400 saying what is
   * wrong, or nothing. Sign-up passes the strong baseline (there is no
   * workspace yet); reset-password and the profile's password change pass the
   * workspace's own (`getEffectiveForUser`), which is strong by default. One
   * function, so the three cannot say different things
   * (`found-30-sep/password-change-unthrottled`: the change checked length alone).
   */
  async enforcePasswordPolicy(password: string, policy: { requireStrong: boolean; blockBreached: boolean }): Promise<void> {
    if (policy.requireStrong) {
      const problem = this.passwordStrengthProblem(password)
      if (problem) throw new BadRequestException(problem)
    }
    if (policy.blockBreached && (await this.isPasswordBreached(password))) {
      throw new BadRequestException('This password has appeared in a known data breach. Please choose a different one.')
    }
  }

  /** Throws BadRequest-style errors via the caller; returns a reason or null. */
  passwordStrengthProblem(password: string): string | null {
    const missing: string[] = []
    if (password.length < 10) missing.push('at least 10 characters')
    if (!/[a-z]/.test(password)) missing.push('a lowercase letter')
    if (!/[A-Z]/.test(password)) missing.push('an uppercase letter')
    if (!/[0-9]/.test(password)) missing.push('a number')
    if (!/[^A-Za-z0-9]/.test(password)) missing.push('a symbol')
    return missing.length ? `Password must contain ${missing.join(', ')}.` : null
  }

  /**
   * Check a password against HaveIBeenPwned's k-anonymity range API. Fails
   * OPEN: any network/parse error returns false so the breach check can never
   * block a legitimate sign-up when the API is unreachable (or blocked by the
   * environment's egress policy).
   */
  async isPasswordBreached(password: string): Promise<boolean> {
    try {
      const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
      const prefix = sha1.slice(0, 5)
      const suffix = sha1.slice(5)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2500)
      let text: string
      try {
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
          signal: controller.signal,
          headers: { 'Add-Padding': 'true' },
        })
        if (!res.ok) return false
        text = await res.text()
      } finally {
        clearTimeout(timer)
      }
      for (const line of text.split('\n')) {
        const [hashSuffix] = line.split(':')
        if (hashSuffix.trim().toUpperCase() === suffix) return true
      }
      return false
    } catch {
      return false
    }
  }
}
