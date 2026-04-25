import { Controller, Post, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/dependencies')
@UseGuards(JwtAuthGuard)
export class TaskDependenciesController {
  constructor(private tasks: TasksService) {}

  @Post()
  add(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { relatedTaskId: string; type: 'blocks' | 'blocked_by' | 'related_to' },
  ) {
    return this.tasks.addDependency(taskId, body.relatedTaskId, body.type, user.id)
  }

  @Delete(':depId')
  remove(@Param('depId') depId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tasks.removeDependency(depId, user.id)
  }
}
