import { Module } from '@nestjs/common'
import { ListsService } from './lists.service'
import { ListsController } from './lists.controller'

@Module({
  providers: [ListsService],
  controllers: [ListsController],
  exports: [ListsService],
})
export class ListsModule {}
