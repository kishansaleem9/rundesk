import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ViewsService } from './views.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('views')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class ViewsController {
  constructor(private views: ViewsService) {}

  @Get('lists/:listId/views')
  list(@Param('listId') listId: string) {
    return this.views.listByList(listId)
  }

  @Post('lists/:listId/views')
  create(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name: string; type: 'list' | 'board' | 'calendar' | 'gantt' | 'table'; config?: Record<string, unknown> },
  ) {
    return this.views.create({
      listId,
      name: body.name,
      type: body.type,
      config: body.config,
      createdById: user.id,
    })
  }

  @Patch('views/:viewId')
  update(
    @Param('viewId') viewId: string,
    @Body() body: { name?: string; config?: Record<string, unknown>; position?: number; isDefault?: boolean },
  ) {
    return this.views.update(viewId, body)
  }

  @Delete('views/:viewId')
  remove(@Param('viewId') viewId: string) {
    return this.views.delete(viewId)
  }
}
