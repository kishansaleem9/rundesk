import { Controller, Get, Post, Patch, Delete, Put, Param, Query, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PeopleService } from './people.service'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * §G06 [05:35–06:35] — the person profile panel.
 *
 * Everything here is workspace-scoped and reads about one member. The panel
 * opens over whatever page you were on, so the profile itself is one request:
 * six round trips is six chances to render half a card.
 */
@ApiTags('people')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/people')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class PeopleController {
  constructor(private people: PeopleService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Who this person is: identity, teams, reporting line, open work' })
  profile(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.people.getProfile(workspaceId, user.id, userId)
  }

  /** §G06 [06:00] — activity by ACTOR, which nothing could query before. */
  @Get(':userId/activity')
  activity(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.people.getActivity(workspaceId, user.id, userId, {
      q,
      limit: limit ? Number(limit) : undefined,
    })
  }

  /**
   * §G05 [05:40] — "✦ Get StandUp": what this person has been doing.
   *
   * POST rather than GET because it may call a model, which costs money and
   * must not be issued by a cache warming a link or a browser prefetching one.
   * It reads nothing it does not own and writes nothing, so it is safe to
   * repeat — but "safe to repeat" and "free to repeat" are different claims.
   *
   * Always answers. With no model configured it returns the deterministic
   * summary, which is a real answer rather than a 503 — the same rule the daily
   * briefing follows, and the reason this can be tested on a box with no key.
   */
  @Post(':userId/standup')
  @ApiOperation({ summary: 'Summarise what this person has been working on (§G05 [05:40])' })
  standup(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body?: { days?: number },
  ) {
    return this.people.generateStandup(workspaceId, user.id, userId, { days: body?.days })
  }

  /** §G06 [06:22] — their dated tasks and the meetings they are in. */
  @Get(':userId/calendar')
  calendar(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.people.getCalendar(workspaceId, user.id, userId, { from, to })
  }

  /**
   * §G06 [05:54] — their priorities.
   *
   * Readable by any colleague — "what are you actually doing today" is what a
   * teammate opens a profile to find out. Ticking, ordering and removing are
   * the owner's only, below: a decision somebody else can edit is not a
   * decision. Each row says who added it.
   */
  @Get(':userId/priorities')
  priorities(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.people.listPriorities(workspaceId, user.id, userId)
  }

  /**
   * `ledger-rows/row-850` — add a task to THIS person's priorities.
   *
   * The one write about somebody else's list, and it was refused on purpose
   * until ClickUp's own rule was read: members, admins and owners may add a
   * task to a colleague's priorities (guests may not), and assigning asks
   * "Add this task to <name>'s priorities?". It adds and nothing more — the
   * task is theirs to tick, order and drop, through the owner's routes below —
   * and only a task both of you may open (`PeopleService.addPriorityFor`).
   */
  @Post(':userId/priorities')
  @ApiOperation({ summary: "Add a task to a colleague's priorities (ledger-rows/row-850)" })
  addPriority(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taskId?: string | null; title?: string | null },
  ) {
    return this.people.addPriorityFor(workspaceId, user, userId, body ?? {})
  }
}

/**
 * The caller's own priorities. A separate controller because these are writes
 * about yourself and take no `:userId`. Adding a task to a COLLEAGUE's list is
 * `POST /people/:userId/priorities` above (`ledger-rows/row-850`), with rules
 * of its own; everything here stays about the caller, so ticking, removing and
 * reordering a row are its owner's alone, whoever added it.
 */
@ApiTags('people')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/priorities')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class PrioritiesController {
  constructor(private people: PeopleService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.people.listPriorities(workspaceId, user.id, user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Add a task, or a typed line, to today’s priorities' })
  add(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taskId?: string | null; title?: string | null },
  ) {
    return this.people.addPriority(workspaceId, user.id, body ?? {})
  }

  @Patch(':priorityId')
  setDone(
    @Param('priorityId') priorityId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { done?: boolean },
  ) {
    return this.people.setPriorityDone(priorityId, user.id, body?.done !== false)
  }

  @Delete(':priorityId')
  remove(@Param('priorityId') priorityId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.people.removePriority(priorityId, user.id)
  }

  /** The whole order in one call — a drag produces one order, not N moves. */
  @Put('order')
  reorder(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { ids?: string[] },
  ) {
    return this.people.reorderPriorities(workspaceId, user.id, body?.ids ?? [])
  }
}
