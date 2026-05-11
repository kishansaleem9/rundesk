import { Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { IntegrationConnectionsService } from './integration-connections.service'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'

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
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, WorkspaceAdminGuard)
  @Post('workspaces/:workspaceId/integrations/connections/:provider/oauth/start')
  @ApiOperation({ summary: 'Create OAuth authorization URL for a provider' })
  oauthStart(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.getOAuthStartUrl(workspaceId, user.id, provider)
  }

  @Get('integrations/oauth/:provider/callback')
  @ApiOperation({ summary: 'OAuth callback for workspace integrations' })
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() reply: FastifyReply,
  ) {
    try {
      const result = await this.svc.handleOAuthCallback(provider, code, state)
      return reply.redirect(this.svc.getSuccessRedirect(result.workspaceId, result.provider))
    } catch (error: any) {
      return reply.redirect(this.svc.getFailureRedirect(error?.message ?? 'oauth_callback_failed'))
    }
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, WorkspaceAdminGuard)
  @Delete('workspaces/:workspaceId/integrations/connections/:provider')
  @ApiOperation({ summary: 'Disconnect a provider from workspace' })
  disconnect(@Param('workspaceId') workspaceId: string, @Param('provider') provider: string) {
    return this.svc.disconnect(workspaceId, provider)
  }
}
