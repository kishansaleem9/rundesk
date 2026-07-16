import { Controller, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import type { CurrentUserPayload } from './types'

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
    @Param('checklistId') checklistId: string,
    @Body() body: { title?: string; position?: number },
  ) {
    return this.tasks.updateChecklist(checklistId, body)
  }

  @Delete(':checklistId')
  delete(@Param('checklistId') checklistId: string) {
    return this.tasks.deleteChecklist(checklistId)
  }

  @Post(':checklistId/items')
  addItem(
    @Param('checklistId') checklistId: string,
    @Body() body: { content: string; assigneeId?: string | null; dueDate?: string | null },
  ) {
    return this.tasks.addChecklistItem(
      checklistId,
      body.content,
      body.assigneeId,
      body.dueDate ? new Date(body.dueDate) : null,
    )
  }

  @Patch('items/:itemId')
  updateItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { content?: string; isDone?: boolean; position?: number; dueDate?: string | null; assigneeId?: string | null },
  ) {
    const patch: Record<string, unknown> = { ...body }
    if ('dueDate' in body) patch.dueDate = body.dueDate ? new Date(body.dueDate) : null
    return this.tasks.updateChecklistItem(itemId, user.id, patch)
  }

  @Delete('items/:itemId')
  deleteItem(@Param('itemId') itemId: string) {
    return this.tasks.deleteChecklistItem(itemId)
  }
}
