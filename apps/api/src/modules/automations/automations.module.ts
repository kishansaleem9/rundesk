import { Module } from '@nestjs/common'
import { AutomationsService } from './automations.service'
import { AutomationsController } from './automations.controller'
import { DatabaseModule } from '../../common/database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
