import { Module } from '@nestjs/common'
import { InboundWebhooksService } from './inbound-webhooks.service'
import { InboundWebhooksController, InboundWebhookReceiverController } from './inbound-webhooks.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { TasksModule } from '../tasks/tasks.module'

@Module({
  imports: [DatabaseModule, TasksModule],
  controllers: [InboundWebhooksController, InboundWebhookReceiverController],
  providers: [InboundWebhooksService],
})
export class InboundWebhooksModule {}
