import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
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

  /**
   * §V2-13 / frame `12:14` — the Template Center's faceted browse.
   *
   * A separate route rather than query params bolted onto `GET /`, because the
   * shape is different: `{ templates, total, facets }` instead of an array.
   * `GET /` keeps its contract for everything that already reads it.
   *
   * Declared BEFORE `:templateId`, or Nest matches "browse" as a template id
   * and this route is never reached.
   */
  @Get('browse')
  @ApiOperation({ summary: 'Browse templates with server-computed facet counts' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ['all', 'builtin', 'custom'] })
  @ApiQuery({ name: 'type', required: false, description: 'CSV of space|folder|list' })
  @ApiQuery({ name: 'complexity', required: false, description: 'CSV of beginner|intermediate|advanced' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'useCase', required: false })
  browse(
    @Param('workspaceId') workspaceId: string,
    @Query('q') q?: string,
    @Query('scope') scope?: string,
    @Query('type') type?: string,
    @Query('complexity') complexity?: string,
    @Query('category') category?: string,
    @Query('useCase') useCase?: string,
  ) {
    return this.svc.browse(workspaceId, { q, scope, type, complexity, category, useCase })
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
    @Body() body: {
      projectId: string
      name: string
      description?: string
      icon?: string
      category?: string
      useCase?: string
      targetType?: string
    },
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
  @ApiOperation({
    summary:
      'Apply a template — a space, a project under :targetSpaceId, or one list ' +
      'into :targetProjectId, according to the template’s own targetType',
  })
  apply(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: {
      templateId: string
      targetSpaceId?: string
      targetProjectId?: string
      projectName?: string
    },
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
