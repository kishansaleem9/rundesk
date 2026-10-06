import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ViewsService } from './views.service'
import { ListFiltersService } from './list-filters.service'
import type { CurrentUserPayload } from '../tasks/types'
import type { ViewVisibility } from '@rundesk/db'

/**
 * §V2-07 — saved views.
 *
 * `ResourceMemberGuard` says you are a member of the workspace this view's list
 * belongs to. That was the ONLY check here until now, which meant any member
 * could rename, re-default or delete any view on any list they could open,
 * including someone else's. The second check — who may see it, who may change
 * it — is in the service, because it needs the row; making or changing a
 * shared view asks the list's level there too (`view-write.ts`).
 */
@ApiTags('views')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ViewsController {
  constructor(private views: ViewsService, private filters: ListFiltersService) {}

  @Get('lists/:listId/views')
  list(@Param('listId') listId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.views.listByList(listId, { id: user.id, role: user.role })
  }

  /** "Copy link to view" lands here — one view, by id, or a 404. */
  @Get('views/:viewId')
  getOne(@Param('viewId') viewId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.views.getOne(viewId, { id: user.id, role: user.role })
  }

  @Post('lists/:listId/views')
  create(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: {
      name: string
      type: 'list' | 'board' | 'calendar' | 'gantt' | 'table'
      config?: Record<string, unknown>
      visibility?: ViewVisibility
    },
  ) {
    return this.views.create(
      {
        listId,
        name: body.name,
        type: body.type,
        config: body.config,
        visibility: body.visibility,
        createdById: user.id,
      },
      { id: user.id, role: user.role },
    )
  }

  @Patch('views/:viewId')
  update(
    @Param('viewId') viewId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: {
      name?: string
      config?: Record<string, unknown>
      position?: number
      isDefault?: boolean
      isPinned?: boolean
      visibility?: ViewVisibility
    },
  ) {
    return this.views.update(viewId, body, { id: user.id, role: user.role })
  }

  /** "Autosave for me" — your own flag on someone else's view is still yours. */
  @Patch('views/:viewId/autosave')
  autosave(
    @Param('viewId') viewId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { autosave?: boolean },
  ) {
    return this.views.setAutosave(viewId, { id: user.id, role: user.role }, body.autosave === true)
  }

  @Delete('views/:viewId')
  remove(@Param('viewId') viewId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.views.delete(viewId, { id: user.id, role: user.role })
  }

  // ── §V2-07 "Saved filters", frame 11:41 ───────────────────────────────────
  //
  // On the views controller because they are the other half of the same panel
  // and share its guard: `ResourceMemberGuard` resolves `:listId` to a
  // workspace, so a member of one workspace cannot read another's presets.

  @Get('lists/:listId/filters')
  listFilters(@Param('listId') listId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.filters.list(listId, user.id)
  }

  @Post('lists/:listId/filters')
  saveFilter(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name: string; rules?: unknown },
  ) {
    return this.filters.save(listId, user.id, body.name, body.rules)
  }

  @Delete('lists/:listId/filters/:filterId')
  deleteFilter(@Param('filterId') filterId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.filters.remove(filterId, user.id)
  }
}
