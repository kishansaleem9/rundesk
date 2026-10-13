import { Body, Controller, Delete, Get, Module, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { DatabaseModule } from '../../../common/database/database.module'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { RateLimit, RateLimitGuard } from '../../../common/guards/rate-limit.guard'
import { AUTH_ROUTE_LIMITS } from '../../../common/guards/auth-route-limits'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../../custom-roles/custom-roles.module'
import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'
import { BasecampImportService } from './basecamp-import.service'

/**
 * Imports › **Basecamp** (`commit-log/log-601eacc-2`): the importer signs in
 * to Basecamp, chooses the account and the projects, and the import runs as a
 * job the page follows on the spreadsheet import's job route. Every route but
 * the way back from Launchpad asks `workspace.import`, as every import does.
 */
@ApiTags('integrations:basecamp-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
@RequirePermissions('workspace.import')
@Controller('workspaces/:workspaceId/import/basecamp')
export class BasecampImportController {
  constructor(private readonly svc: BasecampImportService) {}

  @Get()
  @ApiOperation({ summary: 'Whether Basecamp is set up here, and whether you are signed in to it for importing' })
  status(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.svc.status(workspaceId, { id: user.id, role: user.role })
  }

  @Post('connect')
  @ApiOperation({ summary: 'Where to sign in to Basecamp; it comes back to this import' })
  connect(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.svc.connect(workspaceId, { id: user.id, role: user.role })
  }

  @Delete()
  @ApiOperation({ summary: 'Forget your Basecamp sign-in here' })
  disconnect(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.svc.disconnect(workspaceId, { id: user.id, role: user.role })
  }

  @Get('projects')
  @ApiOperation({ summary: 'The projects and teams of a Basecamp account your sign-in opens' })
  projects(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any, @Query('account') account?: string) {
    return this.svc.projects(workspaceId, { id: user.id, role: user.role }, account)
  }

  @Post()
  @ApiOperation({ summary: 'Import the chosen Basecamp projects — returns a job id to poll' })
  run(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { accountId?: string; projectIds?: string[]; spaceId?: string | null },
  ) {
    return this.svc.start(workspaceId, { id: user.id, role: user.role }, body ?? {})
  }
}

/**
 * The way back from Launchpad. No session rides on it — the browser is
 * coming back from Basecamp — so the signed state says whose sign-in it is,
 * and the route has the OAuth callbacks' budget (`AUTH_ROUTE_LIMITS.oauthRedirect`).
 * It lands on the import page either way, saying why when it failed.
 */
@ApiTags('integrations:basecamp-import')
@Controller('import/basecamp')
export class BasecampCallbackController {
  constructor(private readonly svc: BasecampImportService) {}

  @Get('callback')
  @UseGuards(RateLimitGuard)
  @RateLimit(AUTH_ROUTE_LIMITS.oauthRedirect)
  @ApiOperation({ summary: 'Launchpad sends the browser back here after the Basecamp sign-in' })
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Res() reply: FastifyReply) {
    const known = this.svc.readState(state)
    if (!known) return reply.redirect(`${(process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/app?importError=basecamp_sign_in_expired`, 302)
    if (error) return reply.redirect(this.svc.pageUrl(known.ws, `Basecamp said: ${error}`), 302)
    try {
      const { workspaceId } = await this.svc.callback(code, state)
      return reply.redirect(this.svc.pageUrl(workspaceId), 302)
    } catch (e: any) {
      return reply.redirect(this.svc.pageUrl(known.ws, e?.message ?? 'The Basecamp sign-in failed'), 302)
    }
  }
}

@Module({
  imports: [DatabaseModule, CustomRolesModule],
  controllers: [BasecampImportController, BasecampCallbackController],
  providers: [BasecampImportService, WorkspaceMemberGuard, RateLimitGuard],
})
export class BasecampImportModule {}
