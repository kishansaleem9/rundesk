import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { TaskTemplatesService } from './task-templates.service'
import { InstantiateTemplateDto } from './dto/instantiate-template.dto'
import type { TaskTemplatePayload } from '@rundesk/db'

/**
 * Workspace-scoped CRUD for single-task templates plus the convenience
 * endpoints that snapshot from / instantiate to a real task. Members
 * can read and instantiate; create/edit/delete need `template.manage`
 * (or legacy admin role, which already implies it).
 */
@ApiTags('task-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/task-templates')
export class TaskTemplatesController {
  constructor(private readonly templates: TaskTemplatesService) {}

  @Get()
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'List task templates in this workspace' })
  list(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.templates.list(workspaceId)
  }

  @Get(':id')
  @UseGuards(WorkspaceMemberGuard)
  getOne(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.templates.getById(workspaceId, id)
  }

  @Post()
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('template.manage')
  @ApiOperation({ summary: 'Create a task template with an inline payload' })
  create(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { name: string; description?: string | null; icon?: string | null; payload?: Partial<TaskTemplatePayload> },
    @CurrentUser() user: any,
  ) {
    return this.templates.create(
      workspaceId,
      { id: user.id, email: user.email },
      body,
    )
  }

  @Patch(':id')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('template.manage')
  update(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { name?: string; description?: string | null; icon?: string | null; payload?: Partial<TaskTemplatePayload> },
    @CurrentUser() user: any,
  ) {
    return this.templates.update(
      workspaceId,
      id,
      { id: user.id, email: user.email },
      body,
    )
  }

  @Delete(':id')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('template.manage')
  async remove(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: any,
  ) {
    await this.templates.remove(workspaceId, id, { id: user.id, email: user.email })
    return { ok: true }
  }

  @Post('from-task/:taskId')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('template.manage')
  @ApiOperation({ summary: 'Snapshot an existing task into a new template' })
  saveFromTask(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() body: { name: string; description?: string | null; icon?: string | null },
    @CurrentUser() user: any,
  ) {
    return this.templates.saveFromTask(
      workspaceId,
      taskId,
      { id: user.id, email: user.email, role: user.role },
      body,
    )
  }

  @Post('duplicate/:taskId')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Duplicate an existing task into the same list' })
  duplicate(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @CurrentUser() user: any,
  ) {
    return this.templates.duplicateTask(workspaceId, taskId, { id: user.id, email: user.email, role: user.role })
  }

  /*
   * `found-30-sep/template-submit-ignores-the-form` — with what the person set
   * beside the template in the create modal, each checked as `POST /tasks`
   * checks it (`InstantiateTemplateDto`). What they set wins over the template,
   * or adds to it (`templateWithForm`).
   */
  @Post(':id/instantiate')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Create a real task from a template under a target list' })
  instantiate(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('id', new ParseUUIDPipe()) templateId: string,
    @Body() body: InstantiateTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.templates.instantiate(
      workspaceId,
      templateId,
      { id: user.id, email: user.email },
      body,
    )
  }
}
