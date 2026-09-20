import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { ActivityService } from './activity.service'
import { TaskActivitySearchController } from './activity.controller'

@Module({
  imports: [DatabaseModule],
  controllers: [TaskActivitySearchController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
