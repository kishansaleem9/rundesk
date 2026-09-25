import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TaskRemindersService } from './task-reminders.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('reminders')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class RemindersController {
  constructor(private reminders: TaskRemindersService) {}

  /** The caller's still-pending reminders across the workspace. */
  @Get('reminders')
  listUpcoming(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reminders.listUpcoming(workspaceId, user.id)
  }

  /** The caller's reminders on a specific task. */
  @Get('tasks/:taskId/reminders')
  listForTask(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reminders.listForTask(taskId, user.id)
  }

  /**
   * A reminder about a task, or about nothing in particular.
   *
   * §G15 [21:36] — "phir REMINDER ka" is one of the things the create modal is
   * supposed to offer, and there is nothing to attach a reminder to at that
   * moment: you are creating it, not annotating something. Since 0115 the
   * subject is optional, so a bare `{ remindAt, note }` is a whole reminder.
   */
  @Post('reminders')
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taskId?: string; remindAt: string; note?: string },
  ) {
    if (body.taskId) {
      return this.reminders.create(workspaceId, { id: user.id, role: user.role }, body.taskId, body.remindAt, body.note)
    }
    return this.reminders.createStandalone(workspaceId, user.id, body.remindAt, body.note ?? '')
  }

  @Delete('reminders/:id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reminders.remove(id, user.id)
  }
}
