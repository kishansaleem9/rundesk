import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { ProjectTemplatesService } from './project-templates.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
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
  // `ledger-rows/row-1874` — the frame's top row: Use Cases · Tags · Created by.
  @ApiQuery({ name: 'createdBy', required: false, description: 'The user id of the person who made it' })
  @ApiQuery({ name: 'tag', required: false, description: 'One tag, matched whatever its case' })
  browse(
    @Param('workspaceId') workspaceId: string,
    @Query('q') q?: string,
    @Query('scope') scope?: string,
    @Query('type') type?: string,
    @Query('complexity') complexity?: string,
    @Query('category') category?: string,
    @Query('useCase') useCase?: string,
    @Query('createdBy') createdBy?: string,
    @Query('tag') tag?: string,
  ) {
    return this.svc.browse(workspaceId, { q, scope, type, complexity, category, useCase, createdBy, tag })
  }

  @Get(':templateId')
  getOne(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.svc.getOne(workspaceId, templateId)
  }

  @Post('save-from-project')
  // Making, saving and deleting a template ask `template.manage`, as task
  // templates do: `WorkspaceAdminGuard` admitted managers and refused the grant
  // (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('template.manage')
  @ApiOperation({ summary: 'Save an existing project as a reusable template (template.manage)' })
  saveFromProject(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: {
      projectId: string
      listId?: string
      name: string
      description?: string
      icon?: string
      category?: string
      useCase?: string
      targetType?: string
      tags?: string[]
    },
  ) {
    return this.svc.saveFromProject(workspaceId, { id: user.id, role: user.role }, body)
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('template.manage')
  @ApiOperation({ summary: 'Create a template from an inline payload (template.manage)' })
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
    return this.svc.apply(workspaceId, user.id, body, user.role)
  }

  /**
   * `ledger-rows/row-1874` — a template's tags, changed after it was saved
   * (ClickUp: "You can add or edit tags in the Template Center at any time").
   * The key that saves and deletes a template changes its tags, and nothing
   * less: a template is shown to the whole workspace, and its tags are what
   * the whole workspace filters it by.
   */
  @Patch(':templateId/tags')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('template.manage')
  @ApiOperation({ summary: 'Replace a workspace template’s tags (template.manage)' })
  setTags(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body() body: { tags?: string[] },
  ) {
    return this.svc.setTags(workspaceId, templateId, body?.tags)
  }

  @Delete(':templateId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('template.manage')
  @ApiOperation({ summary: 'Delete a workspace template (template.manage)' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.svc.delete(workspaceId, templateId)
  }
}
