import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { TasksService } from './tasks.service'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:taskId/activity')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class TaskActivityController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.tasks.listActivity(taskId)
  }
}

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects/:projectId/activity')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ProjectActivityController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(@Param('projectId') projectId: string, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 100
    return this.tasks.listProjectActivity(projectId, Math.min(Number.isFinite(n) && n > 0 ? n : 100, 200))
  }
}
