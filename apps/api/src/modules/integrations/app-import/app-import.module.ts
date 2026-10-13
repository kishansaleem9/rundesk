import { Body, Controller, Delete, Get, Module, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { DatabaseModule } from '../../../common/database/database.module'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { RateLimit, RateLimitGuard } from '../../../common/guards/rate-limit.guard'
import { AUTH_ROUTE_LIMITS } from '../../../common/guards/auth-route-limits'
import { StorageModule } from '../../../common/storage/storage.module'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../../custom-roles/custom-roles.module'
import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'
import { DocsModule } from '../../docs/docs.module'
import { ImportFilesModule } from '../clickup-import/import-files.module'
import { isAppKey } from './app-def'
import { AppImportService } from './app-import.service'

/**
 * Imports › **Asana, Jira, Monday, Todoist, Trello, Wrike** and **Notion**
 * (`found-13-oct/importers-by-sign-in-unbuilt`): the importer signs in to the
 * tool (or pastes Monday's token), chooses what to bring and where, maps its
 * people, and the import runs as a job the page follows on the spreadsheet
 * import's job route. Every route but the way back from the tool's sign-in
 * asks `workspace.import`, as every import does.
 */
@ApiTags('integrations:app-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
@RequirePermissions('workspace.import')
@Controller('workspaces/:workspaceId/import')
export class AppImportController {
  constructor(private readonly svc: AppImportService) {}

  @Get('apps')
  @ApiOperation({ summary: 'The tools signed in to for an import: whether each is set up here, and whether you are signed in to it' })
  catalogue(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.svc.catalogue(workspaceId, { id: user.id, role: user.role })
  }

  @Get('apps/:app')
  @ApiOperation({ summary: 'One tool: set up here or not, your sign-in, the choices its import offers, and what it does not bring' })
  status(@Param('workspaceId') workspaceId: string, @Param('app') app: string, @CurrentUser() user: any) {
    return this.svc.status(workspaceId, { id: user.id, role: user.role }, app)
  }

  @Post('apps/:app/connect')
  @ApiOperation({ summary: 'Where to sign in to the tool; it comes back to this import' })
  connect(@Param('workspaceId') workspaceId: string, @Param('app') app: string, @CurrentUser() user: any) {
    return this.svc.connect(workspaceId, { id: user.id, role: user.role }, app)
  }

  @Post('apps/:app/token')
  @ApiOperation({ summary: 'A token for the tool: Monday’s personal API token, or the one Trello handed back' })
  token(@Param('workspaceId') workspaceId: string, @Param('app') app: string, @CurrentUser() user: any, @Body() body: { token?: string }) {
    return this.svc.saveToken(workspaceId, { id: user.id, role: user.role }, app, body?.token)
  }

  @Delete('apps/:app')
  @ApiOperation({ summary: 'Forget your sign-in to the tool here' })
  disconnect(@Param('workspaceId') workspaceId: string, @Param('app') app: string, @CurrentUser() user: any) {
    return this.svc.disconnect(workspaceId, { id: user.id, role: user.role }, app)
  }

  @Get('apps/:app/sources')
  @ApiOperation({ summary: 'Where in the tool your sign-in reads: its workspaces, sites or account' })
  sources(@Param('workspaceId') workspaceId: string, @Param('app') app: string, @CurrentUser() user: any) {
    return this.svc.sources(workspaceId, { id: user.id, role: user.role }, app)
  }

  @Get('apps/:app/projects')
  @ApiOperation({ summary: 'What may be imported from one of them: projects, boards or spaces' })
  projects(@Param('workspaceId') workspaceId: string, @Param('app') app: string, @CurrentUser() user: any, @Query('source') source?: string) {
    return this.svc.projects(workspaceId, { id: user.id, role: user.role }, app, source)
  }

  @Get('apps/:app/people')
  @ApiOperation({ summary: 'The tool’s people in what was chosen, each with the member here their email matches; and the members to map them to' })
  people(@Param('workspaceId') workspaceId: string, @Param('app') app: string, @CurrentUser() user: any, @Query('source') source?: string, @Query('projects') projects?: string) {
    return this.svc.people(workspaceId, { id: user.id, role: user.role }, app, source, projects)
  }

  @Post('apps/:app')
  @ApiOperation({ summary: 'Import what was chosen — returns a job id to poll' })
  run(
    @Param('workspaceId') workspaceId: string,
    @Param('app') app: string,
    @CurrentUser() user: any,
    @Body() body: { source?: string; projectIds?: string[]; spaceId?: string | null; options?: Record<string, string>; people?: Record<string, string | null> },
  ) {
    return this.svc.start(workspaceId, { id: user.id, role: user.role }, app, body ?? {})
  }

  @Post('notion')
  @ApiOperation({ summary: 'Import a Notion workspace from its export (Markdown & CSV) — returns a job id to poll' })
  notion(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any, @Body() body: { fileKey?: string; spaceId?: string | null }) {
    return this.svc.notionStart(workspaceId, { id: user.id, role: user.role }, body ?? {})
  }
}

/**
 * The way back from the tool's sign-in. No session rides on it — the browser
 * is coming back from the tool — so the signed state says whose sign-in it is,
 * and the route has the OAuth callbacks' budget. It lands on the import page
 * either way, saying why when it failed.
 */
@ApiTags('integrations:app-import')
@Controller('import/apps')
export class AppImportCallbackController {
  constructor(private readonly svc: AppImportService) {}

  @Get(':app/callback')
  @UseGuards(RateLimitGuard)
  @RateLimit(AUTH_ROUTE_LIMITS.oauthRedirect)
  @ApiOperation({ summary: 'The tool sends the browser back here after its sign-in' })
  async callback(@Param('app') app: string, @Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Res() reply: FastifyReply) {
    const web = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
    const known = isAppKey(app) ? this.svc.readState(state, app) : null
    if (!known || !isAppKey(app)) return reply.redirect(`${web}/app?importError=${encodeURIComponent(`${isAppKey(app) ? app : 'import'}_sign_in_expired`)}`, 302)
    const label = this.svc.def(app).label
    if (error) return reply.redirect(this.svc.pageUrl(known.ws, app, `${label} said: ${error}`), 302)
    try {
      const { workspaceId } = await this.svc.callback(app, code, state)
      return reply.redirect(this.svc.pageUrl(workspaceId, app), 302)
    } catch (e: any) {
      return reply.redirect(this.svc.pageUrl(known.ws, app, e?.message ?? `The ${label} sign-in failed`), 302)
    }
  }
}

@Module({
  imports: [DatabaseModule, CustomRolesModule, StorageModule, ImportFilesModule, DocsModule],
  controllers: [AppImportController, AppImportCallbackController],
  providers: [AppImportService, WorkspaceMemberGuard, RateLimitGuard],
})
export class AppImportModule {}
