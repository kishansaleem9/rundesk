import { Module } from '@nestjs/common'
import { OpsService } from './ops.service'
import { OpsController } from './ops.controller'
import { DatabaseModule } from '../../common/database/database.module'

@Module({
  imports: [DatabaseModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
