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
import { StatusShapeGuard } from './status-shape.guard'
import {
  ListStatusesService,
  type StatusCategory,
} from './list-statuses.service'

@ApiTags('list-statuses')
@ApiBearerAuth()
@Controller('lists/:listId/statuses')
// Reading statuses asks the read rule; each write also asks who may shape
// them (`StatusShapeGuard`), which reading never answered.
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ListStatusesController {
  constructor(private statuses: ListStatusesService) {}

  @Get()
  list(@Param('listId') listId: string) {
    return this.statuses.list(listId)
  }

  @Post()
  @UseGuards(StatusShapeGuard)
  create(
    @Param('listId') listId: string,
    @Body() body: { name: string; color?: string; category?: StatusCategory },
  ) {
    return this.statuses.create(listId, body)
  }

  @Patch(':statusId')
  @UseGuards(StatusShapeGuard)
  update(
    @Param('listId') listId: string,
    @Param('statusId') statusId: string,
    @Body() body: { name?: string; color?: string; category?: StatusCategory },
  ) {
    return this.statuses.update(listId, statusId, body)
  }

  @Delete(':statusId')
  @UseGuards(StatusShapeGuard)
  remove(
    @Param('listId') listId: string,
    @Param('statusId') statusId: string,
    @Query('reassignToStatusId') reassignToStatusId?: string,
  ) {
    return this.statuses.remove(listId, statusId, reassignToStatusId ?? null)
  }

  @Post('reorder')
  @UseGuards(StatusShapeGuard)
  reorder(
    @Param('listId') listId: string,
    @Body() body: { orderedIds: string[] },
  ) {
    return this.statuses.reorder(listId, body.orderedIds ?? [])
  }
}
