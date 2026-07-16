import { Controller, Get, Patch, Body, Param, Query, UseGuards, Delete, Post, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard'
import { OrganizationAdminGuard } from '../auth/guards/organization-admin.guard'
import { OrganizationsService } from './organizations.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations (super admin)' })
  async list(@CurrentUser() user: CurrentUserPayload) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.organizationsService.listAll()
  }

  // NOTE: this static route MUST be declared before `:organizationId` below, or
  // Nest/Express would match `/organizations/users` against the param route.
  @Get('users')
  @ApiOperation({ summary: 'Global user directory — all platform users (super admin)' })
  async listDirectory(
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (user.role !== 'super_admin') throw new ForbiddenException('Super admin access required')
    return this.organizationsService.listDirectory({
      q,
      limit: limit != null ? Number(limit) : undefined,
      offset: offset != null ? Number(offset) : undefined,
    })
  }

  @Get(':organizationId')
  @UseGuards(OrganizationMemberGuard)
  @ApiOperation({ summary: 'Get organization metadata' })
  async get(@Param('organizationId') id: string) {
    return this.organizationsService.findById(id)
  }

  @Patch(':organizationId')
  @UseGuards(OrganizationAdminGuard)
  @ApiOperation({ summary: 'Update organization name or logo' })
  async update(
    @Param('organizationId') id: string,
    @Body() body: { name?: string; logoUrl?: string | null },
  ) {
    return this.organizationsService.update(id, body)
  }

  @Get(':organizationId/members')
  @UseGuards(OrganizationMemberGuard)
  @ApiOperation({ summary: 'List organization members' })
  async listMembers(@Param('organizationId') id: string) {
    return this.organizationsService.listMembers(id)
  }

  @Get(':organizationId/workspaces')
  @UseGuards(OrganizationAdminGuard)
  @ApiOperation({ summary: 'List all workspaces in the organization (admin view)' })
  async listWorkspaces(@Param('organizationId') id: string) {
    return this.organizationsService.listWorkspaces(id)
  }

  @Post(':organizationId/members/:userId/role')
  @UseGuards(OrganizationAdminGuard)
  @ApiOperation({ summary: 'Update a member role' })
  async updateMemberRole(
    @Param('organizationId') orgId: string,
    @Param('userId') userId: string,
    @Body() body: { role: 'owner' | 'admin' | 'billing' | 'member' },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.organizationsService.updateMemberRole(orgId, userId, body.role, user.id)
  }

  @Delete(':organizationId/members/:userId')
  @UseGuards(OrganizationAdminGuard)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  async removeMember(@Param('organizationId') orgId: string, @Param('userId') userId: string) {
    return this.organizationsService.removeMember(orgId, userId)
  }

  @Post(':organizationId/leave')
  @UseGuards(OrganizationMemberGuard)
  @ApiOperation({ summary: 'Self-remove from organization' })
  async leave(@Param('organizationId') orgId: string, @CurrentUser() user: any) {
    return this.organizationsService.leaveOrganization(orgId, user.id)
  }
}
