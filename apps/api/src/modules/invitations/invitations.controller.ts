import { Controller, Post, Get, Body, Param, UseGuards, Delete, Query, Req, Inject, NotFoundException, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OrganizationAdminGuard } from '../auth/guards/organization-admin.guard'
import { InvitationsService } from './invitations.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthService } from '../auth/auth.service'
import { DB_TOKEN } from '../../common/database/database.module'
import { JwtService } from '@nestjs/jwt'

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    @Inject(DB_TOKEN) private readonly db: any, 
  ) {}

  private async assertInviteWorkspaceAdminOrManager(invitationId: string, userId: string) {
    const { invitations, workspaceMembers } = await import('@rundesk/db')
    const { eq, and, inArray } = await import('drizzle-orm')

    const [inv] = await this.db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1)
    if (!inv) throw new NotFoundException('Invitation not found')

    const workspaceIds = Array.isArray(inv.workspaceMemberships)
      ? inv.workspaceMemberships.map((m: any) => m.workspaceId).filter(Boolean)
      : []
    if (workspaceIds.length === 0) throw new ForbiddenException('No workspace context on invitation')

    const [membership] = await this.db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          inArray(workspaceMembers.workspaceId, workspaceIds),
          eq(workspaceMembers.userId, userId),
          inArray(workspaceMembers.role, ['workspace_admin', 'manager']),
        ),
      )
      .limit(1)

    if (!membership) throw new ForbiddenException('Workspace admin or manager access required')
    return inv
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
    const { and, eq, inArray } = await import('drizzle-orm')
    const [membership] = await this.db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, body.workspaceId),
          eq(workspaceMembers.userId, user.id),
          inArray(workspaceMembers.role, ['workspace_admin', 'manager']),
        ),
      )
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace admin or manager access required')

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

    return this.invitationsService.listPendingForWorkspace(workspaceId)
  }


  @Post('decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline an invitation — the recipient says no' })
  async decline(@Body() dto: { token: string }) {
    return this.invitationsService.decline(dto?.token)
  }

  @Get('preview')
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
  @ApiOperation({ summary: 'Revoke an invitation (workspace admin/manager only)' })
  async revoke(@Param('invitationId') id: string, @Req() req: any) {
    const reqUserId = req.user?.id as string | undefined
    if (!reqUserId) throw new ForbiddenException('Not authenticated')
    await this.assertInviteWorkspaceAdminOrManager(id, reqUserId)
    return this.invitationsService.revoke(id)
  }

  @Get(':invitationId/link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get invitation claim link (workspace admin/manager only)' })
  async getLink(@Param('invitationId') id: string, @Req() req: any) {
    const reqUserId = req.user?.id as string | undefined
    if (!reqUserId) throw new ForbiddenException('Not authenticated')
    await this.assertInviteWorkspaceAdminOrManager(id, reqUserId)
    return this.invitationsService.getClaimUrlById(id)
  }

  @Post(':invitationId/resend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend invitation email (workspace admin/manager only)' })
  async resend(@Param('invitationId') id: string, @Req() req: any) {
    const reqUserId = req.user?.id as string | undefined
    if (!reqUserId) throw new ForbiddenException('Not authenticated')
    await this.assertInviteWorkspaceAdminOrManager(id, reqUserId)
    return this.invitationsService.resend(id)
  }
}
