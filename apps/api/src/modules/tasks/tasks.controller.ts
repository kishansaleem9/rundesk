import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get('workspace/:workspaceId/timeline')
  @UseGuards(WorkspaceMemberGuard)
  async getTimeline(@Param('workspaceId') workspaceId: string) {
    return this.tasks.getTimelineForWorkspace(workspaceId)
  }

  @Get('workspace/:workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  async getWorkspaceTasks(
    @Param('workspaceId') workspaceId: string,
    @Query('limit') limit?: string,
  ) {
    return this.tasks.getTasksForWorkspace(workspaceId, limit ? Number(limit) : 500)
  }

  @Get('workspace/:workspaceId/members/:userId')
  @UseGuards(WorkspaceMemberGuard)
  async getMemberTasks(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.tasks.getTasksForMember(workspaceId, userId)
  }

  @Get('list/:listId')
  async getByList(
    @Param('listId') listId: string,
    @Query('includeSubtasks') includeSubtasks?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.tasks.getTasksByList(listId, {
      includeSubtasks: includeSubtasks === 'true',
      includeArchived: includeArchived === 'true',
    })
  }

  @Get(':taskId')
  async getOne(@Param('taskId') taskId: string) {
    return this.tasks.getTask(taskId)
  }

  @Get(':taskId/navigation')
  async getTaskNavigation(@Param('taskId') taskId: string) {
    return this.tasks.getTaskNavigation(taskId)
  }

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      listId: string
      title: string
      description?: string
      priority?: 'urgent' | 'high' | 'normal' | 'low'
      status?: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
      position?: number
      startDate?: string
      dueDate?: string
      timeEstimate?: number
      parentTaskId?: string
      assigneeIds?: string[]
      labelIds?: string[]
    },
  ) {
    return this.tasks.createTask({
      listId: body.listId,
      title: body.title,
      description: body.description,
      priority: body.priority,
      status: body.status,
      position: body.position,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      timeEstimate: body.timeEstimate,
      parentTaskId: body.parentTaskId,
      assigneeIds: body.assigneeIds,
      labelIds: body.labelIds,
      createdById: user.id,
    })
  }

  @Patch(':taskId')
  async update(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: Partial<{
      title: string
      description: string | null
      priority: 'urgent' | 'high' | 'normal' | 'low'
      status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
      startDate: string | null
      dueDate: string | null
      position: number
      timeEstimate: number | null
      isArchived: boolean
    }>,
  ) {
    const patch: Record<string, unknown> = { ...body }
    if ('startDate' in body) patch.startDate = body.startDate ? new Date(body.startDate) : null
    if ('dueDate'   in body) patch.dueDate   = body.dueDate   ? new Date(body.dueDate)   : null
    return this.tasks.updateTask(taskId, user.id, patch)
  }

  @Post(':taskId/move')
  async move(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { listId: string; position: number },
  ) {
    return this.tasks.moveTask(taskId, user.id, body.listId, body.position)
  }

  @Delete(':taskId')
  async delete(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.deleteTask(taskId, user.id)
  }

  // --- Assignees ----------------------------------------------------------
  @Post(':taskId/assignees')
  async addAssignee(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { userId: string },
  ) {
    return this.tasks.addAssignee(taskId, body.userId, user.id)
  }

  @Delete(':taskId/assignees/:userId')
  async removeAssignee(
    @Param('taskId') taskId: string,
    @Param('userId') userId: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.tasks.removeAssignee(taskId, userId, actor.id)
  }

  // --- Labels -------------------------------------------------------------
  @Post(':taskId/labels/:labelId')
  async addLabel(
    @Param('taskId') taskId: string,
    @Param('labelId') labelId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.addLabel(taskId, labelId, user.id)
  }

  @Delete(':taskId/labels/:labelId')
  async removeLabel(
    @Param('taskId') taskId: string,
    @Param('labelId') labelId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.removeLabel(taskId, labelId, user.id)
  }

  // --- Watchers -----------------------------------------------------------
  @Post(':taskId/watchers')
  async addWatcher(
    @Param('taskId') taskId: string,
    @Body() body: { userId: string },
  ) {
    return this.tasks.addWatcher(taskId, body.userId)
  }

  @Delete(':taskId/watchers/:userId')
  async removeWatcher(
    @Param('taskId') taskId: string,
    @Param('userId') userId: string,
  ) {
    return this.tasks.removeWatcher(taskId, userId)
  }

  // --- Attachments ---------------------------------------------------------
  @Get(':taskId/attachments')
  async listAttachments(@Param('taskId') taskId: string) {
    return this.tasks.listAttachments(taskId)
  }

  @Post(':taskId/attachments')
  async addAttachment(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { fileName: string; url: string; contentType?: string; sizeBytes?: number },
  ) {
    return this.tasks.addAttachment(taskId, user.id, body)
  }

  @Delete(':taskId/attachments/:attachmentId')
  async removeAttachment(
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.removeAttachment(taskId, attachmentId, user.id)
  }
}
