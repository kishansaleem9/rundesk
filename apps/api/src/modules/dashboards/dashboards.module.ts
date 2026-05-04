import { Module } from '@nestjs/common'
import { DashboardsService } from './dashboards.service'
import { DashboardsController } from './dashboards.controller'

@Module({
  controllers: [DashboardsController],
  providers: [DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
