import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PresenceService } from './presence.service'
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
