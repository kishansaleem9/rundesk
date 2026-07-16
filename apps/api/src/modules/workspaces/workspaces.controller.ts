import { Body, Controller, Get, Ip, Param, Patch, Post, Delete, UseGuards, ParseUUIDPipe, ForbiddenException } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { WorkspacesService } from './workspaces.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List workspaces the current user belongs to' })
  async getMyWorkspaces(@CurrentUser() user: any) {
    return this.workspacesService.findByMember(user.id)
  }

  // Declared before ':workspaceId' so the literal path wins over the UUID param.
  @Get('archived')
  @ApiOperation({ summary: 'List archived workspaces the current user belongs to (Plan §13.4)' })
  async getArchivedWorkspaces(@CurrentUser() user: any) {
    return this.workspacesService.listArchivedWorkspaces(user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workspace (Super Admin only, per plan §3.3)' })
  async create(@CurrentUser() user: any, @Body() dto: CreateWorkspaceDto) {
    // The first workspace is provisioned at signup; creating additional
    // workspaces is a Super-Admin-only action (Plan §3.3).
    if (user.role !== 'super_admin') {
      throw new ForbiddenException('Only a Super Admin can create additional workspaces')
    }
    return this.workspacesService.create(user.id, dto)
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Get a workspace by id (must be a member)' })
  async getOne(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.workspacesService.findById(workspaceId)
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceAdminGuard)
  async update(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { name?: string; logoUrl?: string | null; primaryColor?: string | null; accentColor?: string | null; customDomain?: string | null },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.update(workspaceId, body, { id: user.id, email: user.email, ip })
  }

  @Post(':workspaceId/logo/presign')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Presign a direct-to-R2 upload for the workspace logo (Plan §13.5)' })
  async presignLogo(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { contentType: string; sizeBytes?: number },
  ) {
    return this.workspacesService.createLogoUploadUrl(workspaceId, body)
  }

  @Get(':workspaceId/archived-tasks')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'List archived tasks in the workspace (Plan §13.4)' })
  async getArchivedTasks(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.workspacesService.listArchivedTasks(workspaceId)
  }

  @Post(':workspaceId/verify-domain')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Verify the workspace custom domain via DNS TXT' })
  async verifyDomain(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.workspacesService.verifyCustomDomain(workspaceId)
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Archive (soft-delete) a workspace' })
  async archive(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.archiveWorkspace(workspaceId, { id: user.id, email: user.email, ip })
  }

  @Post(':workspaceId/restore')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Restore an archived workspace' })
  async restore(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.restoreWorkspace(workspaceId, { id: user.id, email: user.email })
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceMemberGuard)
  async listMembers(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.workspacesService.listMembers(workspaceId)
  }

  @Post(':workspaceId/members')
  @UseGuards(WorkspaceAdminGuard)
  async addMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { email: string; role?: string },
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.addMember(workspaceId, body.email, body.role, {
      id: user.id,
      email: user.email,
    })
  }

  @Patch(':workspaceId/members/:userId')
  @UseGuards(WorkspaceAdminGuard)
  async updateMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { role: string },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.updateMemberRole(workspaceId, userId, body.role, {
      id: user.id,
      email: user.email,
      ip,
    })
  }

  @Patch(':workspaceId/members/:userId/capacity')
  @UseGuards(WorkspaceAdminGuard)
  async updateMemberCapacity(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { weeklyCapacityHours: number },
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.updateMemberCapacity(workspaceId, userId, body.weeklyCapacityHours, {
      id: user.id,
      email: user.email,
    })
  }

  @Delete(':workspaceId/members/:userId')
  @UseGuards(WorkspaceAdminGuard)
  async removeMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.removeMember(workspaceId, userId, {
      id: user.id,
      email: user.email,
      ip,
    })
  }
}
