import { Module } from '@nestjs/common'
import { ListsService } from './lists.service'
import { ListsController } from './lists.controller'
import { ListStatusesService } from './list-statuses.service'
import { ListStatusesController } from './list-statuses.controller'

@Module({
  providers: [ListsService, ListStatusesService],
  controllers: [ListsController, ListStatusesController],
  exports: [ListsService, ListStatusesService],
})
export class ListsModule {}
