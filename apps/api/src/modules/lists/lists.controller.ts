import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Ip, UseGuards, BadRequestException } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
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

  @Patch(':listId/status-scope')
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

  @Get(':listId')
  async getList(@Param('listId') listId: string) {
    return this.listsService.getList(listId)
  }

  @Post()
  async createList(@CurrentUser() user: any, @Body() body: { projectId: string; name: string; description?: string }) {
    return this.listsService.createList(
      body.projectId,
      { name: body.name, description: body.description },
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
