import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CustomFieldsService } from './custom-fields.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating'

@ApiTags('custom-fields')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId')
export class CustomFieldsController {
  constructor(private readonly svc: CustomFieldsService) {}

  // ── Definitions (project-scoped) ──────────────────────────────────────────
  @Get('projects/:projectId/custom-fields')
  @ApiOperation({ summary: 'List custom field definitions for a project' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.svc.listForProject(workspaceId, projectId)
  }

  @Post('projects/:projectId/custom-fields')
  @ApiOperation({ summary: 'Create a custom field definition' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      name: string
      type: CustomFieldType
      isRequired?: boolean
      listId?: string
      options?: Array<{ label: string; value: string; color?: string }>
      /* §V2-01b — Progress (Auto)'s settings, frame `00:25`: which of subtasks,
       * checklists and assigned comments to count, and whether a done task with
       * nothing to count reads 100%. Normalised by the service. */
      config?: unknown
    },
  ) {
    return this.svc.createDefinition(workspaceId, projectId, body)
  }

  @Patch('custom-fields/:fieldId')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: any,
  ) {
    return this.svc.updateDefinition(workspaceId, fieldId, body)
  }

  @Delete('custom-fields/:fieldId')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.svc.deleteDefinition(workspaceId, fieldId)
  }

  // ── Values (task-scoped) ──────────────────────────────────────────────────
  @Get('tasks/:taskId/custom-fields')
  @ApiOperation({ summary: 'Get all custom field values for a task' })
  getValues(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.svc.getValuesForTask(workspaceId, taskId)
  }

  @Put('tasks/:taskId/custom-fields/:fieldId')
  @ApiOperation({ summary: 'Set a custom field value on a task' })
  setValue(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: { value: string | number | boolean | null },
  ) {
    return this.svc.setValue(workspaceId, taskId, fieldId, body.value)
  }
}
