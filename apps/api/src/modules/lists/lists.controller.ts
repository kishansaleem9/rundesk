import { Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards, BadRequestException } from '@nestjs/common'
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
  async getListsByProject(@Param('projectId') projectId: string) {
    return this.listsService.getListsByProject(projectId)
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

  @Put(':listId')
  async updateList(
    @Param('listId') listId: string,
    @CurrentUser() user: any,
    @Body() body: Partial<{ name: string; description: string }>,
  ) {
    return this.listsService.updateList(listId, body, user.id)
  }

  @Delete(':listId')
  async deleteList(@Param('listId') listId: string, @CurrentUser() user: any) {
    await this.listsService.deleteList(listId, user.id)
    return { message: 'List archived successfully' }
  }
}
