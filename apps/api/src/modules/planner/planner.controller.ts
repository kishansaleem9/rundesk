import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PlannerService } from './planner.service'
import type { PlannerSettings } from '@rundesk/db'

/**
 * §V2-02 — the Planner, frame `13:08`.
 *
 * `WorkspaceMemberGuard`, and then everything is scoped to `user.id` inside
 * the service. There is no route here that reads another person's blocks:
 * `[14:56]` "yeh MERI planner pe show honge" — a planner is one person's plan
 * for their own week, and a manager who could open yours would be looking at
 * your day rather than at your work.
 */
@ApiTags('planner')
@ApiBearerAuth()
@Controller('planner/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class PlannerController {
  constructor(private planner: PlannerService) {}

  /** The grid's read: `[from, to)`, half-open so two weeks never double-count. */
  @Get('blocks')
  listBlocks(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.planner.listBlocks(workspaceId, user.id, from, to)
  }

  @Post('blocks')
  createBlock(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { taskId?: string | null; title?: string | null; startsAt: string; endsAt?: string; isAllDay?: boolean },
  ) {
    return this.planner.createBlock(workspaceId, user.id, body)
  }

  @Patch('blocks/:blockId')
  updateBlock(
    @Param('blockId') blockId: string,
    @CurrentUser() user: any,
    @Body() body: { startsAt?: string; endsAt?: string; title?: string | null; isAllDay?: boolean },
  ) {
    return this.planner.updateBlock(blockId, user.id, body)
  }

  @Delete('blocks/:blockId')
  deleteBlock(@Param('blockId') blockId: string, @CurrentUser() user: any) {
    return this.planner.deleteBlock(blockId, user.id)
  }

  /** Frame `14:10` — Appearance and Time blocking. Per person, not per space. */
  @Get('settings')
  getSettings(@CurrentUser() user: any) {
    return this.planner.getSettings(user.id)
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: any, @Body() body: PlannerSettings) {
    return this.planner.updateSettings(user.id, body)
  }
}
