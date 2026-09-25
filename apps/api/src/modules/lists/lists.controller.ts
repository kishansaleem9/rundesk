import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Ip, UseGuards, BadRequestException } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { StatusShapeGuard } from './status-shape.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ListsService } from './lists.service'
import { ScopedStatusesService } from './scoped-statuses.service'
import type { StatusScope } from '../../common/statuses/status-resolution'

const VALID_SCOPES: ReadonlySet<StatusScope> = new Set(['list', 'project', 'space'])

@Controller('lists')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ListsController {
  constructor(
    private listsService: ListsService,
    private scopedStatuses: ScopedStatusesService,
  ) {}

  // Whose statuses a list uses is its statuses' shape too (`StatusShapeGuard`).
  @Patch(':listId/status-scope')
  @UseGuards(StatusShapeGuard)
  async setStatusScope(@Param('listId') listId: string, @Body() body: { scope: StatusScope }) {
    if (!body?.scope || !VALID_SCOPES.has(body.scope)) {
      throw new BadRequestException("scope must be one of 'list', 'project', 'space'")
    }
    return this.scopedStatuses.setListScope(listId, body.scope)
  }

  @Get('project/:projectId')
  async getListsByProject(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    return this.listsService.getListsByProject(projectId, { id: user.id, role: user.role })
  }

  /**
   * §G15-10 — the lists that live directly in a space.
   *
   * Declared BEFORE `:listId`, or Nest matches this path as a list whose id is
   * the word "space" and answers 404 for a route that exists.
   */
  /**
   * §V2-02 — the Planner's default-list picker needs the whole workspace.
   *
   * Declared BEFORE `@Get(':listId')`, or `/lists/workspace/<id>` arrives as a
   * list id and 404s — the same ordering trap `/spaces/presets` hit.
   */
  @Get('workspace/:workspaceId')
  byWorkspace(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.listsService.getListsByWorkspace(workspaceId, { id: user.id, role: user.role })
  }

  @Get('space/:spaceId')
  async getListsBySpace(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.listsService.getListsBySpace(spaceId, { id: user.id, role: user.role })
  }

  @Get(':listId')
  async getList(@Param('listId') listId: string) {
    return this.listsService.getList(listId)
  }

  @Post()
  async createList(
    @CurrentUser() user: any,
    @Body()
    body: {
      projectId?: string
      /** §G15-10 — a List made by choosing a Space and nothing else. */
      spaceId?: string
      name: string
      description?: string
      visibility?: 'public' | 'private'
    },
  ) {
    // §G15 [22:07] — a list can be born private. Anything other than the two
    // known values is ignored rather than trusted into the enum column.
    const visibility = body.visibility === 'private' ? 'private' : 'public'
    /*
     * §G15-10 — "pehle space hoti hai. Iske baad LIST aati hai."
     *
     * A project still wins when one is given, so every existing caller behaves
     * exactly as before. With only a space, the space's hidden container is
     * resolved (or made) and the list goes there — which is what lets the
     * person stop after choosing a Space instead of inventing a Project first.
     */
    if (!body.projectId && !body.spaceId) {
      throw new BadRequestException('a list needs either a projectId or a spaceId')
    }
    const projectId =
      body.projectId ?? (await this.listsService.defaultContainerForSpace(body.spaceId!, user.id))
    return this.listsService.createList(
      projectId,
      { name: body.name, description: body.description, visibility },
      user.id,
    )
  }

  @Post('project/:projectId/reorder')
  async reorderLists(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() body: { orderedIds: string[] },
  ) {
    return this.listsService.reorderLists(projectId, body.orderedIds ?? [], user.id)
  }

  @Put(':listId')
  async updateList(
    @Param('listId') listId: string,
    @CurrentUser() user: any,
    @Body() body: Partial<{ name: string; description: string; visibility: 'public' | 'private' }>,
  ) {
    return this.listsService.updateList(listId, body, user.id)
  }

  /** Move a list into another project (its tasks follow). */
  @Post(':listId/move')
  async moveList(
    @Param('listId') listId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
    @Body() body: { projectId: string },
  ) {
    return this.listsService.moveList(listId, body.projectId, user.id, ip)
  }

  @Delete(':listId')
  async deleteList(@Param('listId') listId: string, @CurrentUser() user: any, @Ip() ip: string) {
    await this.listsService.deleteList(listId, user.id, ip)
    return { message: 'List archived successfully' }
  }
}
