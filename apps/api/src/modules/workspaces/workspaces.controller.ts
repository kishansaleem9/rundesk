import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
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
}
