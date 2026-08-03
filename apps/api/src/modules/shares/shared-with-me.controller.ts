import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SharesService } from './shares.service'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * A1.7 — the reverse of `SharesController`, which is keyed by an object you
 * already know. Workspace-scoped rather than share-scoped so it sits next to
 * the other `workspaces/:workspaceId/...` reads, and so the sidebar, the search
 * palette (A2.10) and the Docs hub (A5.6) can all call the same route.
 */
@ApiTags('shares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/shared-with-me')
export class SharedWithMeController {
  constructor(private shares: SharesService) {}

  @Get()
  @ApiOperation({ summary: 'Everything in this workspace shared directly with the caller' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.shares.listSharedWithMe(workspaceId, user.id)
  }
}
