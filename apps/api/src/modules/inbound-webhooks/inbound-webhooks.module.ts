import { Module } from '@nestjs/common'
import { InboundWebhooksService } from './inbound-webhooks.service'
import { GitCommitLinksService } from './git-commit-links.service'
import { ZoomRecordingsService } from './zoom-recordings.service'
import {
  InboundWebhooksController,
  InboundWebhookReceiverController,
  InboundGitWebhookController,
  InboundZoomWebhookController,
} from './inbound-webhooks.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { TasksModule } from '../tasks/tasks.module'

@Module({
  imports: [DatabaseModule, TasksModule],
  controllers: [
    InboundWebhooksController,
    InboundWebhookReceiverController,
    InboundGitWebhookController,
    InboundZoomWebhookController,
  ],
  // GitCommitLinksService (§12.8) and ZoomRecordingsService (§12.9) back the two
  // new public receivers; both talk to the DB directly (DatabaseModule) and are
  // env-gated on the relevant provider connection.
  providers: [InboundWebhooksService, GitCommitLinksService, ZoomRecordingsService],
})
export class InboundWebhooksModule {}
