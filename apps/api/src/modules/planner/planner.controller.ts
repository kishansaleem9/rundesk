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

  /**
   * The events of the caller's own connected calendars in `[from, to)`, and the
   * calendars that could not be read (`found-25-sep/connected-calendars-read-by-nothing`).
   * Only ever the caller's: a colleague's calendar crosses as free/busy alone.
   */
  @Get('events')
  listEvents(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.planner.listEvents(workspaceId, user.id, from, to)
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

  /** §V2-14d, frame `13:28` — the calendar picker's groups, in order. */
  @Get('calendars')
  listCalendars(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.planner.listCalendars(workspaceId, user.id)
  }

  /**
   * §V2-15b, frame `12:48` — several colleagues' calendars, side by side.
   *
   * A DIFFERENT PATH FROM `blocks`, deliberately. `focus-pill` asserts that one
   * `/planner/:ws/blocks` request serves both the tab title and the header
   * pill, and a team grid hanging off that endpoint would have made it three
   * consumers of a request whose whole check is that there is one of it.
   * Nothing here reads `task_time_blocks`: a colleague's blocks are their plan
   * for their own day and stay unreadable, exactly as this controller's header
   * says. What crosses is free/busy, which carries no titles.
   */
  @Get('team-schedules')
  teamSchedules(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Query('userIds') userIds: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    /*
     * Comma-separated in the query string rather than repeated `userIds=`
     * params, because the browser has to build one cache key from it and a
     * repeated param has two orderings for one set.
     */
    const ids = (userIds ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return this.planner.teamSchedules(workspaceId, user.id, ids, { from, to })
  }

  /**
   * Frame `14:10` — Appearance and Time blocking. Per person, not per space;
   * read with this workspace beside it only to say whether the chosen Default
   * list is in its trash (`defaultListInTrash`).
   */
  @Get('settings')
  getSettings(@CurrentUser() user: any, @Param('workspaceId') workspaceId: string) {
    return this.planner.getSettings(user.id, workspaceId)
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: any,
    @Body() body: PlannerSettings & { weekStart?: string; timezone?: string },
  ) {
    return this.planner.updateSettings(user.id, body)
  }
}
