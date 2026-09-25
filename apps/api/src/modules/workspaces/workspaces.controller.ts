import { Body, Controller, Get, Header, Headers, Ip, NotFoundException, Param, Patch, Post, Query, Delete, UseGuards, ParseUUIDPipe, ForbiddenException, Req } from '@nestjs/common'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { WorkspacesService, withoutDomainToken } from './workspaces.service'
import { PlansService } from '../plans/plans.service'
import type { PlanLimitsOverride } from '../plans/plans.constants'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { isManagerRole } from '../../common/permissions/item-visibility'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'
import { canCreateWorkspace } from './workspace-creation-policy'

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly plans: PlansService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List workspaces the current user belongs to' })
  async getMyWorkspaces(@CurrentUser() user: any) {
    return this.workspacesService.findByMember(user.id)
  }

  // Declared before ':workspaceId' so the literal path wins over the UUID param.
  @Get('archived')
  @ApiOperation({ summary: 'List archived workspaces the current user belongs to (Plan §13.4)' })
  async getArchivedWorkspaces(@CurrentUser() user: any) {
    return this.workspacesService.listArchivedWorkspaces(user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workspace (§7 — any member except a guest)' })
  async create(@CurrentUser() user: any, @Body() dto: CreateWorkspaceDto) {
    // §7 [09:29] — "WORKSPACE IS A FEATURE jo ke har member kar sakta hai —
    // it's not necessary ke humare paas kuch admin hi aaye jo kar sake." This
    // was Super-Admin-only, which is the thing she called missing outright at
    // [10:03]. The rule lives in workspace-creation-policy.ts with her wording.
    if (!canCreateWorkspace(user.role)) {
      throw new ForbiddenException('Guests cannot create workspaces')
    }
    return this.workspacesService.create(user.id, dto)
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Get a workspace by id (must be a member)' })
  async getOne(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Req() req: any) {
    const ws = await this.workspacesService.findById(workspaceId)
    // The domain's verification secret goes to the people who may change the
    // domain — the same roles `PATCH` admits — and to nobody else.
    return isManagerRole(req.workspaceMember?.role) ? ws : withoutDomainToken(ws)
  }

  @Get(':workspaceId/plan')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Get the workspace plan + limits + current usage (Plan §14.1)' })
  async getPlan(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.plans.getUsage(workspaceId)
  }

  @Patch(':workspaceId/plan')
  @ApiOperation({ summary: "Set a workspace's plan (Super Admin only, Plan §14.1)" })
  async setPlan(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { plan: string; planLimits?: PlanLimitsOverride | null },
    @CurrentUser() user: any,
  ) {
    // Changing a workspace's commercial plan is a platform-level (billing) action,
    // reserved for the Super Admin — mirrors the OrganizationsController gate.
    if (user.role !== 'super_admin') {
      throw new ForbiddenException('Only a Super Admin can change a workspace plan')
    }
    return this.plans.setWorkspacePlan(workspaceId, body.plan, body.planLimits)
  }

  @Patch(':workspaceId')
  // `workspace.manage` — rename, logo, domain, archive, restore — as the catalog
  // says; `WorkspaceAdminGuard` admitted managers (`role-editor-offers-unenforced-permissions`).
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('workspace.manage')
  async update(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: {
      name?: string
      logoUrl?: string | null
      primaryColor?: string | null
      accentColor?: string | null
      customDomain?: string | null
      defaultSpacePrivate?: boolean
      blockPublicSharing?: boolean
    },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.update(workspaceId, body, { id: user.id, email: user.email, ip })
  }

  @Post(':workspaceId/logo/presign')
  // `workspace.manage` — rename, logo, domain, archive, restore — as the catalog
  // says; `WorkspaceAdminGuard` admitted managers (`role-editor-offers-unenforced-permissions`).
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('workspace.manage')
  @ApiOperation({ summary: 'Presign a direct-to-R2 upload for the workspace logo (Plan §13.5)' })
  async presignLogo(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { contentType: string; sizeBytes?: number },
  ) {
    return this.workspacesService.createLogoUploadUrl(workspaceId, body)
  }

  @Get(':workspaceId/archived-tasks')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'List archived tasks in the workspace (Plan §13.4)' })
  async getArchivedTasks(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.listArchivedTasks(workspaceId, { id: user.id, role: user.role })
  }

  @Post(':workspaceId/verify-domain')
  // `workspace.manage` — rename, logo, domain, archive, restore — as the catalog
  // says; `WorkspaceAdminGuard` admitted managers (`role-editor-offers-unenforced-permissions`).
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('workspace.manage')
  @ApiOperation({ summary: 'Verify the workspace custom domain via DNS TXT' })
  async verifyDomain(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.workspacesService.verifyCustomDomain(workspaceId)
  }

  @Delete(':workspaceId')
  // `workspace.manage` — rename, logo, domain, archive, restore — as the catalog
  // says; `WorkspaceAdminGuard` admitted managers (`role-editor-offers-unenforced-permissions`).
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('workspace.manage')
  @ApiOperation({ summary: 'Archive (soft-delete) a workspace' })
  async archive(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.archiveWorkspace(workspaceId, { id: user.id, email: user.email, ip })
  }

  @Post(':workspaceId/restore')
  // `workspace.manage` — rename, logo, domain, archive, restore — as the catalog
  // says; `WorkspaceAdminGuard` admitted managers (`role-editor-offers-unenforced-permissions`).
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('workspace.manage')
  @ApiOperation({ summary: 'Restore an archived workspace' })
  async restore(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.restoreWorkspace(workspaceId, { id: user.id, email: user.email })
  }

  @Get(':workspaceId/onboarding')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Guided onboarding checklist state for the current user (Plan §14.3)' })
  async getOnboarding(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.getOnboardingStatus(workspaceId, user.id)
  }

  @Post(':workspaceId/onboarding/dismiss')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Dismiss the onboarding checklist for the current user (Plan §14.3)' })
  async dismissOnboarding(
    @Param('workspaceId', new ParseUUIDPipe()) _workspaceId: string,
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.dismissOnboarding(user.id)
  }

  /**
   * §V2-S13 `| M | Sidebar: drag-reorder …` — the sidebar tree's own order.
   *
   * One route for projects and folders, because one gesture produces both and
   * the validation is the same question asked of two tables. Lists keep their
   * existing `POST /lists/project/:id/reorder`: that route already writes
   * `lists.position` and `getListsByProject` already orders by it, so a second
   * writer here would be two owners of one column.
   */
  @Post(':workspaceId/sidebar/reorder')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Reorder the projects or folders of one sidebar container (§V2-S13)' })
  async reorderSidebar(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      kind?: 'project' | 'folder'
      containerKind?: 'space' | 'folder'
      containerId?: string
      orderedIds?: string[]
    },
  ) {
    return this.workspacesService.reorderSidebarItems(
      workspaceId,
      { id: user.id, role: user.role },
      body ?? {},
    )
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceMemberGuard)
  async listMembers(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.workspacesService.listMembers(workspaceId)
  }

  /*
   * The member routes ask their catalog keys — `members.invite`,
   * `members.role.change`, `members.remove` — whose defaults are the catalog's
   * (a manager invites; an admin changes roles and removes), and a custom
   * grant counts. `WorkspaceAdminGuard` admitted managers to all three, and a
   * manager made themself an admin (`managers-grant-themselves-admin`). The
   * service adds the rank rule: nobody adds, sets or removes above their own.
   */
  @Post(':workspaceId/members')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('members.invite')
  async addMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { email: string; role?: string },
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.addMember(workspaceId, body.email, body.role, {
      id: user.id,
      email: user.email,
      role: user.role,
    })
  }

  @Patch(':workspaceId/members/:userId')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('members.role.change')
  async updateMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { role: string },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.updateMemberRole(workspaceId, userId, body.role, {
      id: user.id,
      email: user.email,
      ip,
      role: user.role,
    })
  }

  @Patch(':workspaceId/members/:userId/capacity')
  @UseGuards(WorkspaceAdminGuard)
  async updateMemberCapacity(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { weeklyCapacityHours: number },
    @CurrentUser() user: any,
  ) {
    return this.workspacesService.updateMemberCapacity(workspaceId, userId, body.weeklyCapacityHours, {
      id: user.id,
      email: user.email,
    })
  }

  // Reporting line. Admin-only: who reports to whom drives the org tree and
  // (in time) approval routing, so it is not a self-service field.
  @Patch(':workspaceId/members/:userId/manager')
  @UseGuards(WorkspaceAdminGuard)
  async updateMemberManager(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { managerId: string | null },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.updateMemberManager(workspaceId, userId, body.managerId ?? null, {
      id: user.id,
      email: user.email,
      ip,
    })
  }

  @Get(':workspaceId/work-schedule')
  @UseGuards(WorkspaceMemberGuard)
  async getWorkSchedule(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.workspacesService.getWorkSchedule(workspaceId)
  }

  @Patch(':workspaceId/work-schedule')
  @UseGuards(WorkspaceAdminGuard)
  async setWorkDays(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { workDays: number[] },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.setWorkDays(workspaceId, body.workDays, {
      id: user.id,
      email: user.email,
      ip,
    })
  }

  @Post(':workspaceId/holidays')
  @UseGuards(WorkspaceAdminGuard)
  async addHoliday(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { day: string; name: string },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.addHoliday(workspaceId, body.day, body.name, {
      id: user.id,
      email: user.email,
      ip,
    })
  }

  @Delete(':workspaceId/holidays/:holidayId')
  @UseGuards(WorkspaceAdminGuard)
  async removeHoliday(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('holidayId', new ParseUUIDPipe()) holidayId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.removeHoliday(workspaceId, holidayId, {
      id: user.id,
      email: user.email,
      ip,
    })
  }

  @Delete(':workspaceId/members/:userId')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('members.remove')
  async removeMember(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.workspacesService.removeMember(workspaceId, userId, {
      id: user.id,
      email: user.email,
      ip,
      role: user.role,
    })
  }
}

/**
 * Public, unauthenticated custom-domain resolution (Plan §13.5 / §2.2). No
 * JwtAuthGuard — mirrors ClientPortalPublicController / DocsPublicController — so
 * the SPA can, at bootstrap on a custom domain, discover which workspace the
 * domain belongs to and apply its branding before anyone signs in. GET is a
 * safe method, so the global CsrfGuard admits it too. Returns only the safe
 * public branding projection, or 404 when no verified workspace claims the host.
 *
 * It also hosts the on-demand-TLS authorization ("ask") endpoint a
 * TLS-terminating reverse proxy calls to decide whether to obtain a certificate
 * for an incoming Host — see `authorizeTls` for the operational contract.
 */
@ApiTags('workspaces-public')
@Controller()
export class WorkspacesPublicController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('public/workspace-by-domain')
  @ApiOperation({ summary: 'Resolve a verified custom domain to its workspace branding (no auth)' })
  async workspaceByDomain(
    @Query('host') hostParam?: string,
    @Headers('host') hostHeader?: string,
  ) {
    // Prefer an explicit ?host= (the SPA passes window.location.host); fall back
    // to the request's own Host header when the query param is absent.
    const host = (hostParam && hostParam.trim()) || hostHeader || ''
    const workspace = await this.workspacesService.resolveByCustomDomain(host)
    if (!workspace) throw new NotFoundException('No workspace is served on that domain')
    return workspace
  }

  /**
   * On-demand TLS authorization ("ask") endpoint for a TLS-terminating reverse
   * proxy (Plan §13.5 / §2.2). This closes the custom-domain TLS caveat at the
   * app layer: certificate provisioning used to be noted as a manual ops step,
   * but the app now OWNS the authorization decision (which hosts may get a
   * certificate) while the proxy owns ACME + certificate storage.
   *
   * OPERATIONAL CONTRACT — point the proxy's on-demand-TLS "ask" at:
   *
   *     GET /api/v1/public/tls/authorize?domain={host}
   *
   * It returns HTTP 200 (`{ ok: true }`) IF AND ONLY IF {host} is the VERIFIED
   * custom domain of a live (non-archived) workspace, and HTTP 403 otherwise. A
   * TLS-terminating proxy (e.g. Caddy `on_demand_tls` with `ask`, or any proxy
   * exposing an on-demand-TLS authorization hook) treats a 2xx as "yes, obtain /
   * renew a certificate for this host" and any non-2xx as "no". Wiring this in
   * makes custom-domain HTTPS FULLY AUTOMATIC in production — the proxy obtains
   * and renews certificates on demand ONLY for domains a workspace owner has
   * verified (via the DNS-TXT `verifyCustomDomain` flow), with NO per-domain
   * manual certificate step — and it refuses every other host, which prevents an
   * attacker from steering the proxy into requesting ACME certificates for
   * arbitrary domains it does not control.
   *
   * Example Caddyfile:
   *
   *     {
   *       on_demand_tls {
   *         ask http://rundesk-api:3001/api/v1/public/tls/authorize
   *       }
   *     }
   *     https:// {
   *       tls { on_demand }
   *       reverse_proxy rundesk-api:3001
   *     }
   *
   * Caddy appends `?domain=<sni-host>` to the ask URL automatically. The
   * decision reuses `resolveByCustomDomain`, so it can never diverge from which
   * host the app actually serves, and is a single cheap lookup over the small
   * set of workspaces that set a custom domain. Because that decision keys on
   * the `?domain=` query value, a short `Cache-Control` hint lets the proxy/edge
   * skip re-asking for the same host on every handshake without meaningfully
   * delaying propagation when a domain is later unverified or archived. The
   * header is only emitted on the 200 path, so a refusal is never cached.
   */
  @Get('public/tls/authorize')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'On-demand TLS authorization for a verified custom domain (no auth)' })
  async authorizeTls(
    @Query('domain') domainParam?: string,
    @Query('host') hostParam?: string,
    @Headers('host') hostHeader?: string,
  ) {
    // Caddy sends the SNI host as ?domain=; accept ?host= as an alias and fall
    // back to the request's own Host header (same precedence as workspaceByDomain).
    const host = (domainParam && domainParam.trim()) || (hostParam && hostParam.trim()) || hostHeader || ''
    const authorized = await this.workspacesService.isCustomDomainAuthorized(host)
    // A non-2xx means "do NOT issue a certificate for this host". 403 (rather
    // than 404) makes the refusal explicit: the host is a valid request target
    // but is NOT authorized for certificate issuance until its workspace owner
    // has verified it — the guard against ACME issuance for arbitrary domains.
    if (!authorized) throw new ForbiddenException('TLS is not authorized for that host')
    return { ok: true }
  }
}
