import { Body, Controller, Get, Param, Patch, Post, Delete, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { WorkspacesService } from './workspaces.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
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
  @ApiOperation({ summary: 'Get a workspace by id (must be a member)' })
  async getOne(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.findById(workspaceId)
  }

  @Patch(':workspaceId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { name?: string; logoUrl?: string | null; primaryColor?: string | null; customDomain?: string | null },
  ) {
    return this.workspacesService.update(workspaceId, body)
  }

  @Get(':workspaceId/members')
  async listMembers(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.listMembers(workspaceId)
  }

  @Post(':workspaceId/members')
  async addMember(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { email: string; role?: string },
  ) {
    return this.workspacesService.addMember(workspaceId, body.email, body.role)
  }

  @Patch(':workspaceId/members/:userId')
  async updateMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    return this.workspacesService.updateMemberRole(workspaceId, userId, body.role)
  }

  @Delete(':workspaceId/members/:userId')
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.workspacesService.removeMember(workspaceId, userId)
  }
}
