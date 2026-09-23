import { Controller, Post, Delete, Param, Body, UseGuards, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TasksService } from './tasks.service'
import type { CurrentUserPayload } from './types'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/dependencies')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class TaskDependenciesController {
  constructor(private tasks: TasksService) {}

  @Get('graph')
  graph(@Param('taskId') taskId: string, @Query('depth') depth?: string) {
    return this.tasks.getDependencyGraph(taskId, depth ? Number(depth) : 2)
  }

  @Post()
  add(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { relatedTaskId: string; type: 'blocks' | 'blocked_by' | 'related_to' },
  ) {
    return this.tasks.addDependency(taskId, body.relatedTaskId, body.type, user.id)
  }

  @Delete(':depId')
  remove(
    @Param('taskId') taskId: string,
    @Param('depId') depId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tasks.removeDependency(taskId, depId, user.id)
  }
}
