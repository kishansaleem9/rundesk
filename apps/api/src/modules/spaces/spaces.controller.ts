import { Controller, Get, Post, Put, Delete, Param, Body, Ip, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SpacesService } from './spaces.service'
import { PlansService } from '../plans/plans.service'
import {
  SPACE_PRESETS,
  SPACE_FEATURE_KEYS,
  SPACE_VIEW_KEYS,
  clickAppsForPlan,
  lockedClickApps,
} from './space-presets'
import type { SpaceDefaultPermission } from '@rundesk/db'

@Controller('spaces')
@UseGuards(JwtAuthGuard, ResourceMemberGuard, PermissionsGuard)
export class SpacesController {
  constructor(private spacesService: SpacesService) {}

  @Get('workspace/:workspaceId')
  async getSpacesByWorkspace(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.spacesService.getSpacesByWorkspace(workspaceId, user.id)
  }

  /** The spaces this person may add to (the create gate's answer), as ids. */
  @Get('workspace/:workspaceId/writable')
  async writableSpaces(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.spacesService.writableSpaceIds(workspaceId, user.id)
  }

  /** Destination tree for the Move picker: spaces → folders → projects. */
  @Get('workspace/:workspaceId/move-targets')
  async moveTargets(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.spacesService.moveTargets(workspaceId, user.id)
  }

  /** What the caller may do to the space from its menus — the checks its routes ask. */
  @Get(':spaceId/capabilities')
  async capabilities(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.spacesService.capabilities(spaceId, user.id)
  }

  @Get(':spaceId')
  async getSpace(@Param('spaceId') spaceId: string) {
    return this.spacesService.getSpace(spaceId)
  }

  @Post()
  @RequirePermissions('space.create')
  async createSpace(
    @CurrentUser() user: any,
    @Body() body: {
      workspaceId: string
      name: string
      description?: string
      color?: string
      icon?: string
      // Everything from `visibility` down is what the wizard added; the four
      // above it were accepted here long before anything sent them.
      visibility?: 'public' | 'private'
      defaultPermission?: SpaceDefaultPermission
      presetKey?: string
      viewConfig?: { defaultView?: string; enabledViews?: string[] }
      features?: string[]
    },
  ) {
    return this.spacesService.createSpace(
      body.workspaceId,
      {
        name: body.name,
        description: body.description,
        color: body.color,
        icon: body.icon,
        visibility: body.visibility,
        defaultPermission: body.defaultPermission,
        presetKey: body.presetKey,
        viewConfig: body.viewConfig,
        features: body.features,
      },
      user.id,
    )
  }

  @Put(':spaceId')
  async updateSpace(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Body()
    body: Partial<{
      name: string
      description: string
      color: string
      icon: string
      viewConfig: { defaultView?: string; enabledViews?: string[] } | null
      // Editable after creation too — the wizard sets them, the space's own
      // settings change them, and a switch you can only ever set once is a
      // decision the person is stuck with.
      defaultPermission: SpaceDefaultPermission
      features: Record<string, boolean> | null
    }>,
  ) {
    // Passed whole rather than field-by-field: the service whitelists, and a
    // second whitelist here is how `features` and `defaultPermission` came to
    // be declared in this signature and dropped on the way through.
    return this.spacesService.updateSpace(spaceId, body, user.id)
  }

  @Delete(':spaceId')
  async deleteSpace(@Param('spaceId') spaceId: string, @CurrentUser() user: any, @Ip() ip: string) {
    await this.spacesService.deleteSpace(spaceId, user.id, ip)
    return { message: 'Space archived successfully' }
  }
}

/**
 * §V2-06 — the workflow presets of frame `07:06`, served rather than
 * duplicated in the web bundle.
 *
 * The wizard previews what each card will do — its views, its statuses, its
 * ClickApps and the lists it seeds — and that preview has to be the same object
 * the server applies. A second copy in the front end is a second definition of
 * what "Marketing Teams" means, and the two would disagree the first time
 * either one changed.
 *
 * ITS OWN CONTROLLER, at its own path, for two reasons that are not style.
 * `SpacesController` declares `@Get(':spaceId')`, so `/spaces/presets` would
 * match that first and arrive as a space id; and its class-level
 * `ResourceMemberGuard` resolves a workspace from that id, so the request
 * would be refused as a malformed UUID before reaching any handler. A constant
 * needs neither.
 */
@Controller('space-presets')
@UseGuards(JwtAuthGuard)
export class SpacePresetsController {
  constructor(private plans: PlansService) {}

  @Get()
  listPresets() {
    return { presets: SPACE_PRESETS, features: SPACE_FEATURE_KEYS, views: SPACE_VIEW_KEYS }
  }

  /**
   * §V2-06 `[07:20]` — the same constant, plus what THIS workspace's plan
   * reaches.
   *
   * > "ClickUp Apps is also dependent on that — ke aap ke paas PACKAGE PLAN
   * > kaun sa hai."
   *
   * A separate, workspace-scoped route rather than a `?workspaceId=` on the one
   * above, for a reason that is not style: `ResourceMemberGuard` resolves the
   * workspace from route params and body and NOT from the query string, so a
   * query parameter would be an ungated read of another workspace's commercial
   * tier. As a path param the existing guard does the work.
   *
   * `features` stays the full set and `lockedFeatures` says which of them this
   * plan cannot have, rather than the server quietly sending a shorter list.
   * A ClickApp that simply vanishes is indistinguishable from one that was
   * never built — and "upgrade to get this" is the thing the transcript is
   * actually describing.
   */
  @Get(':workspaceId')
  @UseGuards(ResourceMemberGuard)
  async listPresetsForWorkspace(@Param('workspaceId') workspaceId: string) {
    const plan = await this.plans.getWorkspacePlan(workspaceId)
    return {
      presets: SPACE_PRESETS,
      features: SPACE_FEATURE_KEYS,
      views: SPACE_VIEW_KEYS,
      plan: { id: plan.id, label: plan.label, recognized: plan.recognized },
      allowedFeatures: clickAppsForPlan(plan.id),
      lockedFeatures: lockedClickApps(plan.id),
    }
  }
}
