import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ChecklistTemplatesService } from './checklist-templates.service'
import type { CurrentUserPayload } from './types'

/**
 * Reusable checklists. Membership is checked inside the service for every
 * route, since these hang off three different parents (workspace, checklist,
 * task) and there is no single resource id a guard could key on.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ChecklistTemplatesController {
  constructor(private templates: ChecklistTemplatesService) {}

  @Get('workspaces/:workspaceId/checklist-templates')
  @ApiOperation({ summary: 'Checklist templates available in a workspace' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.templates.list(workspaceId, user.id)
  }

  @Post('workspaces/:workspaceId/checklist-templates')
  @ApiOperation({ summary: 'Create a checklist template' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name: string; items?: string[] },
  ) {
    return this.templates.create(workspaceId, user.id, body)
  }

  @Post('checklists/:checklistId/save-as-template')
  @ApiOperation({ summary: 'Save an existing checklist as a reusable template' })
  saveAsTemplate(
    @Param('checklistId') checklistId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name?: string },
  ) {
    return this.templates.createFromChecklist(checklistId, user.id, body?.name)
  }

  @Post('tasks/:taskId/checklists/from-template/:templateId')
  @ApiOperation({ summary: 'Add a checklist to a task from a template' })
  apply(
    @Param('taskId') taskId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.templates.applyToTask(taskId, templateId, user.id)
  }

  @Delete('checklist-templates/:templateId')
  @ApiOperation({ summary: 'Delete a checklist template' })
  remove(@Param('templateId') templateId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.templates.remove(templateId, user.id)
  }
}
