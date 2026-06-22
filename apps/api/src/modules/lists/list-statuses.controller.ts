import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import {
  ListStatusesService,
  type StatusCategory,
} from './list-statuses.service'

@ApiTags('list-statuses')
@ApiBearerAuth()
@Controller('lists/:listId/statuses')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ListStatusesController {
  constructor(private statuses: ListStatusesService) {}

  @Get()
  list(@Param('listId') listId: string) {
    return this.statuses.list(listId)
  }

  @Post()
  create(
    @Param('listId') listId: string,
    @Body() body: { name: string; color?: string; category?: StatusCategory },
  ) {
    return this.statuses.create(listId, body)
  }

  @Patch(':statusId')
  update(
    @Param('listId') listId: string,
    @Param('statusId') statusId: string,
    @Body() body: { name?: string; color?: string; category?: StatusCategory },
  ) {
    return this.statuses.update(listId, statusId, body)
  }

  @Delete(':statusId')
  remove(
    @Param('listId') listId: string,
    @Param('statusId') statusId: string,
    @Query('reassignToStatusId') reassignToStatusId?: string,
  ) {
    return this.statuses.remove(listId, statusId, reassignToStatusId ?? null)
  }

  @Post('reorder')
  reorder(
    @Param('listId') listId: string,
    @Body() body: { orderedIds: string[] },
  ) {
    return this.statuses.reorder(listId, body.orderedIds ?? [])
  }
}
