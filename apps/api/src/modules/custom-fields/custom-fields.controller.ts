import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CustomFieldsService, type CustomFieldType } from './custom-fields.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

/*
 * The type union used to be written out again here, ten of the nineteen the
 * service accepts — so Swagger described a narrower API than the one that
 * shipped, and a typed caller could not ask for `voting` or `people`. One list
 * now, derived from the enum the column is declared with.
 */

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

  /**
   * §V2-S16 frames `15:20` / `15:30` — create a definition from an open task.
   * Same service method the project-scoped POST ends up in; see the service.
   */
  @Post('tasks/:taskId/custom-fields')
  @ApiOperation({ summary: 'Create a custom field definition from an open task' })
  createFromTask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body()
    body: {
      name: string
      type: CustomFieldType
      isRequired?: boolean
      /** `project` (default) or `list` — see the service. */
      scope?: 'project' | 'list'
      options?: Array<{ label: string; value: string; color?: string }>
      config?: unknown
    },
  ) {
    return this.svc.createDefinitionForTask(workspaceId, taskId, body)
  }

  @Put('tasks/:taskId/custom-fields/:fieldId')
  @ApiOperation({ summary: 'Set a custom field value on a task' })
  setValue(
    @CurrentUser() user: { id: string },
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('fieldId') fieldId: string,
    // `string[]` is §V2-01c's `labels`, `people` and `files`.
    @Body() body: { value: string | number | boolean | string[] | null },
  ) {
    // The actor is passed for `voting` only, which ignores `body.value` and
    // toggles this person's own vote — see the service.
    return this.svc.setValue(workspaceId, taskId, fieldId, body.value, user.id)
  }
}
