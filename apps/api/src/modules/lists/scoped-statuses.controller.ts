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
import { ScopedStatusesService, type StatusCategory } from './scoped-statuses.service'

type Body_ = { name: string; color?: string; category?: StatusCategory }
type Patch_ = { name?: string; color?: string; category?: StatusCategory }

@ApiTags('space-statuses')
@ApiBearerAuth()
@Controller('spaces/:spaceId/statuses')
// Reading statuses asks the read rule; each write also asks who may shape
// them (`StatusShapeGuard`), which reading never answered.
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class SpaceStatusesController {
  constructor(private statuses: ScopedStatusesService) {}

  @Get()
  list(@Param('spaceId') spaceId: string) {
    return this.statuses.list('space', spaceId)
  }

  @Post()
  @UseGuards(StatusShapeGuard)
  create(@Param('spaceId') spaceId: string, @Body() body: Body_) {
    return this.statuses.create('space', spaceId, body)
  }

  @Patch(':statusId')
  @UseGuards(StatusShapeGuard)
  update(@Param('spaceId') spaceId: string, @Param('statusId') statusId: string, @Body() body: Patch_) {
    return this.statuses.update('space', spaceId, statusId, body)
  }

  @Delete(':statusId')
  @UseGuards(StatusShapeGuard)
  remove(
    @Param('spaceId') spaceId: string,
    @Param('statusId') statusId: string,
    @Query('reassignToStatusId') reassignToStatusId?: string,
  ) {
    return this.statuses.remove('space', spaceId, statusId, reassignToStatusId ?? null)
  }

  @Post('reorder')
  @UseGuards(StatusShapeGuard)
  reorder(@Param('spaceId') spaceId: string, @Body() body: { orderedIds: string[] }) {
    return this.statuses.reorder('space', spaceId, body.orderedIds ?? [])
  }
}

@ApiTags('project-statuses')
@ApiBearerAuth()
@Controller('projects/:projectId/statuses')
// Reading statuses asks the read rule; each write also asks who may shape
// them (`StatusShapeGuard`), which reading never answered.
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ProjectStatusesController {
  constructor(private statuses: ScopedStatusesService) {}

  @Get()
  list(@Param('projectId') projectId: string) {
    return this.statuses.list('project', projectId)
  }

  @Post()
  @UseGuards(StatusShapeGuard)
  create(@Param('projectId') projectId: string, @Body() body: Body_) {
    return this.statuses.create('project', projectId, body)
  }

  @Patch(':statusId')
  @UseGuards(StatusShapeGuard)
  update(@Param('projectId') projectId: string, @Param('statusId') statusId: string, @Body() body: Patch_) {
    return this.statuses.update('project', projectId, statusId, body)
  }

  @Delete(':statusId')
  @UseGuards(StatusShapeGuard)
  remove(
    @Param('projectId') projectId: string,
    @Param('statusId') statusId: string,
    @Query('reassignToStatusId') reassignToStatusId?: string,
  ) {
    return this.statuses.remove('project', projectId, statusId, reassignToStatusId ?? null)
  }

  @Post('reorder')
  @UseGuards(StatusShapeGuard)
  reorder(@Param('projectId') projectId: string, @Body() body: { orderedIds: string[] }) {
    return this.statuses.reorder('project', projectId, body.orderedIds ?? [])
  }
}
