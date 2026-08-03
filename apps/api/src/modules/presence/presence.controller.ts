import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PresenceService, type ManualPresenceStatus } from './presence.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('presence')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/presence')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class PresenceController {
  constructor(private presence: PresenceService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.presence.getWorkspacePresence(workspaceId, user.id)
  }
}

/**
 * §A4.8 — a presence override belongs to the person, not to one workspace, so
 * it is set outside the workspace-scoped controller above.
 */
@ApiTags('presence')
@ApiBearerAuth()
@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceMeController {
  constructor(private presence: PresenceService) {}

  @Put('me')
  @ApiOperation({ summary: 'Set or clear your own presence status (null = derive from activity)' })
  setStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { status: ManualPresenceStatus | null },
  ) {
    return this.presence.setManualStatus(user.id, body?.status ?? null)
  }
}
