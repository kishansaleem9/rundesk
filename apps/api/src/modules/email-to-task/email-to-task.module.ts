import { Module } from '@nestjs/common'
import { EmailToTaskService } from './email-to-task.service'
import { EmailAliasController, InboundEmailController } from './email-to-task.controller'
import { StorageModule } from '../../common/storage/storage.module'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
  imports: [StorageModule, RealtimeModule],
  providers: [EmailToTaskService],
  controllers: [EmailAliasController, InboundEmailController],
  exports: [EmailToTaskService],
})
export class EmailToTaskModule {}
