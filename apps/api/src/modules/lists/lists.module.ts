import { Module } from '@nestjs/common'
import { ListsService } from './lists.service'
import { ListsController } from './lists.controller'
import { ListStatusesService } from './list-statuses.service'
import { ListStatusesController } from './list-statuses.controller'
import { ScopedStatusesService } from './scoped-statuses.service'
import { SpaceStatusesController, ProjectStatusesController } from './scoped-statuses.controller'

@Module({
  providers: [ListsService, ListStatusesService, ScopedStatusesService],
  controllers: [
    ListsController,
    ListStatusesController,
    SpaceStatusesController,
    ProjectStatusesController,
  ],
  exports: [ListsService, ListStatusesService, ScopedStatusesService],
})
export class ListsModule {}
