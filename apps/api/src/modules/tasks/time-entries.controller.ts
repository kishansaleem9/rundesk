import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/time-entries')
@UseGuards(JwtAuthGuard)
export class TaskTimeEntriesController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.tasks.listTimeEntries(taskId)
  }

  @Post('start')
  start(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { description?: string },
  ) {
    return this.tasks.startTimer(taskId, user.id, body?.description)
  }

  @Post('stop/:entryId')
  stop(@Param('entryId') entryId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.stopTimer(entryId, user.id)
  }

  @Post('manual')
  manual(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { startedAt: string; endedAt: string; description?: string; isBillable?: boolean },
  ) {
    return this.tasks.addManualTimeEntry({
      taskId,
      userId: user.id,
      startedAt: new Date(body.startedAt),
      endedAt: new Date(body.endedAt),
      description: body.description,
      isBillable: body.isBillable,
    })
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('time-entries')
@UseGuards(JwtAuthGuard)
export class TimeEntriesController {
  constructor(private tasks: TasksService) {}

  @Get('active')
  active(@CurrentUser() user: CurrentUserPayload) {
    return this.tasks.getActiveTimer(user.id)
  }
}
