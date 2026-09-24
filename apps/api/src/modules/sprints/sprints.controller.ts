import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FLAGS } from '@rundesk/feature-flags'
import { SprintsService } from './sprints.service'
import { CreateSprintDto } from './dto/sprint.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'
import type { SprintStatus } from '@rundesk/db'

// FeatureFlagGuard enforces the Sprints ClickApp — a workspace that turns
// Sprints off gets 404s here. SPRINTS is default-enabled.
@ApiTags('sprints')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, ResourceMemberGuard, FeatureFlagGuard)
@FeatureFlag(FLAGS.SPRINTS)
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
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sprints.create(
      {
        workspaceId,
        spaceId: body.spaceId,
        name: body.name,
        goal: body.goal,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
      },
      { id: user.id, role: user.role },
    )
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
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // The fields a sprint has, and no others: the body was spread into the row.
    return this.sprints.update(
      sprintId,
      {
        name: body.name,
        goal: body.goal,
        status: body.status,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
      },
      { id: user.id, role: user.role },
    )
  }

  @Delete('sprints/:sprintId')
  remove(@Param('sprintId') sprintId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.sprints.delete(sprintId, { id: user.id, role: user.role })
  }

  @Get('sprints/:sprintId/tasks')
  listTasks(@Param('sprintId') sprintId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.sprints.listTasks(sprintId, { id: user.id, role: user.role })
  }

  @Post('sprints/:sprintId/tasks')
  addTask(
    @Param('sprintId') sprintId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taskId: string; storyPoints?: number },
  ) {
    return this.sprints.addTask(sprintId, body.taskId, body.storyPoints, { id: user.id, role: user.role })
  }

  @Delete('sprints/:sprintId/tasks/:taskId')
  removeTask(
    @Param('sprintId') sprintId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sprints.removeTask(sprintId, taskId, { id: user.id, role: user.role })
  }
}
