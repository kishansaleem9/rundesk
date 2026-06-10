import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { GoalsService } from './goals.service'
import type { CurrentUserPayload } from '../tasks/types'
import type { GoalKind, GoalStatus } from '@rundesk/db'

@ApiTags('goals')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class GoalsController {
  constructor(private goals: GoalsService) {}

  @Get('workspaces/:workspaceId/goals')
  @UseGuards(WorkspaceMemberGuard)
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('spaceId') spaceId?: string,
    @Query('parentGoalId') parentGoalId?: string,
  ) {
    return this.goals.list(workspaceId, {
      spaceId: spaceId === 'null' ? null : spaceId,
      parentGoalId: parentGoalId === 'null' ? null : parentGoalId,
    })
  }

  @Post('workspaces/:workspaceId/goals')
  @UseGuards(WorkspaceMemberGuard)
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: {
      title: string
      description?: string
      spaceId?: string | null
      parentGoalId?: string | null
      kind?: GoalKind
      targetValue?: number
      unit?: string
      startDate?: string
      dueDate?: string
      ownerId?: string
    },
  ) {
    return this.goals.create({
      workspaceId,
      title: body.title,
      description: body.description,
      spaceId: body.spaceId,
      parentGoalId: body.parentGoalId,
      kind: body.kind,
      targetValue: body.targetValue,
      unit: body.unit,
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      ownerId: body.ownerId ?? user.id,
    })
  }

  @Patch('goals/:goalId')
  update(
    @Param('goalId') goalId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: {
      title?: string
      description?: string | null
      currentValue?: number
      targetValue?: number
      status?: GoalStatus
      ownerId?: string | null
      startDate?: string | null
      dueDate?: string | null
    },
  ) {
    return this.goals.update(
      goalId,
      {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : body.startDate as null | undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : body.dueDate as null | undefined,
      },
      user.id,
    )
  }

  @Get('goals/:goalId')
  getOne(@Param('goalId') goalId: string) {
    return this.goals.getOne(goalId)
  }

  @Delete('goals/:goalId')
  remove(@Param('goalId') goalId: string) {
    return this.goals.delete(goalId)
  }

  @Get('goals/:goalId/history')
  history(@Param('goalId') goalId: string) {
    return this.goals.history(goalId)
  }

  // ─── Key results ───────────────────────────────────────────────────────────

  @Get('goals/:goalId/key-results')
  listKeyResults(@Param('goalId') goalId: string) {
    return this.goals.listKeyResults(goalId)
  }

  @Post('goals/:goalId/key-results')
  createKeyResult(
    @Param('goalId') goalId: string,
    @Body() body: { title: string; unit?: string; targetValue?: number; currentValue?: number; ownerId?: string | null },
  ) {
    return this.goals.createKeyResult(goalId, body)
  }

  @Patch('goals/:goalId/key-results/:krId')
  updateKeyResult(
    @Param('krId') krId: string,
    @Body() body: { title?: string; unit?: string | null; targetValue?: number; currentValue?: number; status?: GoalStatus; ownerId?: string | null },
  ) {
    return this.goals.updateKeyResult(krId, body)
  }

  @Delete('goals/:goalId/key-results/:krId')
  deleteKeyResult(@Param('krId') krId: string) {
    return this.goals.deleteKeyResult(krId)
  }
}
