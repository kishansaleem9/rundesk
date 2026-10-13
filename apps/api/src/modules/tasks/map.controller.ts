import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from './types'
import { TasksService } from './tasks.service'

/**
 * A LIST'S MAP VIEW (`commit-log/log-68bc188-1`, `ledger-rows/row-777`): its
 * tasks placed by a Location field. A view of the list, so it asks the list's
 * read rule (`ResourceMemberGuard`) and reads each task as the list does.
 */
@ApiTags('lists')
@ApiBearerAuth()
@Controller('lists/:listId/map')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ListMapController {
  constructor(private tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: "A list's tasks placed by a Location field, and those with no place" })
  map(@Param('listId') listId: string, @CurrentUser() user: CurrentUserPayload, @Query('fieldId') fieldId?: string) {
    return this.tasks.listMap(listId, { id: user.id, role: user.role }, fieldId || undefined)
  }
}
