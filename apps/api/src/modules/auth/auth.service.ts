import { Injectable, UnauthorizedException, ConflictException, Inject, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { randomUUID, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { compareSync, hashSync } from 'bcryptjs'
import { users, sessions, organizations, organizationMembers, workspaces, workspaceMembers, invitations, passwordResets } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { UsersService } from '../users/users.service'
import { WorkspacesService } from '../workspaces/workspaces.service'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { EmailService } from '../email/email.service'
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
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email)
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials')
    if (!compareSync(password, user.passwordHash)) throw new UnauthorizedException('Invalid credentials')
    if (!user.isActive) throw new UnauthorizedException('Account is disabled')
    return user
  }

  async login(user: typeof users.$inferSelect, meta: SessionMeta = {}) {
    const memberships = await this.workspacesService.findByMember(user.id)
    const primaryWorkspaceId = memberships[0]?.workspace.id ?? null

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

    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh', jti: randomUUID() },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      },
    )

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await this.db.insert(sessions).values({
      userId: user.id,
      refreshToken,
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
      expiresAt,
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

  /**
   * POST /auth/signup — Atomic org + workspace creation.
   * All rows (user, org, org_member, workspace, workspace_member, invitations)
   * are inserted in a single DB transaction; any failure rolls back everything.
   */
  async signUp(dto: SignupDto, meta: SessionMeta = {}) {
    const existing = await this.usersService.findByEmail(dto.email.toLowerCase())
    if (existing) throw new ConflictException('An account with this email already exists')

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
