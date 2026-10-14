import { ASSIGNABLE_WORKSPACE_ROLES } from '../../common/permissions/workspace-roles'
import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException, GoneException, BadRequestException } from '@nestjs/common'
import { eq, and, inArray } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { organizations, invitations, organizationMembers, workspaceMembers, users, workspaces, importPendingAssignees, taskAssignees } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { passwords } from '../../common/security/password-hash'
import { sameEmail } from '../../common/sql/same-email'
import { EmailService } from '../email/email.service'
import { ConfigService } from '@nestjs/config'
import { WorkspaceSecuritySettingsService } from '../security/workspace-security-settings.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { PlansService } from '../plans/plans.service'
import { IMPORT_ACCESS } from '../integrations/clickup-import/import-access'

/**
 * WHAT AN INVITATION MAY GRANT.
 *
 * Workspace roles come from the account-role enum, so without a list here an
 * invitation could name `super_admin` — an account role, never a workspace
 * one. And an organisation is handed over, not invited into, so `owner` is not
 * on the organisation list.
 */
export const INVITE_WORKSPACE_ROLES = ASSIGNABLE_WORKSPACE_ROLES
export type InviteWorkspaceRole = (typeof INVITE_WORKSPACE_ROLES)[number]
export const INVITE_ORG_ROLES = ['admin', 'billing', 'member'] as const
type InviteOrgRole = (typeof INVITE_ORG_ROLES)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private emailService: EmailService,
    private config: ConfigService,
    private securitySettings: WorkspaceSecuritySettingsService,
    private webhooks: WebhooksService,
    private plans: PlansService,
  ) {}

  private claimUrlForToken(token: string) {
    const appUrl = this.config.get('APP_URL', 'http://localhost:5173')
    return `${appUrl}/accept-invite?token=${token}`
  }

  /**
   * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
   * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
   * a downed webhook can never break invite creation/acceptance.
   */
  private async fireWebhook(workspaceId: string, event: string, payload: Record<string, unknown>) {
    try {
      await this.webhooks.fire(workspaceId, event, payload)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[webhooks.fire] ${event} failed:`, e)
    }
  }

  /** Workspace ids an invite grants membership to (member.* events are workspace-keyed). */
  private inviteWorkspaces(memberships: unknown): Array<{ workspaceId: string; role?: string }> {
    if (!Array.isArray(memberships)) return []
    return memberships
      .filter((ws): ws is { workspaceId: string; role?: string } =>
        Boolean(ws && typeof ws === 'object' && typeof (ws as any).workspaceId === 'string'),
      )
      .map((ws) => ({ workspaceId: ws.workspaceId, role: (ws as any).role }))
  }

  async listPending(organizationId: string) {
    return this.db
      .select()
      .from(invitations)
      .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, 'pending')))
  }

  /**
   * THE WORKSPACE GRANTS AN INVITATION MAY CARRY — each workspace one of THIS
   * organisation's, each role one an invitation can grant, none named twice.
   *
   * Nothing checked the workspaces. An organisation's owner is an organisation
   * admin, so `POST /invitations/:org/bulk` — reachable by anybody who signs up
   * — made an invitation naming another organisation's workspace, with any
   * role, and claiming it inserted the membership. Refused here, before
   * anything is written or sent.
   */
  private async checkedMemberships(organizationId: string, memberships: unknown): Promise<Array<{ workspaceId: string; role: InviteWorkspaceRole }>> {
    if (memberships == null) return []
    if (!Array.isArray(memberships)) throw new BadRequestException('workspaceMemberships must be a list')
    const wanted = memberships.map((m: any) => ({ workspaceId: m?.workspaceId, role: m?.role ?? 'member' }))
    for (const m of wanted) {
      if (typeof m.workspaceId !== 'string' || !UUID.test(m.workspaceId)) {
        throw new BadRequestException('Each workspace an invitation grants needs a workspaceId')
      }
      if (!(INVITE_WORKSPACE_ROLES as readonly string[]).includes(m.role)) {
        throw new BadRequestException(`An invitation cannot grant the workspace role "${String(m.role)}"`)
      }
    }
    const ids = [...new Set(wanted.map((m) => m.workspaceId as string))]
    if (ids.length !== wanted.length) throw new BadRequestException('An invitation names the same workspace twice')
    const found = ids.length
      ? await this.db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(and(inArray(workspaces.id, ids), eq(workspaces.organizationId, organizationId)))
      : []
    if (found.length !== ids.length) {
      throw new BadRequestException('Every workspace an invitation grants must belong to its organization')
    }
    return wanted as Array<{ workspaceId: string; role: InviteWorkspaceRole }>
  }

  /**
   * The same rule at CLAIM time, for invitations written before it existed: a
   * grant outside the invitation's organisation, or of a role an invitation
   * cannot grant, is dropped rather than inserted.
   */
  private async grantableAtClaim(
    tx: Pick<Db, 'select'>,
    organizationId: string,
    memberships: unknown,
  ): Promise<Array<{ workspaceId: string; role: InviteWorkspaceRole }>> {
    const wanted = this.inviteWorkspaces(memberships).filter((m) =>
      (INVITE_WORKSPACE_ROLES as readonly string[]).includes(m.role ?? 'member'),
    )
    if (wanted.length === 0) return []
    const inOrg = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(inArray(workspaces.id, wanted.map((m) => m.workspaceId)), eq(workspaces.organizationId, organizationId)))
    const ok = new Set(inOrg.map((w) => w.id))
    return wanted
      .filter((m) => ok.has(m.workspaceId))
      .map((m) => ({ workspaceId: m.workspaceId, role: (m.role ?? 'member') as InviteWorkspaceRole }))
  }

  async create(organizationId: string, invitedById: string, dto: { email: string, orgRole?: string, workspaceMemberships?: any[] }) {
    const org = await this.db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
    if (org.length === 0) throw new NotFoundException('Organization not found')

    const orgRole = dto.orgRole ?? 'member'
    if (!(INVITE_ORG_ROLES as readonly string[]).includes(orgRole)) {
      throw new BadRequestException(`An invitation cannot make someone "${String(orgRole)}" of an organization`)
    }
    const memberships = await this.checkedMemberships(organizationId, dto.workspaceMemberships)

    // Plan §14.1: an invite that grants workspace membership counts against the
    // target workspace's plan member cap. Block before sending the invite when a
    // target is already at capacity. No-op for enterprise (unlimited) workspaces.
    for (const ws of memberships) {
      await this.plans.assertCanAddMembers(ws.workspaceId)
    }

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const [invite] = await this.db
      .insert(invitations)
      .values({
        organizationId,
        email: dto.email.toLowerCase(),
        orgRole: orgRole as InviteOrgRole,
        workspaceMemberships: memberships,
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

    // Fire member.invited per target workspace (best effort, non-blocking).
    for (const ws of this.inviteWorkspaces(invite.workspaceMemberships)) {
      void this.fireWebhook(ws.workspaceId, 'member.invited', {
        workspaceId: ws.workspaceId,
        email: invite.email,
        role: ws.role ?? null,
        invitationId: invite.id,
        actorId: invitedById,
      })
    }

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

  /**
   * The person invited says no — `[00:18]`.
   *
   * By token and unauthenticated on purpose: somebody declining an invitation
   * is precisely somebody who is not going to make an account first, and a
   * Decline that demanded a login would be a Decline nobody could press.
   *
   * Idempotent. A second press of a link somebody already declined is a person
   * making sure, not an error, and it must not read as one.
   */
  async decline(token: string) {
    const [invite] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1)

    if (!invite) throw new NotFoundException('Invitation not found')
    if (invite.status === 'declined') return { ok: true, status: 'declined' as const }
    // Anything already resolved stays as it is: declining an invitation that
    // was accepted would silently undo a membership, and declining one the
    // sender revoked would overwrite their record of why it ended.
    if (invite.status !== 'pending') {
      throw new GoneException('This invitation has already been used or revoked')
    }

    await this.db
      .update(invitations)
      .set({ status: 'declined' })
      .where(eq(invitations.id, invite.id))

    return { ok: true, status: 'declined' as const }
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

    // In any case (`found-30-sep/sign-in-reads-the-email-as-typed`): an
    // account stored with capitals still has an account.
    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sameEmail(users.email, invite.invite.email))
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

    const grants = await this.grantableAtClaim(this.db, invite.organizationId, invite.workspaceMemberships)

    const result = await this.db.transaction(async (tx) => {
      let userId = currentUserId

      if (!userId) {
        // Find or create user
        // In any case, or a claim made a second account for an email stored with capitals.
        const [existing] = await tx.select().from(users).where(sameEmail(users.email, invite.email)).limit(1)
        if (existing) {
          // If user exists but not logged in, we should have blocked in controller or we require login
          // For now, let's assume if they provide password we might be creating.
          // But usually, if they exist, we require login.
          throw new ForbiddenException('Account already exists. Please log in first.')
        }

        if (!dto.password || !dto.fullName) {
          throw new ConflictException('Password and full name required for new account')
        }

        // New accounts created via an invite must meet the same strong-password
        // baseline enforced at /auth/signup.
        const strengthProblem = this.securitySettings.passwordStrengthProblem(dto.password)
        if (strengthProblem) throw new BadRequestException(strengthProblem)

        // On a worker (`found-30-sep/password-hash-holds-the-event-loop`), not the API's one thread.
        const passwordHash = await passwords.hash(dto.password)
        const [newUser] = await tx
          .insert(users)
          .values({
            email: invite.email,
            displayName: dto.fullName,
            passwordHash,
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

      // Create org membership. An `owner` on an invitation written before the
      // role list existed joins as a member: ownership is handed over, not claimed.
      await tx
        .insert(organizationMembers)
        .values({
          organizationId: invite.organizationId,
          userId: userId!,
          role: (INVITE_ORG_ROLES as readonly string[]).includes(invite.orgRole) ? invite.orgRole : 'member',
        })
        .onConflictDoNothing()

      // Create workspace memberships — only the ones this organisation may grant.
      for (const ws of grants) {
        await tx
          .insert(workspaceMembers)
          .values({
            workspaceId: ws.workspaceId,
            userId: userId!,
            role: ws.role,
          })
          .onConflictDoNothing()
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

    // The tasks an import held for them, theirs now that they are a member — after the commit, as the
    // assignee rule reads the membership just made.
    for (const ws of grants) await this.takePendingAssignees(ws.workspaceId, invite.email, result.userId!)

    // Fire member.joined per workspace the invite granted (best effort). The
    // joining user is the actor. Runs after the tx commits so the membership
    // is durable before we advertise it.
    for (const ws of grants) {
      void this.fireWebhook(ws.workspaceId, 'member.joined', {
        workspaceId: ws.workspaceId,
        userId: result.userId,
        email: invite.email,
        role: ws.role ?? null,
        invitationId: invite.id,
        actorId: result.userId,
      })
    }

    return result
  }

  /**
   * THE TASKS AN IMPORT HELD FOR SOMEBODY IT INVITED (`found-14-oct/clickup-workspace-import-and-people-unbuilt`),
   * made theirs as they join: each where the assignee route would put them on it now (a guest only
   * on what is shared with them), and none of them held any longer either way.
   */
  async takePendingAssignees(workspaceId: string, email: string, userId: string) {
    const held = await this.db
      .select({ taskId: importPendingAssignees.taskId })
      .from(importPendingAssignees)
      .where(and(eq(importPendingAssignees.workspaceId, workspaceId), eq(importPendingAssignees.email, email.toLowerCase())))
    let assigned = 0
    for (const h of held) {
      if (!(await IMPORT_ACCESS.mayBeAssigned(this.db, { workspaceId, taskId: h.taskId, userId }))) continue
      await this.db.insert(taskAssignees).values({ taskId: h.taskId, userId }).onConflictDoNothing()
      assigned++
    }
    await this.db
      .delete(importPendingAssignees)
      .where(and(eq(importPendingAssignees.workspaceId, workspaceId), eq(importPendingAssignees.email, email.toLowerCase())))
    return { held: held.length, assigned }
  }
}
