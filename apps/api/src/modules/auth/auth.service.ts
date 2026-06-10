import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, BadRequestException, Inject, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { randomUUID, randomBytes } from 'node:crypto'
import { and, eq, isNull, desc } from 'drizzle-orm'
import { compareSync, hashSync } from 'bcryptjs'
import { users, sessions, organizations, organizationMembers, workspaces, workspaceMembers, invitations, passwordResets } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { UsersService } from '../users/users.service'
import { WorkspacesService } from '../workspaces/workspaces.service'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { EmailService } from '../email/email.service'
import { SecurityService } from '../security/security.service'
import { WorkspaceSecuritySettingsService } from '../security/workspace-security-settings.service'
import { isIpAllowed } from '../security/ip-allowlist.util'
import type { RegisterDto } from './dto/register.dto'
import type { SignupDto } from './dto/signup.dto'

type SessionMeta = { userAgent?: string; ip?: string }

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40) || 'workspace'
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private usersService: UsersService,
    private workspacesService: WorkspacesService,
    private jwtService: JwtService,
    private config: ConfigService,
    private featureFlagsService: FeatureFlagsService,
    private emailService: EmailService,
    private security: SecurityService,
    private securitySettings: WorkspaceSecuritySettingsService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email)
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials')

    const { settings } = await this.securitySettings.getEffectiveForUser(user.id)
    const now = new Date()

    // Account currently locked from prior failed attempts (auto-releasing).
    if (settings.lockoutEnabled && user.lockedUntil && new Date(user.lockedUntil) > now) {
      const mins = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - now.getTime()) / 60000))
      throw new UnauthorizedException(
        `Account temporarily locked due to failed logins. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
      )
    }

    if (!compareSync(password, user.passwordHash)) {
      if (settings.lockoutEnabled) {
        const attempts = (user.failedLoginAttempts ?? 0) + 1
        if (attempts >= settings.lockoutThreshold) {
          const lockedUntil = new Date(now.getTime() + settings.lockoutDurationMinutes * 60000)
          await this.db.update(users).set({ failedLoginAttempts: 0, lockedUntil }).where(eq(users.id, user.id))
          throw new UnauthorizedException(
            `Account locked after ${settings.lockoutThreshold} failed attempts. Try again in ${settings.lockoutDurationMinutes} minutes.`,
          )
        }
        await this.db.update(users).set({ failedLoginAttempts: attempts }).where(eq(users.id, user.id))
      }
      throw new UnauthorizedException('Invalid credentials')
    }

    if (!user.isActive) throw new UnauthorizedException('Account is disabled')

    // Successful login clears any failed-attempt state.
    if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
      await this.db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id))
    }

    return user
  }

  async login(user: typeof users.$inferSelect, meta: SessionMeta = {}) {
    const memberships = await this.workspacesService.findByMember(user.id)
    const primaryWorkspaceId = memberships[0]?.workspace.id ?? null

    const settings = await this.securitySettings.get(primaryWorkspaceId)

    // IP allowlist: block credential/refresh logins from disallowed IPs. Fails
    // OPEN when the list is empty or the client IP can't be determined, and
    // exempts workspace admins unless the policy opts them in (emergency access).
    if (settings.ipAllowlistEnabled && settings.ipAllowlist.length > 0 && meta.ip) {
      const isAdminHere = memberships[0]?.role === 'workspace_admin'
      const exempt = isAdminHere && !settings.ipAllowlistIncludeAdmins
      if (!exempt && !isIpAllowed(meta.ip, settings.ipAllowlist)) {
        await this.security.logAuditEvent({
          workspaceId: primaryWorkspaceId ?? undefined,
          actorId: user.id,
          actorEmail: user.email,
          action: 'auth.ip_blocked',
          resourceType: 'user',
          resourceId: user.id,
          description: `Login blocked by IP allowlist from ${meta.ip}`,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        })
        throw new ForbiddenException('Access from your IP address is not allowed by this workspace’s security policy.')
      }
    }

    // Fetch org memberships for workspace switcher (ClickUp-style)
    const orgMemberships = await this.db
      .select({ org: organizations, role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, user.id))

    const resolvedFlags = await this.featureFlagsService.resolveForUser({
      userId: user.id,
      workspaceId: primaryWorkspaceId ?? '',
      role: user.role,
    })

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      workspaceId: primaryWorkspaceId,
      flags: resolvedFlags.flags,
    })

    // Session lifetime is driven by the workspace policy (idle/inactivity
    // timeout): each refresh rotates the token and re-extends the window, so a
    // session that goes unused longer than this expires and forces re-login.
    const ttlMinutes = settings.sessionTimeoutMinutes
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh', jti: randomUUID() },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: `${ttlMinutes}m`,
      },
    )

    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)

    await this.db.insert(sessions).values({
      userId: user.id,
      refreshToken,
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
      expiresAt,
    })

    // Concurrent-session cap: revoke the oldest sessions beyond the limit.
    if (settings.maxConcurrentSessions > 0) {
      await this.enforceSessionCap(user.id, settings.maxConcurrentSessions)
    }

    await this.security.logAuditEvent({
      workspaceId: primaryWorkspaceId ?? undefined,
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      description: `Signed in as ${user.email}`,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    })

    const { passwordHash: _discard, ...safeUser } = user
    return {
      accessToken,
      refreshToken,
      user: safeUser,
      workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })),
      organizations: orgMemberships.map((m) => ({ ...m.org, role: m.role })),
    }
  }

  async issueSessionForUserId(userId: string, meta: SessionMeta = {}) {
    const user = await this.usersService.findById(userId)
    if (!user) throw new UnauthorizedException('User not found')
    return this.login(user, meta)
  }

  /** Revoke the oldest active sessions beyond `max` (newest are kept). */
  private async enforceSessionCap(userId: string, max: number) {
    const active = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.isRevoked, false)))
      .orderBy(desc(sessions.createdAt))
    for (const stale of active.slice(max)) {
      await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, stale.id))
    }
  }

  /** Apply the password policy (strength + breach check) to a new password. */
  private async enforcePasswordPolicy(
    password: string,
    policy: { requireStrong: boolean; blockBreached: boolean },
  ) {
    if (policy.requireStrong) {
      const problem = this.securitySettings.passwordStrengthProblem(password)
      if (problem) throw new BadRequestException(problem)
    }
    if (policy.blockBreached && (await this.securitySettings.isPasswordBreached(password))) {
      throw new BadRequestException('This password has appeared in a known data breach. Please choose a different one.')
    }
  }

  /**
   * POST /auth/signup — Atomic org + workspace creation.
   * All rows (user, org, org_member, workspace, workspace_member, invitations)
   * are inserted in a single DB transaction; any failure rolls back everything.
   */
  async signUp(dto: SignupDto, meta: SessionMeta = {}) {
    const existing = await this.usersService.findByEmail(dto.email.toLowerCase())
    if (existing) throw new ConflictException('An account with this email already exists')

    // New accounts must meet the strong-password baseline. (Breach checking is
    // a per-workspace opt-in; there is no workspace yet at sign-up time.)
    await this.enforcePasswordPolicy(dto.password, { requireStrong: true, blockBreached: false })

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:5173')

    const result = await this.db.transaction(async (tx) => {
      // 1. Create user
      const [user] = await tx
        .insert(users)
        .values({
          email: dto.email.toLowerCase(),
          displayName: dto.fullName,
          passwordHash: hashSync(dto.password, 12),
          emailVerified: false,
        })
        .returning()

      // 2. Create organization
      const baseSlug = slugify(dto.organizationSlug ?? dto.organizationName)
      let orgSlug = baseSlug
      let attempt = 0
      while (true) {
        const [hit] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.slug, orgSlug))
          .limit(1)
        if (!hit) break
        attempt++
        orgSlug = `${baseSlug}-${attempt}`
        if (attempt > 50) orgSlug = `${baseSlug}-${Date.now()}`
      }

      const [org] = await tx
        .insert(organizations)
        .values({ name: dto.organizationName, slug: orgSlug })
        .returning()

      // 3. Make user the org owner
      await tx.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: 'owner',
      })

      // 4. Create default workspace (same name as org)
      const wsSlug = orgSlug
      const [workspace] = await tx
        .insert(workspaces)
        .values({ organizationId: org.id, name: dto.organizationName, slug: wsSlug })
        .returning()

      // 5. Make user workspace_admin
      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: 'workspace_admin',
      })

      // 6. Create initial invitations
      const inviteTokens: Array<{ email: string; token: string; claimUrl: string }> = []
      if (dto.invites && dto.invites.length > 0) {
        for (const inv of dto.invites) {
          const token = randomBytes(32).toString('base64url')
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          await tx.insert(invitations).values({
            organizationId: org.id,
            email: inv.email.toLowerCase(),
            orgRole: inv.orgRole === 'admin' ? 'admin' : 'member',
            workspaceMemberships: [
              {
                workspaceId: workspace.id,
                role: inv.workspaceRole ?? 'member',
              },
            ],
            invitedByUserId: user.id,
            token,
            expiresAt,
          }).onConflictDoNothing()

          const claimUrl = `${appUrl}/accept-invite?token=${token}`
          inviteTokens.push({ email: inv.email.toLowerCase(), token, claimUrl })
        }
      }

      return { user, org, workspace, inviteTokens }
    })

    // Log claim URLs in dev (when email service not configured)
    for (const inv of result.inviteTokens) {
      this.logger.log(`[DEV] Invitation for ${inv.email}: ${inv.claimUrl}`)
    }

    return this.login(result.user, meta)
  }

  /** @deprecated Use signUp for new accounts */
  async register(dto: RegisterDto, meta: SessionMeta = {}) {
    const existing = await this.usersService.findByEmail(dto.email)
    if (existing) throw new ConflictException('Email already in use')

    await this.enforcePasswordPolicy(dto.password, { requireStrong: true, blockBreached: false })

    const user = await this.usersService.create({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash: hashSync(dto.password, 12),
    })

    await this.workspacesService.createPersonalWorkspace(user.id, user.displayName)
    return this.login(user, meta)
  }

  async refresh(token: string, meta: SessionMeta = {}) {
    let payload: any
    try {
      payload = this.jwtService.verify(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }

    const [session] = await this.db.select().from(sessions).where(eq(sessions.refreshToken, token))
    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired')
    }

    const user = await this.usersService.findById(payload.sub)
    if (!user) throw new UnauthorizedException()

    await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, session.id))
    return this.login(user, meta)
  }

  async logout(refreshToken: string) {
    await this.db
      .update(sessions)
      .set({ isRevoked: true })
      .where(eq(sessions.refreshToken, refreshToken))
  }

  async listSessions(userId: string, currentRefreshToken?: string | null) {
    const rows = await this.db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        isRevoked: sessions.isRevoked,
        expiresAt: sessions.expiresAt,
        createdAt: sessions.createdAt,
        refreshToken: sessions.refreshToken,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))

    return rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((row) => ({
        id: row.id,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        isRevoked: row.isRevoked,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        isCurrent: Boolean(currentRefreshToken) && row.refreshToken === currentRefreshToken,
      }))
  }

  async revokeSession(userId: string, sessionId: string) {
    const [session] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1)
    if (!session) throw new UnauthorizedException('Session not found')
    await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, session.id))
    return { revoked: true }
  }

  async revokeOtherSessions(userId: string, currentRefreshToken?: string | null) {
    const userSessions = await this.db
      .select({ id: sessions.id, refreshToken: sessions.refreshToken })
      .from(sessions)
      .where(eq(sessions.userId, userId))
    const idsToRevoke = userSessions
      .filter((s) => !currentRefreshToken || s.refreshToken !== currentRefreshToken)
      .map((s) => s.id)
    for (const id of idsToRevoke) {
      await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, id))
    }
    return { revoked: idsToRevoke.length }
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.toLowerCase().trim()
    const user = await this.usersService.findByEmail(normalizedEmail)
    // Do not reveal whether an account exists.
    if (!user) return { ok: true }

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await this.db.insert(passwordResets).values({
      userId: user.id,
      token,
      expiresAt,
    })

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:5173')
    const resetUrl = `${appUrl}/login?token=${token}`
    if ((this.config.get<string>('NODE_ENV') ?? 'development') !== 'production') {
      this.logger.log(`[DEV] Password reset for ${user.email}: ${resetUrl}`)
    }
    await this.emailService.sendPasswordResetEmail({
      to: user.email,
      recipientName: user.displayName,
      resetUrl,
      expiresAt,
    })
    return { ok: true }
  }

  async resetPassword(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new UnauthorizedException('Password must be at least 8 characters')
    }

    const [row] = await this.db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.token, token), isNull(passwordResets.usedAt)))
      .limit(1)

    if (!row || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset link is invalid or expired')
    }

    // Enforce the resetting user's workspace password policy.
    const { settings } = await this.securitySettings.getEffectiveForUser(row.userId)
    await this.enforcePasswordPolicy(newPassword, {
      requireStrong: settings.requireStrongPasswords,
      blockBreached: settings.blockBreachedPasswords,
    })

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: hashSync(newPassword, 12), updatedAt: new Date() })
        .where(eq(users.id, row.userId))

      await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.id, row.id))

      // Revoke all active sessions for security after password change.
      await tx.update(sessions).set({ isRevoked: true }).where(eq(sessions.userId, row.userId))
    })

    return { ok: true }
  }
}
