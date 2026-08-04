import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TaskTypesService } from './task-types.service'
import type { CurrentUserPayload } from './types'

/**
 * Task Types. Membership and admin rights are checked inside the service for
 * every route — the collection hangs off a workspace but is applied from a
 * task, so no single guard covers both shapes.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TaskTypesController {
  constructor(private types: TaskTypesService) {}

  @Get('workspaces/:workspaceId/task-types')
  @ApiOperation({ summary: 'Task types defined in a workspace' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.types.list(workspaceId, user.id)
  }

  @Post('workspaces/:workspaceId/task-types')
  @ApiOperation({ summary: 'Create a task type' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name: string; icon?: string | null; color?: string | null; isDefault?: boolean },
  ) {
    return this.types.create(workspaceId, user.id, body)
  }

  @Patch('workspaces/:workspaceId/task-types/:typeId')
  @ApiOperation({ summary: 'Rename or restyle a task type' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('typeId') typeId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name?: string; icon?: string | null; color?: string | null; isDefault?: boolean; position?: number },
  ) {
    return this.types.update(workspaceId, typeId, user.id, body)
  }

  @Delete('workspaces/:workspaceId/task-types/:typeId')
  @ApiOperation({ summary: 'Delete a task type (tasks using it become untyped)' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('typeId') typeId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.types.remove(workspaceId, typeId, user.id)
  }

  @Patch('tasks/:taskId/task-type')
  @ApiOperation({ summary: 'Set or clear the type of a task' })
  setForTask(
    @Param('taskId') taskId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taskTypeId: string | null },
  ) {
    return this.types.setForTask(taskId, body?.taskTypeId ?? null, user.id)
  }
}
