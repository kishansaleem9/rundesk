import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { SprintsService } from './sprints.service'
import { CreateSprintDto } from './dto/sprint.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'
import type { SprintStatus } from '@rundesk/db'

@ApiTags('sprints')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class SprintsController {
  constructor(private sprints: SprintsService) {}

  @Get('workspaces/:workspaceId/sprints')
  @UseGuards(WorkspaceMemberGuard)
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.sprints.list(workspaceId, { id: user.id, role: user.role })
  }

  @Post('workspaces/:workspaceId/sprints')
  @UseGuards(WorkspaceMemberGuard)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateSprintDto,
  ) {
    return this.sprints.create({
      workspaceId,
      spaceId: body.spaceId,
      name: body.name,
      goal: body.goal,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    })
  }

  @Get('sprints/:sprintId')
  get(@Param('sprintId') sprintId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.sprints.getDetail(sprintId, { id: user.id, role: user.role })
  }

  @Patch('sprints/:sprintId')
  update(
    @Param('sprintId') sprintId: string,
    @Body() body: {
      name?: string
      goal?: string | null
      status?: SprintStatus
      startDate?: string
      endDate?: string
    },
  ) {
    return this.sprints.update(sprintId, {
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    })
  }

  @Delete('sprints/:sprintId')
  remove(@Param('sprintId') sprintId: string) {
    return this.sprints.delete(sprintId)
  }

  @Get('sprints/:sprintId/tasks')
  listTasks(@Param('sprintId') sprintId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.sprints.listTasks(sprintId, { id: user.id, role: user.role })
  }

  @Post('sprints/:sprintId/tasks')
  addTask(
    @Param('sprintId') sprintId: string,
    @Body() body: { taskId: string; storyPoints?: number },
  ) {
    return this.sprints.addTask(sprintId, body.taskId, body.storyPoints)
  }

  @Delete('sprints/:sprintId/tasks/:taskId')
  removeTask(@Param('sprintId') sprintId: string, @Param('taskId') taskId: string) {
    return this.sprints.removeTask(sprintId, taskId)
  }
}
