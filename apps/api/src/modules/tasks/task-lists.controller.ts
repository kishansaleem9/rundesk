import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TaskListsService } from './task-lists.service'
import type { CurrentUserPayload } from './types'

/**
 * A task's lists (`commit-log/log-713a611-1`): its home and the others it was
 * added to. The guard reads the task (`:taskId`), and the list it goes into or
 * leaves is named `:addedListId`, so the guard never authorizes by that list.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskListsController {
  constructor(private readonly taskLists: TaskListsService) {}

  @Get(':taskId/lists')
  @UseGuards(ResourceMemberGuard)
  listsOf(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.taskLists.listsOf(taskId, { id: user.id, role: user.role })
  }

  @Post(':taskId/lists')
  @UseGuards(ResourceMemberGuard)
  add(@Param('taskId') taskId: string, @Body() body: { listId?: unknown }, @CurrentUser() user: CurrentUserPayload) {
    if (typeof body?.listId !== 'string' || !body.listId) throw new BadRequestException('listId is required')
    return this.taskLists.add(taskId, body.listId, { id: user.id, role: user.role })
  }

  @Delete(':taskId/lists/:addedListId')
  @UseGuards(ResourceMemberGuard)
  remove(@Param('taskId') taskId: string, @Param('addedListId') listId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.taskLists.remove(taskId, listId, { id: user.id, role: user.role })
  }
}
