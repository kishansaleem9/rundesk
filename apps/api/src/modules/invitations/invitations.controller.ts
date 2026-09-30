import { roleRank } from '../../common/permissions/workspace-roles'
import { Controller, Post, Get, Body, Param, UseGuards, Delete, Query, Req, Inject, NotFoundException, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OrganizationAdminGuard } from '../auth/guards/organization-admin.guard'
import { InvitationsService } from './invitations.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthService } from '../auth/auth.service'
import { DB_TOKEN } from '../../common/database/database.module'
import { JwtService } from '@nestjs/jwt'
import { CustomRolesService } from '../custom-roles/custom-roles.service'
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { AUTH_ROUTE_LIMITS } from '../../common/guards/auth-route-limits'

@ApiTags('invitations')
@Controller('invitations')
// The invitee's three routes answer anybody holding a link, so each is limited
// per address (`found-30-sep/register-unthrottled`): opening the link a page's
// budget, accepting or declining it sign-up's. On the class, as `AuthController`
// has it, so a refusal comes before the handler reads the token; the routes
// without `@RateLimit` (every one that needs a session) are not counted.
@UseGuards(RateLimitGuard)
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    @Inject(DB_TOKEN) private readonly db: any, 
    private readonly roles: CustomRolesService,
  ) {}

  /*
   * INVITING ASKS `members.invite` (`role-editor-offers-unenforced-permissions`),
   * as adding a member does: a manager holds it by default, and anyone an admin
   * grants it. This asked the manager role list instead, so a member granted
   * the key could neither invite nor handle an invitation.
   */

  /** Whether `user` holds `members.invite` in `workspaceId` (a platform admin always does). */
  private async mayInvite(workspaceId: string, user: { id: string; role?: string | null }): Promise<boolean> {
    return user.role === 'super_admin' || this.roles.hasPermission(workspaceId, user.id, 'members.invite')
  }

  /** The invitation, when `user` may invite into one of the workspaces it grants. */
  private async assertMayHandleInvitation(invitationId: string, user: { id: string; role?: string | null }) {
    const { invitations } = await import('@rundesk/db')
    const { eq } = await import('drizzle-orm')

    const [inv] = await this.db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1)
    if (!inv) throw new NotFoundException('Invitation not found')

    const workspaceIds: string[] = Array.isArray(inv.workspaceMemberships)
      ? inv.workspaceMemberships.map((m: any) => m.workspaceId).filter(Boolean)
      : []
    if (workspaceIds.length === 0) throw new ForbiddenException('No workspace context on invitation')

    for (const workspaceId of workspaceIds) {
      if (await this.mayInvite(workspaceId, user)) return inv
    }
    throw new ForbiddenException('Missing required permission: members.invite')
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a singular invitation for a workspace' })
  async createSingular(
    @CurrentUser() user: any,
    @Body() body: { email: string; workspaceId: string; role: string },
  ) {
    const { workspaceMembers } = await import('@rundesk/db')
    const { and, eq } = await import('drizzle-orm')
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.userId, user.id)))
      .limit(1)
    if (!membership && user.role !== 'super_admin') throw new ForbiddenException('Workspace membership required')
    if (!(await this.mayInvite(body.workspaceId, user))) {
      throw new ForbiddenException('Missing required permission: members.invite')
    }
    // Nobody invites above their own role, as nobody adds a member above it
    // (`assertWithinRank`): a manager invites no admin, a member granted the
    // key no manager.
    const own = user.role === 'super_admin' ? roleRank('super_admin') : roleRank(membership?.role)
    if (roleRank(body.role ?? 'member') > own) {
      throw new ForbiddenException(`You cannot invite ${String(body.role)}: it is above your own role`)
    }

    // 1. Find organization for this workspace
    // We'll use the raw DB for a quick lookup
    const { workspaces } = await import('@rundesk/db')
    const { eq: eqWorkspace } = await import('drizzle-orm')
    const [ws] = await this.db
      .select()
      .from(workspaces)
      .where(eqWorkspace(workspaces.id, body.workspaceId))
      .limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')

    // 2. Create invitation
    // We map workspace role to org role (defaulting to member)
    // and store the workspace membership in the invitation payload
    return this.invitationsService.create(ws.organizationId, user.id, {
      email: body.email,
      orgRole: 'member',
      workspaceMemberships: [{ workspaceId: body.workspaceId, role: body.role }],
    })
  }

  @Post('claim')
  @RateLimit(AUTH_ROUTE_LIMITS.signUp)
  @ApiOperation({ summary: 'Claim an invitation and create an account if needed' })
  async claim(@Body() dto: { token: string; password?: string; fullName?: string }, @Req() req: any) {
    let currentUserId = req.user?.id as string | undefined
    const authHeader = (req.headers?.authorization as string | undefined) ?? ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    if (!currentUserId && bearerToken) {
      try {
        const payload = this.jwtService.verify(bearerToken)
        currentUserId = payload?.sub as string | undefined
      } catch {
        throw new ForbiddenException('Invalid access token')
      }
    }
    const { userId } = await this.invitationsService.claim(dto, currentUserId)
    return this.authService.issueSessionForUserId(userId, {
      userAgent: req.headers['user-agent'] as string | undefined,
      ip: req.ip,
    })
  }
  @Get('workspace/:workspaceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pending invitations scoped to a workspace' })
  async listWorkspacePending(@Param('workspaceId') workspaceId: string, @Req() req: any) {
    const { workspaceMembers } = await import('@rundesk/db')
    const { and, eq } = await import('drizzle-orm')
    const reqUserId = req.user?.id as string | undefined
    if (!reqUserId) throw new ForbiddenException('Not authenticated')

    const [membership] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, reqUserId)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace membership required')
    /*
     * A GUEST SEES NOBODY'S INVITATION (`found-25-sep/guests-read-pending-invitations`).
     * Members read this list so the assignee and mention pickers can offer the
     * people invited; a guest read it too — measured on lane 5: every pending
     * invitee's email, and the role they were offered — where a guest sees no
     * people list at all (ClickUp; `guest-read-scope`).
     */
    if (membership.role === 'guest') return []

    return this.invitationsService.listPendingForWorkspace(workspaceId)
  }


  @Post('decline')
  @RateLimit(AUTH_ROUTE_LIMITS.signUp)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline an invitation — the recipient says no' })
  async decline(@Body() dto: { token: string }) {
    return this.invitationsService.decline(dto?.token)
  }

  @Get('preview')
  @RateLimit(AUTH_ROUTE_LIMITS.invitationLink)
  @ApiOperation({ summary: 'Preview an invitation before claiming' })
  async preview(@Query('token') token: string) {
    return this.invitationsService.preview(token)
  }

  @Post(':organizationId/bulk')
  @UseGuards(JwtAuthGuard, OrganizationAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk invite members' })
  async bulkInvite(
    @Param('organizationId') orgId: string,
    @CurrentUser() user: any,
    @Body() body: { invites: Array<{ email: string; orgRole?: string; workspaceMemberships?: any[] }> },
  ) {
    const results = []
    for (const inv of body.invites) {
      results.push(await this.invitationsService.create(orgId, user.id, inv))
    }
    return results
  }

  @Get(':organizationId/pending')
  @UseGuards(JwtAuthGuard, OrganizationAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pending invitations' })
  async listPending(@Param('organizationId') orgId: string) {
    return this.invitationsService.listPending(orgId)
  }

  @Delete(':invitationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an invitation (holders of members.invite)' })
  async revoke(@Param('invitationId') id: string, @Req() req: any) {
    const reqUserId = req.user?.id as string | undefined
    if (!reqUserId) throw new ForbiddenException('Not authenticated')
    await this.assertMayHandleInvitation(id, req.user)
    return this.invitationsService.revoke(id)
  }

  @Get(':invitationId/link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get invitation claim link (holders of members.invite)' })
  async getLink(@Param('invitationId') id: string, @Req() req: any) {
    const reqUserId = req.user?.id as string | undefined
    if (!reqUserId) throw new ForbiddenException('Not authenticated')
    await this.assertMayHandleInvitation(id, req.user)
    return this.invitationsService.getClaimUrlById(id)
  }

  @Post(':invitationId/resend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend invitation email (holders of members.invite)' })
  async resend(@Param('invitationId') id: string, @Req() req: any) {
    const reqUserId = req.user?.id as string | undefined
    if (!reqUserId) throw new ForbiddenException('Not authenticated')
    await this.assertMayHandleInvitation(id, req.user)
    return this.invitationsService.resend(id)
  }
}
