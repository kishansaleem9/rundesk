import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException, GoneException } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { organizations, invitations, organizationMembers, workspaceMembers, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { EmailService } from '../email/email.service'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private emailService: EmailService,
    private config: ConfigService,
  ) {}

  private claimUrlForToken(token: string) {
    const appUrl = this.config.get('APP_URL', 'http://localhost:5173')
    return `${appUrl}/accept-invite?token=${token}`
  }

  async listPending(organizationId: string) {
    return this.db
      .select()
      .from(invitations)
      .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, 'pending')))
  }

  async create(organizationId: string, invitedById: string, dto: { email: string, orgRole?: string, workspaceMemberships?: any[] }) {
    const org = await this.db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
    if (org.length === 0) throw new NotFoundException('Organization not found')

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const [invite] = await this.db
      .insert(invitations)
      .values({
        organizationId,
        email: dto.email.toLowerCase(),
        orgRole: (dto.orgRole || 'member') as any,
        workspaceMemberships: dto.workspaceMemberships || [],
        invitedByUserId: invitedById,
        token,
        expiresAt,
      })
      .returning()

    const inviter = await this.db.select().from(users).where(eq(users.id, invitedById)).limit(1)
    const claimUrl = this.claimUrlForToken(token)

    await this.emailService.sendInvitationEmail({
      to: dto.email,
      inviter: inviter[0]?.displayName || 'A teammate',
      orgName: org[0].name,
      claimUrl,
      expiresAt,
    })

    return invite
  }

  async getClaimUrlById(invitationId: string) {
    const [invite] = await this.db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1)
    if (!invite) throw new NotFoundException('Invitation not found')
    return { claimUrl: this.claimUrlForToken(invite.token) }
  }

  async resend(invitationId: string) {
    const [row] = await this.db
      .select({
        invite: invitations,
        org: organizations,
        inviter: users,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .innerJoin(users, eq(users.id, invitations.invitedByUserId))
      .where(eq(invitations.id, invitationId))
      .limit(1)

    if (!row) throw new NotFoundException('Invitation not found')
    if (row.invite.status !== 'pending') throw new GoneException('Invitation is not pending')
    if (row.invite.expiresAt < new Date()) throw new GoneException('Invitation expired')

    const claimUrl = this.claimUrlForToken(row.invite.token)
    await this.emailService.sendInvitationEmail({
      to: row.invite.email,
      inviter: row.inviter.displayName || 'A teammate',
      orgName: row.org.name,
      claimUrl,
      expiresAt: row.invite.expiresAt,
    })

    return { ok: true }
  }

  async listPendingForWorkspace(workspaceId: string) {
    const pending = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.status, 'pending'))

    return pending
      .filter((invite) =>
        Array.isArray(invite.workspaceMemberships) &&
        invite.workspaceMemberships.some((ws: any) => ws.workspaceId === workspaceId),
      )
      .map((invite) => {
        const workspaceMembership = Array.isArray(invite.workspaceMemberships)
          ? invite.workspaceMemberships.find((ws: any) => ws.workspaceId === workspaceId)
          : undefined
        return {
          id: invite.id,
          email: invite.email,
          role: workspaceMembership?.role ?? 'member',
          status: invite.status,
          expiresAt: invite.expiresAt,
        }
      })
  }

  async revoke(invitationId: string) {
    await this.db
      .update(invitations)
      .set({ status: 'revoked' })
      .where(eq(invitations.id, invitationId))
    return { ok: true }
  }

  async preview(token: string) {
    const [invite] = await this.db
      .select({
        invite: invitations,
        org: organizations,
        inviter: users,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .innerJoin(users, eq(users.id, invitations.invitedByUserId))
      .where(eq(invitations.token, token))
      .limit(1)

    if (!invite) throw new NotFoundException('Invitation not found')
    if (invite.invite.status !== 'pending') throw new GoneException('This invitation has already been used or revoked')
    if (invite.invite.expiresAt < new Date()) throw new GoneException('This invitation has expired')

    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.invite.email))
      .limit(1)

    return {
      orgName: invite.org.name,
      inviterName: invite.inviter.displayName,
      email: invite.invite.email,
      expiresAt: invite.invite.expiresAt,
      requiresAccountCreation: !existingUser,
    }
  }

  async claim(dto: { token: string; password?: string; fullName?: string }, currentUserId?: string) {
    const [invite] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.token, dto.token))
      .limit(1)

    if (!invite) throw new NotFoundException('Invitation not found')
    if (invite.status !== 'pending') throw new GoneException('Invitation already used')
    if (invite.expiresAt < new Date()) throw new GoneException('Invitation expired')

    return this.db.transaction(async (tx) => {
      let userId = currentUserId

      if (!userId) {
        // Find or create user
        const [existing] = await tx.select().from(users).where(eq(users.email, invite.email)).limit(1)
        if (existing) {
          // If user exists but not logged in, we should have blocked in controller or we require login
          // For now, let's assume if they provide password we might be creating.
          // But usually, if they exist, we require login.
          throw new ForbiddenException('Account already exists. Please log in first.')
        }

        if (!dto.password || !dto.fullName) {
          throw new ConflictException('Password and full name required for new account')
        }

        const { hashSync } = await import('bcryptjs')
        const [newUser] = await tx
          .insert(users)
          .values({
            email: invite.email,
            displayName: dto.fullName,
            passwordHash: hashSync(dto.password, 12),
            emailVerified: true,
          })
          .returning()
        userId = newUser.id
      } else {
        const [currentUser] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
        if (!currentUser) throw new ForbiddenException('Authenticated user not found')
        if (currentUser.email.toLowerCase() !== invite.email.toLowerCase()) {
          throw new ForbiddenException('This invitation belongs to a different email address')
        }
      }

      // Create org membership
      await tx
        .insert(organizationMembers)
        .values({
          organizationId: invite.organizationId,
          userId: userId!,
          role: invite.orgRole,
        })
        .onConflictDoNothing()

      // Create workspace memberships
      if (invite.workspaceMemberships && Array.isArray(invite.workspaceMemberships)) {
        for (const ws of invite.workspaceMemberships) {
          await tx
            .insert(workspaceMembers)
            .values({
              workspaceId: ws.workspaceId,
              userId: userId!,
              role: ws.role,
            })
            .onConflictDoNothing()
        }
      }

      // Mark invite accepted
      await tx
        .update(invitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
          acceptedByUserId: userId!,
        })
        .where(eq(invitations.id, invite.id))

      return { userId }
    })
  }
}
