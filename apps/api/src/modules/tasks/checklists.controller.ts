import { Controller, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import type { CurrentUserPayload } from './types'

/**
 * Every route names its task, and the service finds the checklist or item
 * through it — one on another task is not found — and asks the task's write
 * rule (`found-25-sep/task-rows-changed-by-id-anywhere`).
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/checklists')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class TaskChecklistsController {
  constructor(private tasks: TasksService) {}

  @Post()
  create(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { title: string },
  ) {
    return this.tasks.createChecklist(taskId, body.title, user.id)
  }

  @Patch(':checklistId')
  update(
    @Param('taskId') taskId: string,
    @Param('checklistId') checklistId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { title?: string; position?: number },
  ) {
    return this.tasks.updateChecklist(taskId, checklistId, user.id, body)
  }

  @Delete(':checklistId')
  delete(
    @Param('taskId') taskId: string,
    @Param('checklistId') checklistId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.deleteChecklist(taskId, checklistId, user.id)
  }

  @Post(':checklistId/items')
  addItem(
    @Param('taskId') taskId: string,
    @Param('checklistId') checklistId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { content: string; assigneeId?: string | null; dueDate?: string | null },
  ) {
    return this.tasks.addChecklistItem(
      taskId,
      checklistId,
      body.content,
      body.assigneeId,
      body.dueDate ? new Date(body.dueDate) : null,
      user.id,
    )
  }

  @Patch('items/:itemId')
  updateItem(
    @Param('taskId') taskId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { content?: string; isDone?: boolean; position?: number; dueDate?: string | null; assigneeId?: string | null },
  ) {
    const patch: Record<string, unknown> = { ...body }
    if ('dueDate' in body) patch.dueDate = body.dueDate ? new Date(body.dueDate) : null
    return this.tasks.updateChecklistItem(taskId, itemId, user.id, patch)
  }

  @Delete('items/:itemId')
  deleteItem(
    @Param('taskId') taskId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.deleteChecklistItem(taskId, itemId, user.id)
  }
}
