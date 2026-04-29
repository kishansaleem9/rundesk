import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ProjectTemplatesService } from './project-templates.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('project-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/project-templates')
export class ProjectTemplatesController {
  constructor(private readonly svc: ProjectTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List built-in + workspace templates' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.svc.list(workspaceId)
  }

  @Get(':templateId')
  getOne(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.svc.getOne(workspaceId, templateId)
  }

  @Post('save-from-project')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Save an existing project as a reusable template (admin only)' })
  saveFromProject(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { projectId: string; name: string; description?: string; icon?: string },
  ) {
    return this.svc.saveFromProject(workspaceId, user.id, body)
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Create a template from an inline payload (admin only)' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.svc.create(workspaceId, user.id, body)
  }

  @Post('apply')
  @ApiOperation({ summary: 'Apply a template — creates a new project under :targetSpaceId' })
  apply(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { templateId: string; targetSpaceId: string; projectName?: string },
  ) {
    return this.svc.apply(workspaceId, user.id, body)
  }

  @Delete(':templateId')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Delete a workspace template (admin only)' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.svc.delete(workspaceId, templateId)
  }
}
