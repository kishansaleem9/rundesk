import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PersonalTasksService } from './personal-tasks.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('personal-tasks')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class PersonalTasksController {
  constructor(private svc: PersonalTasksService) {}

  /** The caller's Personal List (`found-24-sep/planner-default-list-read-by-nothing`): made the first time it is asked for. */
  @Get('workspaces/:workspaceId/personal-list')
  @UseGuards(WorkspaceMemberGuard)
  personalList(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.personalList(workspaceId, user.id)
  }

  @Get('workspaces/:workspaceId/personal-tasks')
  @UseGuards(WorkspaceMemberGuard)
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.list(workspaceId, user.id)
  }

  @Post('workspaces/:workspaceId/personal-tasks')
  @UseGuards(WorkspaceMemberGuard)
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { title: string },
  ) {
    return this.svc.create(workspaceId, user.id, body.title)
  }

  // Owner-scoped (the service checks the row belongs to the caller).
  @Patch('personal-tasks/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { title?: string; done?: boolean },
  ) {
    return this.svc.update(id, user.id, body)
  }

  @Delete('personal-tasks/:id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.remove(id, user.id)
  }
}
