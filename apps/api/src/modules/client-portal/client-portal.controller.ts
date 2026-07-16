import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ClientPortalService } from './client-portal.service'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * Admin management of client portals. Creating/listing is scoped to a project
 * and gated by ResourceMemberGuard (workspace membership + private-container
 * access resolved from :projectId). Update/delete carry only the portal id, so
 * the service re-derives the project and enforces the same access there.
 */
@ApiTags('client-portal')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class ClientPortalController {
  constructor(private readonly portals: ClientPortalService) {}

  @Post('projects/:projectId/portal')
  @UseGuards(ResourceMemberGuard)
  @ApiOperation({ summary: 'Create a client portal for a project' })
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name?: string | null; clientId?: string | null; showCompleted?: boolean },
  ) {
    return this.portals.create(projectId, user.id, body ?? {})
  }

  @Get('projects/:projectId/portal')
  @UseGuards(ResourceMemberGuard)
  @ApiOperation({ summary: 'List a project\'s client portals' })
  list(@Param('projectId') projectId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.portals.listForProject(projectId, user.id)
  }

  @Patch('portals/:id')
  @ApiOperation({ summary: 'Enable/disable, rename, or toggle show-completed for a portal' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name?: string | null; isEnabled?: boolean; showCompleted?: boolean },
  ) {
    return this.portals.update(id, user.id, body ?? {})
  }

  @Delete('portals/:id')
  @ApiOperation({ summary: 'Revoke (delete) a client portal' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.portals.remove(id, user.id)
  }
}

/**
 * Public, anonymous, token-only read. No auth guard — `/portal/<token>` works
 * for any client with the link. Returns only the linked project's client-safe
 * projection (see ClientPortalService.getPublicView).
 */
@ApiTags('client-portal-public')
@Controller()
export class ClientPortalPublicController {
  constructor(private readonly portals: ClientPortalService) {}

  @Get('portal/:token')
  @ApiOperation({ summary: 'Get a client portal by token (no auth required)' })
  getPublic(@Param('token') token: string) {
    return this.portals.getPublicView(token)
  }
}
