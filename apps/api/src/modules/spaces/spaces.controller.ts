import { Controller, Get, Post, Put, Delete, Param, Body, Ip, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SpacesService } from './spaces.service'
import { SPACE_PRESETS, SPACE_FEATURE_KEYS, SPACE_VIEW_KEYS } from './space-presets'
import type { SpaceDefaultPermission } from '@rundesk/db'

@Controller('spaces')
@UseGuards(JwtAuthGuard, ResourceMemberGuard, PermissionsGuard)
export class SpacesController {
  constructor(private spacesService: SpacesService) {}

  @Get('workspace/:workspaceId')
  async getSpacesByWorkspace(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.spacesService.getSpacesByWorkspace(workspaceId, user.id)
  }

  /** Destination tree for the Move picker: spaces → folders → projects. */
  @Get('workspace/:workspaceId/move-targets')
  async moveTargets(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.spacesService.moveTargets(workspaceId, user.id)
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
  @Get()
  listPresets() {
    return { presets: SPACE_PRESETS, features: SPACE_FEATURE_KEYS, views: SPACE_VIEW_KEYS }
  }
}
