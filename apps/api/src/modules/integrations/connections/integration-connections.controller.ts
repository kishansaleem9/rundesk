import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { IntegrationConnectionsService } from './integration-connections.service'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'

@ApiTags('integrations:connections')
@Controller()
export class IntegrationConnectionsController {
  constructor(private readonly svc: IntegrationConnectionsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @Get('workspaces/:workspaceId/integrations/connections')
  @ApiOperation({ summary: 'List workspace integration connections' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.svc.list(workspaceId)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @Get('workspaces/:workspaceId/integrations/connections/providers')
  @ApiOperation({ summary: 'List OAuth providers supported by backend' })
  providers() {
    return this.svc.listSupportedProviders()
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @Get('workspaces/:workspaceId/integrations/connections/providers/status')
  @ApiOperation({ summary: 'List OAuth provider availability status' })
  providerStatus() {
    return this.svc.listProviderAvailability()
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @Get('workspaces/:workspaceId/integrations/connections/access-requests')
  @ApiOperation({ summary: 'List access requests for unsupported providers' })
  listAccessRequests(@Param('workspaceId') workspaceId: string) {
    return this.svc.listAccessRequests(workspaceId)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @Post('workspaces/:workspaceId/integrations/connections/access-requests')
  @ApiOperation({ summary: 'Create access request for unsupported provider' })
  requestAccess(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Query('provider') provider: string,
    @Query('note') note?: string,
  ) {
    return this.svc.requestAccess(workspaceId, user.id, provider, note)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('integrations.access_requests.manage')
  @Patch('workspaces/:workspaceId/integrations/connections/access-requests/:provider')
  @ApiOperation({ summary: 'Update access request status' })
  setAccessRequestStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
    @Body() body: { status: 'pending' | 'approved' | 'rejected'; note?: string },
    @CurrentUser() user: any,
  ) {
    return this.svc.setAccessRequestStatus(workspaceId, provider, body.status, body.note, user.id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('integrations.manage')
  @Post('workspaces/:workspaceId/integrations/connections/:provider/oauth/start')
  @ApiOperation({ summary: 'Create OAuth authorization URL for a provider' })
  oauthStart(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.getOAuthStartUrl(workspaceId, user.id, provider)
  }

  /**
   * §V2-14 — a person connects their OWN calendar, from the planner (its
   * onboarding and its Accounts page). Asked of membership alone, guests
   * included: ClickUp's calendar integrations are personal and private, and
   * its guests and limited members use them. The grant is marked personal, so
   * its callback writes this person's account and nothing of the workspace's
   * (`found-24-sep/personal-calendar-connect-needs-integrations-manage`). The
   * workspace's own connection stays the route above, and `integrations.manage`.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @Post('workspaces/:workspaceId/calendar-sync/connect/:provider')
  @ApiOperation({ summary: "Create an OAuth authorization URL for one person's own calendar" })
  personalCalendarStart(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.getOAuthStartUrl(workspaceId, user.id, provider, { personal: true })
  }

  @Get('integrations/oauth/:provider/callback')
  @ApiOperation({ summary: 'OAuth callback for workspace integrations' })
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Ip() ip: string,
    @Res() reply: FastifyReply,
  ) {
    try {
      const result = await this.svc.handleOAuthCallback(provider, code, state, ip)
      return reply.redirect(
        result.personal
          ? this.svc.getPersonalRedirect(result.workspaceId)
          : this.svc.getSuccessRedirect(result.workspaceId, result.provider),
        302,
      )
    } catch (error: any) {
      /*
       * §V2-11 frame `18:39` — "Google gave us this error: …".
       *
       * The provider's own message is written against the integration it
       * belongs to BEFORE the redirect, so the card survives the page load
       * that used to be the only place it existed. `peekState` re-reads the
       * signed state the failed attempt carried; when even that is unreadable
       * there is no integration to attach anything to and the old app-root
       * redirect is all that is left.
       */
      const reason = error?.message ?? 'oauth_callback_failed'
      const ctx = state ? this.svc.peekState(state) : null
      // A personal grant's failure is said on the person's own Accounts page;
      // the workspace's calendar card is not theirs to write an error onto.
      if (ctx?.personal) {
        return reply.redirect(this.svc.getPersonalRedirect(ctx.workspaceId, reason), 302)
      }
      if (ctx) {
        await this.svc.recordFailure(ctx.workspaceId, ctx.provider, reason).catch(() => undefined)
      }
      return reply.redirect(
        this.svc.getFailureRedirect(reason, { workspaceId: ctx?.workspaceId, provider: ctx?.provider ?? provider }),
        302,
      )
    }
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('integrations.manage')
  @Delete('workspaces/:workspaceId/integrations/connections/:provider')
  @ApiOperation({ summary: 'Disconnect a provider from workspace' })
  disconnect(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.disconnect(workspaceId, provider, user.id)
  }
}
