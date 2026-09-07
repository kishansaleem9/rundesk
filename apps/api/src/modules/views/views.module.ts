import { Module } from '@nestjs/common'
import { ViewsService } from './views.service'
import { ViewsController } from './views.controller'
import { ListFiltersService } from './list-filters.service'

@Module({
  providers: [ViewsService, ListFiltersService],
  controllers: [ViewsController],
  exports: [ViewsService, ListFiltersService],
})
export class ViewsModule {}
