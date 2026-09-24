import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FLAGS } from '@rundesk/feature-flags'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { GoalsService } from './goals.service'
import type { CurrentUserPayload } from '../tasks/types'
import type { GoalKind, GoalStatus } from '@rundesk/db'

// FeatureFlagGuard enforces the Goals ClickApp — a workspace that turns Goals
// off gets 404s here. GOALS is default-enabled, so existing workspaces keep it.
@ApiTags('goals')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, ResourceMemberGuard, FeatureFlagGuard)
@FeatureFlag(FLAGS.GOALS)
export class GoalsController {
  constructor(private goals: GoalsService) {}

  @Get('workspaces/:workspaceId/goals')
  @UseGuards(WorkspaceMemberGuard)
  list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('spaceId') spaceId?: string,
    @Query('parentGoalId') parentGoalId?: string,
  ) {
    return this.goals.list(
      workspaceId,
      {
        spaceId: spaceId === 'null' ? null : spaceId,
        parentGoalId: parentGoalId === 'null' ? null : parentGoalId,
      },
      reader(user),
    )
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
    return this.goals.create(
      {
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
      },
      reader(user),
    )
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
    // The body is not a DTO class, so nothing strips what it does not declare:
    // the service takes each field it may change by name, and nothing else.
    return this.goals.update(
      goalId,
      {
        ...body,
        startDate: body?.startDate ? new Date(body.startDate) : body?.startDate as null | undefined,
        dueDate: body?.dueDate ? new Date(body.dueDate) : body?.dueDate as null | undefined,
      },
      reader(user),
    )
  }

  @Get('goals/:goalId')
  getOne(@Param('goalId') goalId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.goals.getOne(goalId, reader(user))
  }

  @Delete('goals/:goalId')
  remove(@Param('goalId') goalId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.goals.delete(goalId, reader(user))
  }

  @Get('goals/:goalId/history')
  history(@Param('goalId') goalId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.goals.history(goalId, reader(user))
  }

  // ─── Key results ───────────────────────────────────────────────────────────

  @Get('goals/:goalId/key-results')
  listKeyResults(@Param('goalId') goalId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.goals.listKeyResults(goalId, reader(user))
  }

  @Post('goals/:goalId/key-results')
  createKeyResult(
    @Param('goalId') goalId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { title: string; unit?: string; targetValue?: number; currentValue?: number; ownerId?: string | null },
  ) {
    return this.goals.createKeyResult(goalId, body ?? { title: '' }, reader(user))
  }

  @Patch('goals/:goalId/key-results/:krId')
  updateKeyResult(
    @Param('goalId') goalId: string,
    @Param('krId') krId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { title?: string; unit?: string | null; targetValue?: number; currentValue?: number; status?: GoalStatus; ownerId?: string | null },
  ) {
    return this.goals.updateKeyResult(goalId, krId, body ?? {}, reader(user))
  }

  @Delete('goals/:goalId/key-results/:krId')
  deleteKeyResult(@Param('goalId') goalId: string, @Param('krId') krId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.goals.deleteKeyResult(goalId, krId, reader(user))
  }
}

/** The caller as the goal rules read them: their id, and their account-wide role (a super_admin passes). */
function reader(user: CurrentUserPayload) {
  return { id: user.id, role: user.role }
}
