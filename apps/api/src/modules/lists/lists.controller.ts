import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ListsService } from './lists.service'

@Controller('lists')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ListsController {
  constructor(private listsService: ListsService) {}

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
