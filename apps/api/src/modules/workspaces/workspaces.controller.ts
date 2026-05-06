import { Body, Controller, Get, Param, Patch, Post, Delete, UseGuards, ParseUUIDPipe } from '@nestjs/common'
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

  @Post()
  @ApiOperation({ summary: 'Create a new workspace (the creator becomes workspace_admin)' })
  async create(@CurrentUser() user: any, @Body() dto: CreateWorkspaceDto) {
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
    @Body() body: { name?: string; logoUrl?: string | null; primaryColor?: string | null; customDomain?: string | null },
  ) {
    return this.workspacesService.update(workspaceId, body)
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
  ) {
    return this.workspacesService.addMember(workspaceId, body.email, body.role)
  }

  @Patch(':workspaceId/members/:userId')
  @UseGuards(WorkspaceAdminGuard)
  async updateMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { role: string },
  ) {
    return this.workspacesService.updateMemberRole(workspaceId, userId, body.role)
  }

  @Delete(':workspaceId/members/:userId')
  @UseGuards(WorkspaceAdminGuard)
  async removeMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.workspacesService.removeMember(workspaceId, userId)
  }
}
