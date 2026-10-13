import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from './types'
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
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 100
    return this.tasks.listProjectActivity(projectId, Math.min(Number.isFinite(n) && n > 0 ? n : 100, 200), {
      id: user.id,
      role: user.role,
    })
  }
}

/**
 * A LIST'S ACTIVITY VIEW (`commit-log/log-68bc188-1`, `ledger-rows/row-777`): its
 * feed, narrowed as ClickUp's Activity view narrows it, and the actions on offer
 * with their counts. `ResourceMemberGuard` asks the list's read rule first.
 */
@ApiTags('lists')
@ApiBearerAuth()
@Controller('lists/:listId/activity')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ListActivityController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('action') action?: string | string[],
    @Query('me') me?: string,
    @Query('subtasks') subtasks?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number.parseInt(limit, 10) : 50
    return this.tasks.listListActivity(listId, { id: user.id, role: user.role }, {
      q,
      actions: splitActions(action),
      me: me === 'true',
      subtasks: subtasks === 'false' ? false : true,
      before,
      limit: Number.isFinite(n) && n > 0 ? n : 50,
    })
  }

  @Get('actions')
  actions(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('me') me?: string,
    @Query('subtasks') subtasks?: string,
  ) {
    return this.tasks.listListActivityActions(listId, { id: user.id, role: user.role }, {
      q,
      me: me === 'true',
      subtasks: subtasks === 'false' ? false : true,
    })
  }
}

function splitActions(raw?: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  return [...new Set(parts.map((p) => p.trim()).filter(Boolean))]
}

