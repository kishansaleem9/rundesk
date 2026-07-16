import { Controller, Get, Post, Param, Body, UseGuards, BadRequestException } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/time-entries')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
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
    @Body() body: { description?: string; isBillable?: boolean },
  ) {
    return this.tasks.startTimer(taskId, user.id, body?.description, body?.isBillable)
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
    const startedAt = new Date(body?.startedAt)
    const endedAt = new Date(body?.endedAt)
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
      throw new BadRequestException('startedAt and endedAt must be valid ISO dates')
    }
    if (endedAt.getTime() < startedAt.getTime()) {
      throw new BadRequestException('endedAt must be after startedAt')
    }
    return this.tasks.addManualTimeEntry({
      taskId,
      userId: user.id,
      startedAt,
      endedAt,
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
