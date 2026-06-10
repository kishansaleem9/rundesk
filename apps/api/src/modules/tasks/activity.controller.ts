import { Controller, Get, Param, UseGuards } from '@nestjs/common'
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
