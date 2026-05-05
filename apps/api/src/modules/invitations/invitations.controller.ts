import { Controller, Post, Get, Body, Param, UseGuards, Delete, Query, Req, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OrganizationAdminGuard } from '../auth/guards/organization-admin.guard'
import { InvitationsService } from './invitations.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthService } from '../auth/auth.service'
import { DB_TOKEN } from '../../common/database/database.module'

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly authService: AuthService,
    @Inject(DB_TOKEN) private readonly db: any, 
  ) {}

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
    const currentUserId = req.user?.id as string | undefined
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
  @UseGuards(JwtAuthGuard) // Should also check org-admin but need orgId from invite row first
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an invitation' })
  async revoke(@Param('invitationId') id: string) {
    return this.invitationsService.revoke(id)
  }
}
